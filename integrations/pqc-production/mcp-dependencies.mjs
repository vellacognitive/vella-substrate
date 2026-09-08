// Reuse the reference package's pinned MCP dependencies during private review.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(new URL('../mcp-server/package.json', import.meta.url));
export const {McpServer} = await import(pathToFileURL(require.resolve('@modelcontextprotocol/server')));
export const {serveStdio} = await import(pathToFileURL(require.resolve('@modelcontextprotocol/server/stdio')));
export const {Client} = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
export const {StdioClientTransport} = await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
