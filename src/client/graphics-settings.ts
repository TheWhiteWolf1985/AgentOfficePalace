export type GraphicsQuality = 'high' | 'balanced' | 'economy';
export type RenderRate = 0 | 30 | 60;
export interface GraphicsSettings { quality: GraphicsQuality; fps: RenderRate }
const KEY = 'agent-office.graphics';
const listeners = new Set<(settings: GraphicsSettings) => void>();
export const DEFAULT_GRAPHICS: Readonly<GraphicsSettings> = { quality: 'high', fps: 60 };

export function sanitizeGraphics(value: unknown): GraphicsSettings {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    quality: v.quality === 'balanced' || v.quality === 'economy' ? v.quality : 'high',
    fps: v.fps === 0 || v.fps === 30 ? v.fps : 60,
  };
}
/** Graphics follow this browser/device, independently of personal account sync. */
export function loadGraphics(): GraphicsSettings {
  try { return sanitizeGraphics(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { return { ...DEFAULT_GRAPHICS }; }
}
export function saveGraphics(value: GraphicsSettings) {
  const settings = sanitizeGraphics(value);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Private/storage-limited browser. */ }
  for (const listener of listeners) listener(settings);
}
export function onGraphicsChange(listener: (settings: GraphicsSettings) => void) { listeners.add(listener); return () => listeners.delete(listener); }

export function graphicsPolicy(settings: GraphicsSettings, dpr: number) {
  const quality = settings.quality;
  return {
    pixelRatio: Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, quality === 'high' ? 2 : quality === 'balanced' ? 1.5 : 1),
    shadows: quality !== 'economy', shadowSize: quality === 'high' ? 2048 : 1024,
    outline: quality !== 'economy', fps: settings.fps,
  };
}

/** Deadline accumulation avoids halving 60Hz rendering because of RAF jitter. */
export class RenderCadence {
  private next = 0;
  private rate = -1;
  reset() { this.next = 0; this.rate = -1; }
  due(now: number, fps: number): boolean {
    if (fps <= 0) { this.reset(); return true; }
    const interval = 1000 / fps;
    if (fps !== this.rate || now > this.next + interval * 2) { this.rate = fps; this.next = now; }
    if (now + 0.75 < this.next) return false;
    this.next += interval;
    return true;
  }
}
