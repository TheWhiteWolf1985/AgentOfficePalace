/** Public connection metadata. Secrets never form part of this contract. */
import type { WorkerInfo, ProjectInfo, AgentProvider, AgentEffort } from './protocol.js';
export type GitProvider = 'github' | 'forgejo';
export const CONNECTION_ROLES = ['lettura', 'caporedattore', 'capoanalista', 'capoeditore'] as const;
export type ConnectionRole = typeof CONNECTION_ROLES[number];
export interface GitServer { id: string; name: string; provider: GitProvider; url: string }
export interface GitAccount { id: string; serverId: string; name: string; username: string; verifiedAt?: number; error?: string }
export interface GitRepository { name: string; description: string; private: boolean; cloneUrl: string; webUrl: string; permissions: { read: boolean; write: boolean; admin: boolean } }
export interface GitBinding {
  dir: string; floorId: string; accountId: string; repository: string; controlled: boolean;
  roles: Partial<Record<ConnectionRole, string>>;
  agents: Record<string, { role: ConnectionRole; accountId?: string }>;
}
export interface GitConnectionsState { servers: GitServer[]; accounts: GitAccount[]; bindings: GitBinding[] }
export interface ConnectionFloor { id: string; name: string; dir: string; workers: WorkerInfo[]; project: ProjectInfo }
export interface ConnectionsView extends GitConnectionsState { floors: ConnectionFloor[]; admin: boolean }
export interface WorkerConfiguration { name: string; color: string; deskId: string; provider?: AgentProvider; model?: string; effort?: AgentEffort; prompt?: string; restart?: boolean }
