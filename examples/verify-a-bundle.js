const fs = require("node:fs");
const path = require("node:path");
const { verify } = require("../verify/verify.js");

const bundle = JSON.parse(
  fs.readFileSync(path.resolve("examples/allowed-bundle.json"), "utf8"),
);
const publicKey = fs.readFileSync(path.resolve("examples/example-signing.pub"), "utf8");

const result = verify(bundle, publicKey);
console.log(result.ok ? "VERIFIED" : "FAILED");
if (!result.ok) {
  console.log(result.errors);
}
