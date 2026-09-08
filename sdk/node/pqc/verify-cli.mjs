#!/usr/bin/env node
// v3 archive CLI. Explicit historical verification, never an execution token.
import fs from 'node:fs';
import {TextDecoder} from 'node:util';
import bounded from './bounded-json.cjs';
import proof from './proof.cjs';
import {matchesArchiveContext} from './archive-trust.cjs';
async function read(path, max, trusted = false) {
  const file = await fs.promises.open(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > max || (trusted && (stat.uid !== process.getuid() || (stat.mode & 0o022)))) throw new Error('unsafe or oversized file');
    const bytes = Buffer.alloc(max + 1);
    let length = 0;
    while (length < bytes.length) {
      const {bytesRead} = await file.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > max) throw new Error('file grew beyond limit');
    return bounded.parse(new TextDecoder('utf8', {fatal: true, ignoreBOM: true}).decode(bytes.subarray(0, length)), max);
  } finally { await file.close(); }
}
try {
  const [path, trustPath, id, suite, ...extra] = process.argv.slice(2);
  if (!path || !trustPath || !id || suite !== proof.SUITE || extra.length) throw new Error('explicit proof, public trust, key-set ID and required hybrid suite needed');
  const bundle = await read(path, 2 * 1024 * 1024), trust = await read(trustPath, 1024 * 1024, true);
  bounded.assertRecordJson(trust);
  if (trust.kind !== 'vella_local_hybrid_keys_v1' || !Number.isSafeInteger(trust.revision) || trust.revision < 0 || !Array.isArray(trust.history) || trust.history.length > 256 || !Object.hasOwn(trust, 'activeId') || Object.keys(trust).length !== 4) throw new Error('invalid public trust registry');
  const matches = trust.history.filter(entry => entry.id === id);
  if (matches.length !== 1 || !['active', 'retired', 'revoked'].includes(matches[0].status)) throw new Error('unrecognized historical key');
  const entry = matches[0], result = proof.verify(bundle, entry.publicKeys, suite);
  if (result.ok && !matchesArchiveContext(result.authenticated, id, trust.revision)) throw new Error('historical trust binding mismatch');
  const output = {...result, keySetId: id, keyStatus: entry.status, trustRevision: trust.revision, trustedForNewExecution: false,
    warnings: [...result.warnings, 'Reports the supplied trust snapshot; no trusted signing time or pre-compromise assurance']};
  process.stdout.write(JSON.stringify(output) + '\n'); process.exitCode = result.ok ? 0 : 1;
} catch {
  process.stdout.write(JSON.stringify({ok: false, errors: ['E_PQ_VERIFY_INPUT'], warnings: [], trustedForNewExecution: false}) + '\n'); process.exitCode = 1;
}
