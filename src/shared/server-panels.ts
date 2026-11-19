/** Physical order starts at the elevator; Blender numbers run in the opposite direction. */
export const SERVER_PANELS = [
  { id: 'machine', surface: 'server_v12_whiteboard_surface_003', title: "VM status" },
  { id: 'console', surface: 'server_v12_whiteboard_surface_002', title: "VM console" },
  { id: 'docker', surface: 'server_v12_whiteboard_surface_001', title: "Docker services" },
] as const;
export type ServerPanelId = typeof SERVER_PANELS[number]['id'];
export interface DockerContainer {
  id: string; name: string; image: string; project?: string; service?: string;
  state: string; status: string; health?: string;
}
export interface ServerPanelState {
  at: number;
  machine: { cpu: number; cores: number; memUsed: number; memTotal: number;
    disk?: { path: string; total: number; used: number; available: number }; diskError?: string;
    history: [number, number, number][] };
  docker: { state: 'ready' | 'missing' | 'unavailable'; containers: DockerContainer[]; message?: string };
  console: { configured: boolean; active: boolean; lines: string[] };
}
