import { isFixedFloor, ROOF } from './rooftop.js';

export function spaceCapabilities(floor: string | null | undefined, project: boolean) {
  const office = !!floor && !isFixedFloor(floor) && project;
  return { project: office, whiteboard: office || floor === ROOF, presentation: floor === ROOF };
}
const PROJECT_ACTIONS = new Set(['issues', 'pulls', 'queue', 'services', 'meeting', 'search', 'docs', 'decor', 'waiting']);
export function spaceActionAvailable(id: string, capabilities: ReturnType<typeof spaceCapabilities>): boolean {
  if (id === 'whiteboard') return capabilities.whiteboard;
  if (id === 'presentation') return capabilities.presentation;
  return capabilities.project || !PROJECT_ACTIONS.has(id);
}
export function spacePanelAvailable(id: string, capabilities: ReturnType<typeof spaceCapabilities>): boolean {
  return capabilities.project || id === 'people' || id === 'chat';
}
export const sameMediaSpace = (a: string | null | undefined, b: string | null | undefined) => !!a && a === b;
