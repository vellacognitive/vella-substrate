import type {Client} from '@modelcontextprotocol/client';
import type {JsonObject} from '@vellacognitive/vella-sdk';
import type {HybridPublicKeys, PublicKeyRegistry} from '@vellacognitive/vella-sdk/pqc/index.js';
export interface LocalHybridConfig {
  operatorUid: number; serverId: string; reportDirectory: string; proofDirectory: string;
  keyDirectory: string; evidenceStatePath: string; buildHash?: string;
}
export interface ReportArguments {reportId: string; content: string; format?: 'text'}
/** Operator-only helper. Parent directory must already be protected. */
export function setup(directory: string, serverId?: string): Promise<{config:LocalHybridConfig; configPath:string; publicKeys:HybridPublicKeys; registry:PublicKeyRegistry}>;
/** Wait for the prior batch to settle before replacing operator approvals. */
export function approveBatch(config:LocalHybridConfig, requests:ReportArguments[], name?:string): Promise<JsonObject>;
export function connect(configPath:string): Promise<Client>;
