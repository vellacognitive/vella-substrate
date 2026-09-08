import {readFile, lstat, open} from 'node:fs/promises';
import {join} from 'node:path';
import {McpServer} from '@modelcontextprotocol/server';
import {createExecutionGate, createLocalProofSink, createOperatorEvidenceProvider} from '@vellacognitive/vella-sdk';
import {registerGovernedTool} from '../../index.js';
import {reportPolicy, reportRegistration} from '../report-workflow.mjs';
import {HYBRID_PROFILE} from '@vellacognitive/vella-sdk/pqc/index.js';
import {openLocalKeyStore} from '@vellacognitive/vella-sdk/pqc/index.js';
import {withAdmissionLimit} from './admission.mjs';
import {retainVerificationMaterial} from '@vellacognitive/vella-sdk/pqc/index.js';


/** Trusted embedding dependencies; never selected by MCP arguments. */
export async function createLocalHybridReference(config, dependencies = {}) {
  if (config.operatorUid !== process.getuid()) throw new Error('operator UID mismatch');
  const keys = await openLocalKeyStore({directory: config.keyDirectory});
  try {
  await retainVerificationMaterial({directory: config.proofDirectory, policy: reportPolicy, keyStore: keys, profile: HYBRID_PROFILE});
  const localSink = createLocalProofSink({directory: config.proofDirectory, proofProfile: HYBRID_PROFILE});
  const sink = dependencies.proofSink ? dependencies.proofSink(localSink) : localSink;
  const keyProvider = dependencies.keyProvider ? dependencies.keyProvider(keys) : keys;
  const evidenceProvider = createOperatorEvidenceProvider({loadState: async () => JSON.parse(await readFile(config.evidenceStatePath, 'utf8'))});
  const createServer = () => {
    const server = new McpServer({name: config.serverId, version: '1.1.0'});
    const gate = withAdmissionLimit(createExecutionGate({policy: reportPolicy, proofProfile: HYBRID_PROFILE,
      keyProvider, evidenceProvider, proofSink: sink, buildHash: config.buildHash ?? null, timeoutMs: 30000}), {capacity: 8, receiptKind: HYBRID_PROFILE.receiptKind});
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
  };
  return {createServer, close: () => keys.close()};
  } catch (error) { keys.close(); throw error; }
}
