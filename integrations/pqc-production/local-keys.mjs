import fs from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {randomUUID, createPublicKey, createHash} from 'node:crypto';
import proof from './proof.cjs';
import contract from './record.cjs';
import bounded from './bounded-json.cjs';
import {matchesArchiveContext} from './archive-trust.cjs';

const stores = new Set();
const ALGS = ['ecdsa-p256-sha256', 'ml-dsa-65'];
const KIND = 'vella_local_hybrid_keys_draft1';
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function fields(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== names.length || names.some(k => !Object.hasOwn(value, k))) throw new Error('KEY_STATE_INVALID');
}
function time(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 8e15) throw new Error('KEY_CLOCK_INVALID'); return value; }
function years(value, n) { const date = new Date(value); date.setUTCFullYear(date.getUTCFullYear() + n); return time(date.getTime()); }
function identify(publicKeys) {
  fields(publicKeys, ALGS);
  return Object.fromEntries(ALGS.map(alg => {
    const pem = publicKeys[alg];
    if (typeof pem !== 'string' || Buffer.byteLength(pem) > 8192) throw new Error('KEY_INPUT_LIMIT');
    const key = createPublicKey(pem);
    if (alg === 'ml-dsa-65' ? key.asymmetricKeyType !== alg : key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('KEY_ALGORITHM_INVALID');
    return [alg, 'sha384:' + createHash('sha384').update(key.export({format: 'der', type: 'spki'})).digest('hex')];
  }));
}
function probe(now) {
  return {envelope_id: 'key-validation', request_id: randomUUID(), intent: 'KEY_VALIDATION', authority_scope: 'local-keys',
    policy_version: 'key-validation', requested_policy_version: null, policy_digest: contract.digest({purpose: 'key-validation'}),
    evidence_mask: 0, decision: 'ALLOWED', reason_code: 'POLICY_SATISFIED', timestamp: new Date(now).toISOString(),
    action: null, action_digest: null, evidence: null, boundary: 'evaluation', build_hash: null, external_effects: false, digest_profile: proof.PROFILE};
}
function validateState(value, now) {
  bounded.assertRecordJson(value);
  fields(value, ['kind', 'revision', 'active', 'history']);
  if (value.kind !== KIND || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.history) || value.history.length > 256) throw new Error('KEY_STATE_INVALID');
  const ids = new Set(), fingerprints = new Set();
  for (const entry of value.history) {
    fields(entry, ['id', 'publicKeys', 'keyIds', 'activatedAt', 'notAfter', 'retentionTargetUntil', 'status', 'changedAt']);
    if (typeof entry.id !== 'string' || !/^[0-9a-f-]{36}$/.test(entry.id) || ids.has(entry.id) || !['active', 'retired', 'revoked'].includes(entry.status)) throw new Error('KEY_STATE_INVALID');
    ids.add(entry.id);
    time(entry.activatedAt); time(entry.changedAt);
    if (entry.changedAt < entry.activatedAt || entry.notAfter !== years(entry.activatedAt, 1) || entry.retentionTargetUntil !== years(entry.notAfter, 7)) throw new Error('KEY_LIFETIME_INVALID');
    if (contract.digest(identify(entry.publicKeys)) !== contract.digest(entry.keyIds)) throw new Error('KEY_ID_MISMATCH');
    for (const id of Object.values(entry.keyIds)) { if (fingerprints.has(id)) throw new Error('KEY_REUSE_REJECTED'); fingerprints.add(id); }
  }
  const active = value.history.filter(e => e.status === 'active');
  if (value.active === null) { if (active.length) throw new Error('KEY_STATE_INVALID'); }
  else {
    fields(value.active, ['id', 'privateKeys']);
    if (active.length !== 1 || active[0].id !== value.active.id) throw new Error('KEY_STATE_INVALID');
    const signed = proof.sign(probe(now), value.active.privateKeys, proof.SUITE);
    if (!proof.verify(signed, active[0].publicKeys, proof.SUITE).ok) throw new Error('KEY_PAIR_MISMATCH');
  }
  return freeze(value);
}

