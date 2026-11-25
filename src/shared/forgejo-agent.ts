export const forgeRoles = ['operator', 'supervisor', 'chief'] as const;
export type ForgeRole = typeof forgeRoles[number];
export interface AgentAssignment { tenure: 'permanent' | 'temporary'; role: ForgeRole }
export interface AgentForgeView extends AgentAssignment {
  status: 'ready' | 'pending' | 'none';
  username?: string;
  repository?: string;
  error?: string;
}
export function agentAssignment(input: unknown): AgentAssignment {
  const a = input as Partial<AgentAssignment> | null;
  if (!a || !forgeRoles.includes(a.role!) || (a.tenure !== 'permanent' && a.tenure !== 'temporary'))
    throw Error('Selezionare il ruolo e il tipo di agente');
  return { role: a.role!, tenure: a.tenure };
}
