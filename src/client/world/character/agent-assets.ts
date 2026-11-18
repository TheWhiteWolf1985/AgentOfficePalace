import { sanitizeAgentAppearance, type AgentAppearance } from '../../../shared/agent-appearance';
import { loadModel, type ModelName } from '../models';
import { agentVisual } from './agent-visual';

export async function loadAgentVisual(value: AgentAppearance) {
  const appearance = sanitizeAgentAppearance(value);
  if (!appearance) throw new Error('Invalid agent appearance');
  const [body, hair] = await Promise.all([
    loadModel(appearance.model === 'female' ? 'agent_female' : 'agent_male'),
    appearance.hairstyle === 'bald' ? null : loadModel(`hair_${appearance.hairstyle}` as ModelName),
  ]);
  return agentVisual(body.scene, hair?.scene ?? null, appearance);
}