/** Single operator-controlled writer process. No OS compromise/rollback guarantee. */
export async function openLocalKeyStore({directory, initialize = false, now = Date.now}) {
  const root = resolve(directory), filename = join(root, 'state.json');
  const lockPath = join(root, '.writer-lock'), lockToken = randomUUID();
  if (stores.has(root)) throw new Error('KEY_STORE_ALREADY_OPEN');
  stores.add(root);
  let state, closed = false, busy = false, faulted = false, lockHeld = false, lastTime = -1;
  function releaseLock() {
    if (!lockHeld) return;
    const file = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(file);
      if (!stat.isFile() || stat.size > 1024 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw new Error('KEY_LOCK_UNSAFE');
      const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (lock.token !== lockToken) throw new Error('KEY_LOCK_CHANGED');
    } finally { fs.closeSync(file); }
    fs.unlinkSync(lockPath); lockHeld = false;
  }
  const currentTime = () => { const t = time(now()); if (t < lastTime) { faulted = true; throw new Error('KEY_CLOCK_REGRESSED'); } lastTime = t; return t; };
  function live() { if (closed || faulted || busy) throw new Error('KEY_STORE_UNAVAILABLE'); }
  async function directoryCheck() {
    const stat = await fs.promises.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('KEY_DIRECTORY_UNSAFE');
  }
  async function readState() {
    await directoryCheck();
    const file = await fs.promises.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > bounded.LIMITS.bytes) throw new Error('KEY_FILE_UNSAFE');
      return bounded.parse(await file.readFile('utf8'));
    } finally { await file.close(); }
  }
  async function persist(next, first = false) {
    let temporary;
    try {
      await directoryCheck();
      if (!first) {
        const disk = await readState();
        if (contract.digest(disk) !== contract.digest(state)) throw new Error('KEY_STATE_CHANGED_EXTERNALLY');
      }
      temporary = join(root, `.state-${randomUUID()}.tmp`);
      const file = await fs.promises.open(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); }
      if (first) {
        // Link exclusively so initialization never overwrites an existing state.
        await fs.promises.link(temporary, filename);
        await fs.promises.unlink(temporary);
      } else await fs.promises.rename(temporary, filename);
      temporary = undefined;
      for (const path of [root, dirname(root)]) {
        const folder = await fs.promises.open(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try { await folder.sync(); } finally { await folder.close(); }
      }
      state = next;
    } catch (error) {
      // An error after rename may have persisted a new revision. Block old snapshots.
      faulted = true;
      throw error;
    } finally { if (temporary) await fs.promises.unlink(temporary).catch(() => {}); }
  }
  try {
    currentTime();
    if (initialize) await fs.promises.mkdir(root, {mode: 0o700}).catch(error => { if (error.code !== 'EEXIST') throw error; });
    await directoryCheck();
    const lockFile = await fs.promises.open(lockPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600)
      .catch(error => { if (error.code === 'EEXIST') throw new Error('KEY_STORE_LOCKED: stop the writer; recover a stale lock explicitly'); throw error; });
    lockHeld = true;
    try { await lockFile.writeFile(JSON.stringify({pid: process.pid, token: lockToken})); await lockFile.sync(); }
    finally { await lockFile.close(); }
    try { state = validateState(await readState(), currentTime()); }
    catch (error) {
      if (!initialize || error.code !== 'ENOENT') throw error;
      state = freeze({kind: KIND, revision: 0, active: null, history: []});
      await persist(state, true);
    }
  } catch (error) { if (lockHeld) { try { releaseLock(); } catch { /* A partial lock requires explicit recovery. */ } } stores.delete(root); throw error; }

  function metadata() { return freeze({kind: KIND, revision: state.revision, activeId: state.active?.id ?? null, history: clone(state.history)}); }
  async function change(update) {
    live(); busy = true;
    try {
      const next = clone(state), at = currentTime();
      update(next, at);
      next.revision++;
      await persist(validateState(next, at));
      return metadata();
    } finally { busy = false; }
  }
  return Object.freeze({
    status() { live(); return metadata(); },
    async rotate({keys} = {}) {
      return change((next, at) => {
        if (next.history.length >= 256) throw new Error('KEY_HISTORY_CAPACITY');
        const pair = keys ?? proof.generateKeys(proof.SUITE);
        bounded.assertRecordJson(pair); fields(pair, ['privateKeys', 'publicKeys']);
        for (const e of next.history) if (e.status === 'active') { e.status = 'retired'; e.changedAt = at; }
        const id = randomUUID();
        next.active = {id, privateKeys: clone(pair.privateKeys)};
        next.history.push({id, publicKeys: clone(pair.publicKeys), keyIds: identify(pair.publicKeys), activatedAt: at,
          notAfter: years(at, 1), retentionTargetUntil: years(years(at, 1), 7), status: 'active', changedAt: at});
      });
    },
    async revoke(id) {
      return change((next, at) => {
        const entry = next.history.find(e => e.id === id);
        if (!entry || entry.status === 'revoked') throw new Error('KEY_REVOCATION_INVALID');
        entry.status = 'revoked'; entry.changedAt = at;
        if (next.active?.id === id) next.active = null;
      });
    },
    capture() {
      live(); const at = currentTime(), snapshot = state;
      const entry = snapshot.history.find(e => e.id === snapshot.active?.id);
      if (!entry || entry.status !== 'active' || at < entry.activatedAt || at >= entry.notAfter) throw new Error('KEY_NOT_ACTIVE');
      function assertCurrent() {
        live(); const current = currentTime();
        if (state !== snapshot || current < entry.activatedAt || current >= entry.notAfter) throw new Error('KEYS_CHANGED');
      }
      const signer = Object.freeze({sign(record) { assertCurrent(); return proof.sign(record, snapshot.active.privateKeys, proof.SUITE); }});
      const verifier = Object.freeze({verify(bundle) { return proof.verify(bundle, entry.publicKeys, proof.SUITE); }});
      return Object.freeze({revision: snapshot.revision, keySetId: entry.id, audit: Object.freeze({key_set_id: entry.id, key_revision: snapshot.revision}), signingKey: signer, publicKey: verifier, assertCurrent});
    },
    verifyHistorical(bundle, {keySetId, policy} = {}) {
      live(); currentTime();
      if (policy !== 'report-current-trust-state') throw new Error('EXPLICIT_ARCHIVE_POLICY_REQUIRED');
      const entry = state.history.find(e => e.id === keySetId);
      if (!entry) return {ok: false, errors: ['UNKNOWN_ARCHIVE_KEY'], warnings: []};
      const result = proof.verify(bundle, entry.publicKeys, proof.SUITE);
      if (result.ok && !matchesArchiveContext(result.authenticated, entry.id, state.revision)) return {ok: false, errors: ['E_PQ_TRUST_BINDING'], warnings: [], trustedForNewExecution: false};
      return {...result, keyStatus: entry.status === 'active' && currentTime() >= entry.notAfter ? 'expired' : entry.status, trustedForNewExecution: false,
        warnings: [...result.warnings, 'Signature validity does not prove signing time or pre-compromise existence; no execution authority']};
    },
    close() { if (closed) return; if (busy) throw new Error('KEY_STORE_BUSY'); closed = true; stores.delete(root); releaseLock(); },
  });
}

