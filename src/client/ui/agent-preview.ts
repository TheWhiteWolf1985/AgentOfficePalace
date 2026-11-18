import * as THREE from 'three';
import type { AgentAppearance } from '../../shared/agent-appearance';
import { loadAgentVisual } from '../world/character/agent-assets';

/** A still preview, redrawn only when a choice or the available size changes. */
export class AgentPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private resize: ResizeObserver;
  private visual?: Awaited<ReturnType<typeof loadAgentVisual>>;
  private revision = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.camera.position.set(0.45, 1.2, 4);
    this.camera.lookAt(0, 0.92, 0);
    const key = new THREE.DirectionalLight('#fff1d6', 2);
    key.position.set(-3, 6, 5);
    this.scene.add(key, new THREE.HemisphereLight('#fff5e6', '#c9a27a', 1.5));
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(canvas);
  }

  private draw() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  show(appearance: AgentAppearance) {
    const revision = ++this.revision;
    void loadAgentVisual(appearance).then(visual => {
      if (revision !== this.revision) { visual.dispose(); return; }
      this.visual?.root.removeFromParent();
      this.visual?.dispose();
      this.visual = visual;
      this.scene.add(visual.root);
      this.canvas.hidden = false;
      this.draw();
    }).catch(() => {
      if (revision === this.revision) this.canvas.hidden = true;
    });
  }

  dispose() {
    this.revision++;
    this.resize.disconnect();
    this.visual?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
