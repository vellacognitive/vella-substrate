import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createFixtureGate, registry, serverId, toolSchema } from "./fixture-gate.mjs";

// Configuration is supplied by the trusted test harness, not an MCP request.
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
serveStdio(() => {
  const server = new McpServer({ name: serverId, version: "0.0.0" });
  const gate = createFixtureGate({ ...config, boundary: "server-handler" });
  for (const tool of Object.keys(registry)) {
    server.registerTool(tool, { inputSchema: toolSchema, description: "Local governed report export fixture" }, async (args, ctx) => {
      const invoke = async (effective) => {
        const output = join(config.directory, `${effective.reportId}.txt`);
        await writeFile(output, effective.content, { flag: "wx", mode: 0o600 });
        return { reportId: effective.reportId, format: effective.format };
      };
      const result = config.serverGate === false
        ? { outcome: "reported_success", output: await invoke(toolSchema.parse(args)), boundary: "unguarded-fixture" }
        : await gate(tool, args, invoke, { signal: ctx.mcpReq.signal });
      return { isError: result.outcome !== "reported_success", content: [{ type: "text", text: JSON.stringify(result) }] };
    });
  }
  return server;
}, { legacy: "reject" });
