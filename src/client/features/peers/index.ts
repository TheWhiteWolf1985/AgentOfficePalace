import { avatarReady, avatarModels, preloadAvatar } from '../../world/models';
import * as THREE from 'three';
import { sameLook } from '../../../shared/avatar';
import { seatOn } from '../../../shared/maps';
import type { PeerInfo } from '../../../shared/protocol';
import { gripOf, type Grip } from '../climbing/controller';
import type { Ctx } from '../../core/context';
import type { CoreState } from '../../core/ctx';
import { noOutline } from '../../core/outline';
import type { Parts } from '../../core/parts';
import { groundAt } from '../../player';
import { store } from '../../state';
import { clip } from '../../ui/dom';
import { renderPeople, updateSpeaking } from '../../ui/people';
import { whereabouts } from '../../ui/whereabouts';
import type { Person } from '../../world/character';
import { createUserPerson } from '../../world/character/user-assets';
import { disposeSprite, textSprite } from '../../world/toon';

/** Going faster than this (m/s), someone's running: a walk is 4.6 and a run 7.5 (see player/index.ts). */
const RUN_SPEED = 6;

export interface RemotePeer {
  person: Person;
  target: THREE.Vector3;
  rotY: number;
  moving: boolean;
  label: string;
  look: PeerInfo['look'];
  bubble?: { sprite: THREE.Sprite; until: number };
  /** Seconds walked since their last footstep. */
  stepT: number;
  /** How fast they're going (m/s), evened out: at a run, their feet say so. */
  speed: number;
  /** On the ladder or a pole, going by where they are. */
  grip: Grip | null;
}

