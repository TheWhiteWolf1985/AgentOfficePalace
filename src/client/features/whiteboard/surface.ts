import * as THREE from 'three';
import { t as uiText } from '../../../shared/i18n';

export interface WhiteboardDisplay {
  show(drawing: HTMLCanvasElement | null): void;
  fit: { width: number; height: number };
}
export interface WhiteboardSurface extends WhiteboardDisplay { material: THREE.MeshBasicMaterial }

/** One canvas/texture for the lifetime of the face; drawings are fitted without distortion. */
export function createWhiteboardSurface(width: number, height: number, maxWidth = Infinity, room = false): WhiteboardSurface {
  const scale = Math.min(512, maxWidth / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const W = canvas.width, H = canvas.height, pad = 40;
  const show = (drawing: HTMLCanvasElement | null) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const shine = g.createLinearGradient(0, 0, W * 0.5, H * 0.6);
    shine.addColorStop(0, 'rgba(210, 225, 240, 0.55)');
    shine.addColorStop(1, 'rgba(210, 225, 240, 0)');
    g.fillStyle = shine; g.fillRect(0, 0, W, H);
    if (drawing) {
      const s = Math.min((W - pad * 2) / drawing.width, (H - pad * 2) / drawing.height);
      const w = drawing.width * s, h = drawing.height * s;
      g.drawImage(drawing, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      g.fillStyle = '#b8c0c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const text = (label: string, size: number, y: number) => {
        g.font = `900 ${size}px Nunito, ui-rounded, system-ui, sans-serif`;
        const fit = Math.min(1, (W - pad * 2) / g.measureText(label).width);
        g.font = `900 ${size * fit}px Nunito, ui-rounded, system-ui, sans-serif`;
        g.fillText(label, W / 2, y);
      };
      text(uiText('Draw together ✏️'), Math.min(120, H / 5), H / 2 - Math.min(70, H / 9));
      text(room ? uiText('Walk up and press E — everyone in this room sees it live') : uiText('Walk up and press E — everyone on this floor sees it live'), Math.min(64, H / 10), H / 2 + Math.min(70, H / 9));
    }
    texture.needsUpdate = true;
  };
  show(null);
  return { material, show, fit: { width: W - pad * 2, height: H - pad * 2 } };
}
