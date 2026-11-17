import * as THREE from 'three';
import { graphicsPolicy, loadGraphics, onGraphicsChange, RenderCadence } from '../graphics-settings';

/** Warm only requested worlds, under their real lights; retain successful work across visits. */
export class ShaderWarmup {
  private cache = new WeakMap<THREE.Object3D, Promise<void>>();
  constructor(private compile: (root: THREE.Object3D) => Promise<unknown>, private timeout = 2000) {}
  invalidate() { this.cache = new WeakMap(); }
  prepare(root: THREE.Object3D): Promise<void> {
    const previous = this.cache.get(root);
    if (previous) return previous;
    const ready = new Promise<void>((resolve) => {
      const forget = () => { if (this.cache.get(root) === ready) this.cache.delete(root); };
      const timer = setTimeout(() => { forget(); resolve(); }, this.timeout);
      // Promise scheduling also converts a synchronous driver/compiler failure to a fallback.
      void Promise.resolve().then(() => this.compile(root)).catch(() => {
        forget(); // A failed preparation must remain retryable, without deleting a newer generation.
      }).finally(() => { clearTimeout(timer); resolve(); });
    });
    this.cache.set(root, ready);
    return ready;
  }
}

export class GraphicsController {
  private settings = loadGraphics();
  private cadence = new RenderCadence();
  private preparing = false;
  private generation = 0;
  readonly warmup: ShaderWarmup;
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera, private sun: THREE.DirectionalLight) {
    this.warmup = new ShaderWarmup(root => renderer.compileAsync(root, camera, scene));
    this.apply();
    onGraphicsChange(settings => { this.settings = settings; this.apply(); });
    document.addEventListener('visibilitychange', () => this.cadence.reset());
    window.addEventListener('resize', () => this.apply());
  }
  get outline() { return graphicsPolicy(this.settings, window.devicePixelRatio).outline; }
  private apply() {
    const policy = graphicsPolicy(this.settings, window.devicePixelRatio);
    const shadowChanged = this.renderer.shadowMap.enabled !== policy.shadows;
    this.renderer.setPixelRatio(policy.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = policy.shadows;
    if (this.sun.shadow.mapSize.x !== policy.shadowSize) {
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(policy.shadowSize, policy.shadowSize);
    }
    this.sun.shadow.needsUpdate = true;
    if (shadowChanged) this.scene.traverse(node => {
      if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.needsUpdate = true;
    });
    this.warmup.invalidate(); this.cadence.reset();
  }
  resize() { this.apply(); }
  /** A loading/fade overlay may finish only after the requested scene can be drawn. */
  reveal(root: THREE.Object3D) {
    const generation = ++this.generation;
    this.preparing = true;
    return this.warmup.prepare(root).finally(() => {
      if (generation === this.generation) { this.preparing = false; this.cadence.reset(); }
    });
  }
  shouldDraw(now: number, hidden: boolean, covered: boolean) {
    if (hidden || this.preparing) { this.cadence.reset(); return false; }
    return this.cadence.due(now, covered ? 15 : this.settings.fps);
  }
}
