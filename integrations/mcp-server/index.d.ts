import type { McpServer, ServerContext, CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod/v4";
import type { JsonObject, EffectiveAction, ExecutionGate, ExecutionContext } from "@vellacognitive/vella-sdk";
export interface ToolDefinition<A extends JsonObject> {
  serverId: string; name: string; revision: string; inputSchema: z.ZodType<A>; intent: string; authorityScope: string;
}
export function describeGovernedTool<A extends JsonObject>(options: ToolDefinition<A>): Readonly<{ definitionDigest: string; definition: JsonObject }>;
export interface GovernedToolOptions<A extends JsonObject> extends ToolDefinition<A> {
  description?: string;
  gate: ExecutionGate;
  resolveAction(args: A, context: ServerContext): { principal: EffectiveAction["principal"]; resource: EffectiveAction["resource"]; arguments: A } | Promise<{ principal: EffectiveAction["principal"]; resource: EffectiveAction["resource"]; arguments: A }>;
  precondition(action: EffectiveAction, context: ServerContext): boolean | Promise<boolean>;
  handler(args: A, context: ServerContext, execution: ExecutionContext & { action: EffectiveAction }): CallToolResult | Promise<CallToolResult>;
}
export function registerGovernedTool<A extends JsonObject>(server: McpServer, options: GovernedToolOptions<A>): Readonly<{ serverId: string; name: string; definitionDigest: string }>;
