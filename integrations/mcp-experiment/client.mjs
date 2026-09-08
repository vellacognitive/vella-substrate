import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createFixtureGate } from "./fixture-gate.mjs";

export async function connectFixture(config) {
  const configPath = join(config.directory, "fixture-config.json");
  await writeFile(configPath, JSON.stringify(config));
  const client = new Client({ name: "vella-feasibility-client", version: "0.0.0" }, {
    versionNegotiation: { mode: { pin: "2026-07-28" } },
  });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("./server.mjs", import.meta.url)), configPath] });
  try { await client.connect(transport); }
  catch (error) { await transport.close(); throw error; }
  return client;
}

export function clientGate(config, client) {
  const gate = createFixtureGate({ ...config, boundary: "client-dispatch" });
  return (tool, args, options = {}) => gate(tool, args, async (effective) => {
    const result = await client.callTool({ name: tool, arguments: effective });
    if (result.isError) throw new Error("remote call did not report success");
    return JSON.parse(result.content[0].text);
  }, options);
}
