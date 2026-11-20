/** Public connection metadata. Secrets never form part of this contract. */
import type { AgentAppearance } from './agent-appearance.js';
import type { WorkerInfo, ProjectInfo, AgentProvider, AgentEffort } from './protocol.js';
export type GitProvider = 'github' | 'forgejo';
export interface GitServer { id: string; name: string; provider: GitProvider; url: string }
export interface GitAccount { id: string; serverId: string; name: string; username: string; verifiedAt?: number; error?: string }
export interface GitRepository { name: string; description: string; private: boolean; cloneUrl: string; webUrl: string; permissions: { read: boolean; write: boolean; admin: boolean } }
export interface GitBinding {
  dir: string; floorId: string; accountId: string; repository: string;
  agents: Record<string, { accountId?: string }>;
}
export interface GitConnectionsState { servers: GitServer[]; accounts: GitAccount[]; bindings: GitBinding[] }
export interface ConnectionFloor { id: string; name: string; dir: string; workers: WorkerInfo[]; project: ProjectInfo }
export type CodexIdentity = { method: 'chatgpt'; email?: string } | { method: 'api-key' };
export type CodexAccount = CodexIdentity | 'signed-out' | 'unknown';
export interface CodexAccounts { configured: CodexAccount; active: CodexAccount | 'stopped' }
export interface ConnectionsView extends GitConnectionsState { floors: ConnectionFloor[]; admin: boolean; codexDocker?: boolean; codexAccounts?: Record<string, CodexAccounts> }
export interface WorkerConfiguration { appearance?: AgentAppearance | 'random'; name: string; color: string; deskId: string; provider?: AgentProvider; model?: string; effort?: AgentEffort; prompt?: string; restart?: boolean }
