import { OfficeSound } from '../sound';
import { store, type Profile, type Settings } from '../state';
import type { Person } from '../world/character';
import { createUserPerson } from '../world/character/user-assets';
import { Dust } from '../world/dust';
import type { Ctx } from './context';
import { noOutline } from './outline';

/** Your own character, as everyone else sees it (no name tag over your own head). */
export function makeMe(ctx: Ctx): Person {
  const me = createUserPerson(store.profile.name, store.profile.color, store.profile.look);
  me.showLabel(false);
  ctx.scene.add(me.root);
  noOutline(me.root);
  return me;
}

/** Landing dust for the fire poles. */
export function makeDust(ctx: Ctx): Dust {
  const dust = new Dust();
  ctx.scene.add(dust.group);
  return dust;
}

/** What you hear, as loud as your settings have it. */
export function makeSound(settings: Settings): OfficeSound {
  const sound = new OfficeSound();
  sound.setVolume(settings.volume, settings.muted);
  return sound;
}

/** Reaching out to use something, and your look changing. */
export function installYou(ctx: Ctx) {
  let lastActSent = 0;
  /** Plays the reach on your hands and your character, and shows it to everyone else. */
  function reach() {
    if (ctx.player.view === 'first') ctx.hands.reach();
    ctx.me.reach();
    const now = performance.now();
    if (now - lastActSent > 120) {
      lastActSent = now;
      ctx.net.send({ t: 'act' });
    }
  }

  /** Your character and your hands, as `p` has them. */
  function showMyProfile(p: Profile) {
    const { me, hands } = ctx;
    me.setColor(p.color);
    me.setLook(p.look);
    hands.setColor(me.shirtColor);
    hands.setSkin(me.skinColor);
  }

  return { reach, showMyProfile };
}
