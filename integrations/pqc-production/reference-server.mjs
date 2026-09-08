import {readFile, lstat, open} from 'node:fs/promises';
import {join} from 'node:path';
import {McpServer, serveStdio} from './mcp-dependencies.mjs';
import {createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider} from '../../sdk/node/index.js';
import {registerGovernedTool} from '../mcp-server/index.js';
import {reportPolicy, reportRegistration} from '../mcp-server/example/report-workflow.mjs';
import {HYBRID_PROFILE} from './profile.mjs';
import {openLocalKeyStore} from './local-keys.mjs';
import {withAdmissionLimit} from './admission.mjs';
import {retainVerificationMaterial} from './archive-material.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (config.operatorUid !== process.getuid()) throw new Error('operator UID mismatch');
const keys = await openLocalKeyStore({directory: config.keyDirectory});
process.once('exit', () => { try { keys.close(); } catch { /* Stale locks require explicit recovery. */ } });
process.once('SIGTERM', () => process.exit(0));
await retainVerificationMaterial({directory: config.proofDirectory, policy: reportPolicy, keyStore: keys, profile: HYBRID_PROFILE});
const sink = createLocalProofSink({directory: config.proofDirectory, proofProfile: HYBRID_PROFILE});
const evidenceProvider = createOperatorEvidenceProvider({loadState: async () => JSON.parse(await readFile(config.evidenceStatePath, 'utf8'))});
serveStdio(() => {
  const server = new McpServer({name: config.serverId, version: '0.0.0-review'});
  const gate = withAdmissionLimit(createExecutionGate({policy: reportPolicy, proofProfile: HYBRID_PROFILE,
    keyProvider: keys, evidenceProvider, proofSink: sink, timeoutMs: 30000}), {capacity: 8, receiptKind: HYBRID_PROFILE.receiptKind});
  for (const name of ['exportReport', 'ExportReport']) {
    registerGovernedTool(server, {...reportRegistration(config.serverId, name), gate,
      resolveAction: args => ({principal: {id: `local-uid:${config.operatorUid}`}, resource: {id: `report:${args.reportId}`, version: 'absent'}, arguments: args}),
      precondition: async action => {
        try { await lstat(join(config.reportDirectory, `${action.arguments.reportId}.txt`)); return false; }
        catch (error) { if (error.code === 'ENOENT') return true; throw error; }
      },
      handler: async args => {
        const file = await open(join(config.reportDirectory, `${args.reportId}.txt`), 'wx', 0o600);
        try { await file.writeFile(args.content, 'utf8'); await file.sync(); } finally { await file.close(); }
        return {content: [{type: 'text', text: `Exported ${args.reportId} as ${args.format}`}]};
      },
    });
  }
  return server;
}, {legacy: 'reject'});
