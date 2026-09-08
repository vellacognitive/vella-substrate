/** Operator-only reference setup and approvals. Never expose through MCP tools. */
import {mkdir, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {HYBRID_PROFILE, openLocalKeyStore} from '@vellacognitive/vella-sdk/pqc/index.js';
import {reportAction, reportPolicy} from '../report-workflow.mjs';
import {connect as connectReference} from '../local-harness.mjs';
import {fileURLToPath} from 'node:url';

export async function setup(directory, serverId = 'vella-hybrid-reports') {
  const config = {operatorUid: process.getuid(), serverId, reportDirectory: join(directory, 'reports'),
    proofDirectory: join(directory, 'proofs'), keyDirectory: join(directory, 'keys'), evidenceStatePath: join(directory, 'evidence.json')};
  for (const path of [config.reportDirectory, config.proofDirectory]) await mkdir(path, {mode: 0o700});
  const keys = await openLocalKeyStore({directory: config.keyDirectory, initialize: true});
  let registry;
  try { registry = await keys.rotate(); } finally { keys.close(); }
  await writeFile(config.evidenceStatePath, '{}', {mode: 0o600, flag: 'wx'});
  const configPath = join(directory, 'config.json');
  await writeFile(configPath, JSON.stringify(config), {mode: 0o600, flag: 'wx'});
  return {config, configPath, publicKeys: registry.history[0].publicKeys, registry};
}

export async function approveBatch(config, requests, name = 'exportReport') {
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > 64) throw new TypeError('approve 1..64 exact actions per batch');
  const principalId = `local-uid:${config.operatorUid}`, expiresAt = Date.now() + 60000, digest = HYBRID_PROFILE.digest;
  const actions = requests.map(args => reportAction({serverId: config.serverId, principalId, arguments: args, name, digest}));
  if (new Set(actions.map(digest)).size !== actions.length) throw new TypeError('duplicate action approval');
  const state = {session: {id: 'local-session', principalId, expiresAt, revoked: false},
    permissions: actions.map((action, i) => ({id: `permission-${i}`, principalId, server: config.serverId, tool: name, resourceId: action.resource.id, expiresAt, revoked: false})),
    approvals: actions.map(action => ({id: `approval-${action.arguments.reportId}`, principalId, actionDigest: digest(action), policyDigest: digest(reportPolicy), expiresAt, revoked: false}))};
  const temporary = `${config.evidenceStatePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), {mode: 0o600, flag: 'wx'});
  await rename(temporary, config.evidenceStatePath);
  return state;
}
export function connect(configPath) {
  return connectReference(configPath, fileURLToPath(new URL('./reference-server.mjs', import.meta.url)));
}
