import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectFixture, clientGate } from "./client.mjs";

for (const boundary of ["server-handler", "client-dispatch"]) {
  for (const evidenceMask of [1, 3]) {
    const directory = await mkdtemp(join(tmpdir(), "vella-mcp-demo-"));
    let client;
    try {
      client = await connectFixture({ directory, evidenceMask, serverGate: boundary === "server-handler" });
      await client.listTools();
      const args = { reportId: "demo", content: "Governed local report" };
      const result = boundary === "server-handler"
        ? JSON.parse((await client.callTool({ name: "exportReport", arguments: args })).content[0].text)
        : await clientGate({ directory, evidenceMask }, client)("exportReport", args);
      const files = await readdir(directory);
      console.log(JSON.stringify({
        boundary, decision: result.decision, eligible: result.eligible, outcome: result.outcome,
        reportFiles: files.filter(name => name.endsWith(".txt")).length,
        proofFiles: files.filter(name => name.endsWith(".proof.json")).length,
        content: files.includes("demo.txt") ? await readFile(join(directory, "demo.txt"), "utf8") : null,
        experimental: true,
      }));
    } finally {
      await client?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
}
