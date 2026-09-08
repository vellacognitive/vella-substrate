/* VELLA SDK — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { snapshotProofProfile } from "./proof-profile.js";

/** Existing operator-owned directory on a local POSIX filesystem. */
export function createLocalProofSink({ directory, proofProfile }) {
  const profile = snapshotProofProfile(proofProfile);
  const root = resolve(directory);
  async function retain(attemptId, suffix, value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attemptId)) throw new TypeError("invalid attempt ID");
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("proof directory must be a real directory");
    const path = join(root, `${attemptId}.${suffix}.json`);
    const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await file.writeFile(JSON.stringify(value), "utf8"); await file.sync(); }
    finally { await file.close(); }
    // Persist the new directory entry and its existing parent linkage. This is
    // an fsync acknowledgment, not a promise about arbitrary hardware failure.
    for (const path of [root, dirname(root)]) {
      const folder = await open(path, constants.O_RDONLY);
      try { await folder.sync(); } finally { await folder.close(); }
    }
    return { path, durability: "file-and-directory-fsync" };
  }
  return Object.freeze({
    proofProfileId: profile.id,
    async retainAuthorization({ attemptId, bundle }) {
      return { ...await retain(attemptId, "authorization", bundle), payloadHash: bundle.payload_hash };
    },
    async retainReceipt({ attemptId, receipt }) {
      return { ...await retain(attemptId, "receipt", receipt), receiptDigest: profile.digest(receipt) };
    },
  });
}
