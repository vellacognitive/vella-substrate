import fs from "node:fs";
import { govern } from "../sdk/node/index.js";

const signingKey = fs.readFileSync("/tmp/example-signing.key", "utf8");

const result = govern({
  intent: "EXECUTE_CHANGE",
  evidenceMask: 1,
  proof: { signingKey },
});

console.log(JSON.stringify(result, null, 2));
