import fs from "node:fs";
import { govern } from "../sdk/node/index.js";

const SIGNING_KEY_PATH = "/tmp/example-signing.key";

if (!fs.existsSync(SIGNING_KEY_PATH)) {
  console.error(`VELLA quickstart: signing key not found at ${SIGNING_KEY_PATH}`);
  console.error(``);
  console.error(`Generate one with:`);
  console.error(`  openssl ecparam -name prime256v1 -genkey -noout -out ${SIGNING_KEY_PATH}`);
  console.error(``);
  console.error(`See examples/walkthrough.md for the full walkthrough.`);
  process.exit(1);
}

const signingKey = fs.readFileSync(SIGNING_KEY_PATH, "utf8");

const result = govern({
  intent: "EXECUTE_CHANGE",
  evidenceMask: 1,
  proof: { signingKey },
});

console.log(JSON.stringify(result, null, 2));
