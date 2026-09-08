// Research fixture only. Neither candidate is a public Vella proof format.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import canonicalize from "canonicalize";

const privateKey = readFileSync(new URL("../../sdk/node/test/fixtures/test-signing-private.pem", import.meta.url));
const publicKey = readFileSync(new URL("../../sdk/node/test/fixtures/test-signing-public.pem", import.meta.url));
const types = new Set(["vella-experiment/jcs", "vella-experiment/bytes"]);

// DSSE-style pre-authentication encoding binds interpretation and exact bytes.
function pae(type, bytes) {
  return Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${bytes.length} `), bytes]);
}

export function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

export function signCandidate(value, mode = "bytes") {
  const payloadType = `vella-experiment/${mode}`;
  if (!types.has(payloadType)) throw new TypeError("unknown experimental format");
  const bytes = Buffer.from(mode === "jcs" ? canonicalize(value) : JSON.stringify(value));
  return {
    payloadType,
    payload: bytes.toString("base64"),
    signature: crypto.sign("sha256", pae(payloadType, bytes), privateKey).toString("base64"),
  };
}

export function verifyCandidate(record) {
  if (!types.has(record.payloadType)) throw new Error("unsupported experimental type");
  const bytes = Buffer.from(record.payload, "base64");
  if (!crypto.verify("sha256", pae(record.payloadType, bytes), publicKey, Buffer.from(record.signature, "base64"))) {
    throw new Error("invalid experimental signature");
  }
  const verified = JSON.parse(bytes.toString("utf8"));
  if (record.payloadType === "vella-experiment/jcs" && canonicalize(verified) !== bytes.toString("utf8")) {
    throw new Error("noncanonical experimental payload");
  }
  return verified;
}
