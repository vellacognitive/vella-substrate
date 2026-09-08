/* VELLA MCP binding — MIT License — Copyright (c) 2026 Vella Cognitive, LLC */
import { randomUUID } from "node:crypto";
import { actionDigest } from "@vellacognitive/vella-sdk";
import { z } from "zod/v4";
const registrations = new WeakMap();
const META = "com.vellacognitive/governance";

export function describeGovernedTool({ serverId, name, revision, inputSchema, intent, authorityScope }) {
  if (![serverId, name, revision, intent, authorityScope].every(value => typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 1024)) throw new TypeError("explicit tool, server, revision, intent and scope are required");
  const definition = { server: serverId, tool: name, revision, intent, authority_scope: authorityScope,
    input_schema: JSON.parse(JSON.stringify(z.toJSONSchema(inputSchema, { io: "input" }))) };
  return Object.freeze({ definitionDigest: actionDigest(definition), definition });
}

/** All protected registrations use one final handler gate. No mutable SDK handle is exposed. */
export function registerGovernedTool(server, options) {
  const { serverId, name, revision, inputSchema, intent, authorityScope, gate, resolveAction, precondition, handler } = options;
  if (typeof gate?.execute !== "function" || ![resolveAction, precondition, handler].every(f => typeof f === "function")) throw new TypeError("gate, action resolver, precondition and handler are required");
  let registry = registrations.get(server);
  if (!registry) { registry = new Map(); registrations.set(server, registry); }
  if (registry.has(name)) throw new TypeError("duplicate protected tool registration");
  const descriptor = () => describeGovernedTool({ serverId, name, revision, inputSchema, intent, authorityScope });
  const definitionDigest = descriptor().definitionDigest;
  const currentDefinition = () => { try { return descriptor().definitionDigest === definitionDigest; } catch { return false; } };
  registry.set(name, definitionDigest);
  const fail = reason => ({ isError: true, content: [{ type: "text", text: `Vella stopped the call: ${reason}` }],
    _meta: { [META]: { decision: null, eligible: false, outcome: "not_started", reason } } });
  try {
    server.registerTool(name, { description: options.description ?? `Governed ${name}`, inputSchema }, async (args, ctx) => {
      if (ctx.mcpReq.signal.aborted) return fail("CANCELLED_BEFORE_DISPATCH");
      if (Object.keys(ctx.mcpReq.inputResponses ?? {}).length || ctx.mcpReq.droppedInputResponseKeys?.length) return fail("UNSUPPORTED_RESUMED_CALL");
      if (!currentDefinition()) return fail("TOOL_DEFINITION_CHANGED");
      let action;
      try {
        const resolved = await resolveAction(inputSchema.parse(args), ctx);
        action = { server: serverId, tool: name, definition_digest: definitionDigest,
          principal: resolved.principal, resource: resolved.resource, arguments: inputSchema.parse(resolved.arguments) };
      } catch { return fail("ACTION_RESOLUTION_FAILED"); }
      const result = await gate.execute({ action, intent, authorityScope,
        requestId: `${randomUUID()}:${String(ctx.mcpReq.id)}`, signal: ctx.mcpReq.signal,
        precondition: async effective => currentDefinition() && await precondition(effective, ctx),
        invoke: (effective, execution) => handler(effective.arguments, ctx, { ...execution, action: effective }),
      });
      const { value, ...governance } = result;
      if (result.outcome === "reported_success" || result.outcome === "reported_failure") {
        return { ...value, _meta: { ...value?._meta, [META]: governance } };
      }
      return { isError: true, content: [{ type: "text", text: `Vella stopped the call: ${result.reason}; outcome=${result.outcome}` }], _meta: { [META]: governance } };
    });
  } catch (error) { registry.delete(name); throw error; }
  return Object.freeze({ serverId, name, definitionDigest });
}