export function installPeers(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'worlds' | 'walking' | 'hud'>) {
  const { scene, voice, sound, player, office } = ctx;
  const { plan, inOffice } = parts.worlds;
  const remotes = new Map<string, RemotePeer>();
  const editProfile = () => parts.hud.editProfile();
  const walkTo = (id: string) => parts.walking.walkTo(id);

  const warming = new Set<string>();
  function syncPeers() {
    for (const [id, peer] of store.peers) {
      // Only who's on your floor is in the room with you, and not someone on the 2D view: they're not standing anywhere.
      if (id === store.you || !store.onMyFloor(peer) || peer.lite) continue;
      if (!avatarReady(peer.look)) {
        const key = avatarModels(peer.look).join('|');
        if (!warming.has(key)) {
          warming.add(key);
          void preloadAvatar(peer.look).then(() => { warming.delete(key); store.emit('peers'); }).catch(() => { warming.delete(key); });
        }
        continue;
      }
      let r = remotes.get(id);
      if (!r) {
        const person = createUserPerson(peer.name, peer.color, peer.look);
        person.root.position.set(peer.x, peer.y, peer.z);
        scene.add(person.root);
        noOutline(person.root);
        r = { person, target: new THREE.Vector3(peer.x, peer.y, peer.z), rotY: peer.rotY, moving: false, label: '', look: { ...peer.look }, stepT: 0, speed: 0, grip: null };
        remotes.set(id, r);
      }
      const label = `${peer.name}|${peer.voice ? (peer.muted ? 'm' : 'v') : '-'}|${peer.color}`;
      if (label !== r.label) {
        r.label = label;
        r.person.setLabel(peer.name, peer.voice ? peer.muted : null);
        r.person.setColor(peer.color);
        noOutline(r.person.root);
      }
      if (!sameLook(peer.look, r.look)) {
        r.look = { ...peer.look };
        r.person.setLook(peer.look);
        noOutline(r.person.root);
      }
      r.person.carry(peer.carrying);
      r.person.read(!!peer.reading);
      r.person.sit(peer.seat ? (seatOn(plan(), peer.seat)?.hips ?? null) : null);
      r.person.setDoing(whereabouts(peer));
    }
    for (const [id, r] of remotes) {
      const peer = store.peers.get(id);
      if (!peer || !store.onMyFloor(peer) || peer.lite) {
        scene.remove(r.person.root);
        r.person.dispose();
        remotes.delete(id);
      }
    }
    renderPeople(voice, editProfile, walkTo);
  }
  store.on('peers', syncPeers);
  // Into a car or out of one: sitting in it, or back on their feet.

  ctx.ticks.add('others', ({ dt, t, now }) => {
    for (const [id, r] of remotes) {
      const p = store.peers.get(id);
      if (!p) continue;
      // Sitting, they're wherever their seat puts them; in a car, right in it as it goes.
      const sat = p.seat ? seatOn(plan(), p.seat) : undefined;
      const at = sat ?? p;
      r.target.set(at.x, at.y, at.z);
      const pos = r.person.root.position;
      const fromX = pos.x;
      const fromZ = pos.z;
        pos.lerp(r.target, Math.min(1, dt * 12));
        let diff = at.rotY - r.person.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        r.person.root.rotation.y += diff * Math.min(1, dt * 12);
      // On their feet if they're standing on something: the floor, a desk, a stair, the loft.
      const ground = groundAt(player.colliders, p.x, p.z, p.y);
      const airborne = !sat && p.y > ground + 0.05;
      // Or holding on to the ladder or a pole; off a pole onto the mat, the firehouse bell rings.
      const holding = sat || core.upTop || core.atLobby || !inOffice() ? null : gripOf(p, office.stack.poles(), ground);
      if (r.grip === 'pole' && !holding && Math.abs(p.y) < 0.2) sound.poleLanding(6, { x: pos.x, y: 0.5, z: pos.z });
      r.grip = holding;
      r.person.setGrip(holding);
      const walking = !sat && p.moving && !airborne;
      r.person.update(dt, t, walking || (holding === 'ladder' && p.moving), airborne && !holding && Math.abs(pos.y - r.target.y) > 0.01);
      // Their walk cycle takes a step every π/11 seconds, and every π/14 at a run, as yours does.
      if (dt > 0) r.speed += (Math.min(RUN_SPEED * 2, Math.hypot(pos.x - fromX, pos.z - fromZ) / dt) - r.speed) * Math.min(1, dt * 5);
      const running = r.speed > RUN_SPEED;
      const stride = Math.PI / (running ? 14 : 11);
      r.stepT = walking ? r.stepT + dt : 0.2;
      if (r.stepT >= stride) {
        r.stepT -= stride;
        sound.stepAt(pos.x, pos.z, pos.y, running ? 1 : 0);
      }
      r.person.setVoiceLevel(p.voice && !p.muted ? voice.levelOf(id) : 0);
      if (r.bubble && now > r.bubble.until) {
        r.person.root.remove(r.bubble.sprite);
        disposeSprite(r.bubble.sprite);
        r.bubble = undefined;
      }
      const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
      voice.setVolume(id, d < 4 ? 1 : Math.max(0.2, 1 - (d - 4) / 16));
    }
  });
  let speakTick = 0;
  ctx.ticks.add('hud', ({ now }) => {
    if (now - speakTick > 200) {
      speakTick = now;
      // What people are up to changes as they walk about, not only when they open something.
      for (const [id, r] of remotes) {
        const p = store.peers.get(id);
        if (p) r.person.setDoing(whereabouts(p));
      }
      renderPeople(voice, editProfile, walkTo, false);
      updateSpeaking(voice);
      // People on other floors can't be heard here (their voice connection stays up for when you meet).
      for (const p of store.peers.values()) if (p.id !== store.you && !store.onMyFloor(p)) voice.setVolume(p.id, 0);
    }
  });
  ctx.messages.on('chat', (msg) => sayBubble(msg.from, msg.text));
  ctx.messages.on('peer.act', (msg) => {
    if ('smoke' in msg || 'drink' in msg || 'throwing' in msg) return;
    const r = remotes.get(msg.id);
    r?.person.reach();
  });

  function sayBubble(from: string, text: string) {
    if (from === store.you) return;
    const r = remotes.get(from);
    if (!r) return;
    if (r.bubble) {
      r.person.root.remove(r.bubble.sprite);
      disposeSprite(r.bubble.sprite);
    }
    const sprite = textSprite(`💬 ${clip(text, 60)}`, { bg: '#ffffff', size: 34 });
    sprite.position.y = r.person.bubbleY;
    r.person.root.add(sprite);
    r.bubble = { sprite, until: performance.now() + 6000 };
  }

  return {
    /** Everyone else on your floor, as you see them, by peer id. */
    remotes,
  };
}
