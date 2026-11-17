import * as THREE from 'three';
import { ROOF } from '../../../shared/rooftop';
import { CONFERENCE_DATA } from '../../../shared/conference-room';
import { presentationFit } from '../../../shared/presentation-fit';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';

/** Display selection is shared; the video travels over existing WebRTC and never enters the drawing archive. */
export function installPresentation(ctx: Ctx, parts: Pick<Parts, 'rooftop' | 'talk'>) {
  let video: HTMLVideoElement | undefined, texture: THREE.VideoTexture | undefined, material: THREE.MeshBasicMaterial | undefined;
  let stream: MediaStream | null = null;
  function fit() {
    if (!video || !texture) return;
    const ratio = presentationFit(CONFERENCE_DATA.whiteboard.width_m / CONFERENCE_DATA.whiteboard.height_m, (video.videoWidth || 16) / (video.videoHeight || 9));
    texture.repeat.set(ratio.x, ratio.y);
    texture.offset.set((1 - ratio.x) / 2, (1 - ratio.y) / 2);
  }
  function ensureVideo() {
    if (video) return;
    video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.autoplay = true;
    texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false;
    material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
    material.name = 'conference-presentation';
    material.userData.outlineParameters = { visible: false };
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n#ifdef USE_MAP\nif (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) diffuseColor = vec4(0.02, 0.02, 0.02, 1.0);\n#endif`);
    };
    material.customProgramCacheKey = () => 'conference-letterbox-v1';
    video.addEventListener('loadedmetadata', fit); video.addEventListener('resize', fit);
  }
  function refresh() {
    const room = parts.rooftop.roof();
    const owner = store.floor === ROOF && store.presentation.mode === 'presentation' ? store.presentation.presenter : undefined;
    const peer = owner ? store.peers.get(owner) : undefined;
    const selected = owner === store.you ? ctx.voice.localScreen : owner && peer?.floor === ROOF && peer.sharing ? ctx.voice.remoteScreens().get(owner) ?? null : null;
    if (!owner || !selected) {
      room?.whiteboard.showPresentation(null);
      if (video) { video.pause(); video.srcObject = null; }
      stream = null;
    } else if (room) {
      ensureVideo();
      if (stream !== selected) { stream = selected; video!.srcObject = selected; fit(); void video!.play().catch(() => {}); }
      room.whiteboard.showPresentation(material!);
    }
    ctx.hud.refresh();
  }
  async function toggle() {
    if (store.floor !== ROOF) return;
    if (store.presentation.mode === 'presentation') return ctx.net.send({ t: 'conference.present', mode: 'whiteboard' });
    if (!ctx.voice.sharing) await parts.talk.toggleShare();
    if (ctx.voice.sharing && store.floor === ROOF) ctx.net.send({ t: 'conference.present', mode: 'presentation' });
  }
  store.on('presentation', refresh); store.on('floor', refresh); store.on('peers', refresh);
  ctx.voice.onChange(refresh);
  return { toggle, refresh };
}
