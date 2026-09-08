import fs from 'node:fs';
import {join} from 'node:path';

/** Immutable local verification material; retention duration is operator-managed. */
export async function retainVerificationMaterial({directory, policy, keyStore, profile}) {
  profile.assertJson(policy);
  const policySnapshot = JSON.parse(JSON.stringify(policy));
  const publicTrust = keyStore.status();
  const policyDigest = profile.digest(policySnapshot);
  if (!profile.isDigest(policyDigest)) throw new Error('invalid policy digest');
  const parent = await fs.promises.lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('unsafe proof directory');
  const root = join(directory, 'verification-material');
  await fs.promises.mkdir(root, {mode: 0o700}).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await fs.promises.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw new Error('unsafe verification-material directory');
  async function retain(name, value) {
    const bytes = JSON.stringify(value), path = join(root, name);
    let file;
    try { file = await fs.promises.open(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      file = await fs.promises.open(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600 || info.size !== Buffer.byteLength(bytes) || await file.readFile('utf8') !== bytes) throw new Error('verification material differs from retained artifact');
        await file.sync();
      } finally { await file.close(); }
      return;
    }
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  }
  await retain(`policy.${policyDigest.slice(policyDigest.indexOf(':') + 1)}.json`, policySnapshot);
  await retain(`public-trust.${publicTrust.revision}.json`, publicTrust);
  for (const path of [root, directory]) {
    const file = await fs.promises.open(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { await file.sync(); } finally { await file.close(); }
  }
  return {directory: root, policyDigest, trustRevision: publicTrust.revision, durability: 'file-and-directory-fsync'};
}