/** Operator-confirmed crash recovery; never steal a live process's lock. */
export async function recoverLocalKeyLock({directory, expectedPid, expectedRevision, confirmStopped}) {
  const root = resolve(directory), lockPath = join(root, '.writer-lock');
  if (confirmStopped !== true || !Number.isSafeInteger(expectedPid) || expectedPid < 1 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || stores.has(root)) throw new Error('EXPLICIT_LOCK_RECOVERY_REQUIRED');
  const folder = await fs.promises.lstat(root);
  if (!folder.isDirectory() || folder.isSymbolicLink() || folder.uid !== process.getuid() || (folder.mode & 0o777) !== 0o700) throw new Error('KEY_DIRECTORY_UNSAFE');
  async function read(path, limit) {
    const file = await fs.promises.open(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > limit || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1) throw new Error('KEY_FILE_UNSAFE');
      return {stat, value: bounded.parse(await file.readFile('utf8'), limit)};
    } finally { await file.close(); }
  }
  const lock = await read(lockPath, 1024);
  if (lock.value.pid !== expectedPid) throw new Error('KEY_LOCK_CHANGED');
  try { process.kill(expectedPid, 0); throw new Error('KEY_WRITER_STILL_ALIVE'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  const disk = await read(join(root, 'state.json'), bounded.LIMITS.bytes);
  if (disk.value.revision !== expectedRevision) throw new Error('KEY_REVISION_CHANGED');
  const current = await fs.promises.lstat(lockPath);
  if (current.dev !== lock.stat.dev || current.ino !== lock.stat.ino) throw new Error('KEY_LOCK_CHANGED');
  await fs.promises.unlink(lockPath);
  const dir = await fs.promises.open(root, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { await dir.sync(); } finally { await dir.close(); }
}
