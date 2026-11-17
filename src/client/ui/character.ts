import { preloadAvatar } from '../world/models';
import { t as uiText } from '../../shared/i18n';
import './character.css';
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { HAIR_COLOR_NAMES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, randomLook, randomName, type Look } from '../../shared/avatar';
import { AVATAR_COLORS, saveProfile, store, type Profile } from '../state';
import type { Person } from '../world/character';
import { createUserPerson } from '../world/character/user-assets';
import { toonUnique } from '../world/toon';
import { h, openModal, toast } from './dom';
import { avatarColorFields } from './character-colors';
import { AVATAR_MODELS, AVATAR_HAIRSTYLES, avatarModel, avatarHairstyle, type AvatarModel, type AvatarHairstyle } from '../../shared/avatar-variants';

/** A turntable with your character on it, drawn with its own small renderer. */
class Preview {
  readonly person: Person;
  private renderer: THREE.WebGLRenderer;
  private effect: OutlineEffect;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  private raf = 0;
  private resize: ResizeObserver;
  private yaw = 0.5;
  private dragging = false;
  private lastDrag = -Infinity;
  private hopT = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    p: Profile,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.effect = new OutlineEffect(this.renderer, { defaultThickness: 0.0045, defaultColor: [0.17, 0.18, 0.26] });

    this.scene.add(new THREE.HemisphereLight('#fff5e6', '#c9a27a', 1.5));
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.5));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(-3, 6, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 20 });
    this.scene.add(sun);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), toonUnique('#ffd6a5'));
    rug.rotation.x = -Math.PI / 2;
    rug.receiveShadow = true;
    rug.material.userData.outlineParameters = { visible: false };
    this.scene.add(rug);

    this.person = createUserPerson(p.name, p.color, p.look);
    this.person.showLabel(false);
    this.scene.add(this.person.root);
    this.camera.position.set(0, 1.35, 4.6);
    this.camera.lookAt(0, 0.95, 0);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(canvas);
    this.fit();

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += e.movementX * 0.012;
      this.lastDrag = performance.now();
    });
    const release = () => {
      this.dragging = false;
      this.lastDrag = performance.now();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.tick(dt, now / 1000);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** A little hop and wave, to show a change landed. */
  cheer() {
    this.hopT = 0;
    this.person.reach();
  }

  private fit() {
    const w = this.canvas.clientWidth;
    const hgt = this.canvas.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
  }

  private tick(dt: number, t: number) {
    // Left alone, the character sways from side to side so you see the hair from every angle.
    if (!this.dragging && performance.now() - this.lastDrag > 1500) {
      const want = Math.sin(t * 0.6) * 1.1;
      this.yaw += (want - this.yaw) * Math.min(1, dt * 1.5);
    }
    this.person.root.rotation.y = this.yaw;
    let y = 0;
    if (this.hopT >= 0) {
      this.hopT += dt * 3.2;
      y = Math.sin(Math.min(1, this.hopT) * Math.PI) * 0.18;
      if (this.hopT >= 1) this.hopT = -1;
    }
    this.person.root.position.y = y;
    this.person.update(dt, t, false, y > 0.01);
    this.effect.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.scene.remove(this.person.root);
    this.person.dispose();
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * The character select screen: your name, model, hairstyle and colors, with a live preview.
 * `first` is the one you see when you join: closing it goes in as whoever's picked so far.
 */
export async function openCharacter(first: boolean, onSave: (p: Profile) => void) {
  await preloadAvatar(store.profile.look);
  const pick: Profile = { ...store.profile, look: { ...store.profile.look, ...(store.profile.look.colors ? { colors: { ...store.profile.look.colors } } : {}) } };
  const canvas = h('canvas', { 'aria-label': uiText('Your character, drag to spin') }) as HTMLCanvasElement;
  const preview = new Preview(canvas, pick);
  const colorFields = h('div');
  const refreshColors = () => colorFields.replaceChildren(avatarColorFields(pick.look.colors, colors => {
    pick.look = { ...pick.look, colors };
    preview.person.setLook(pick.look);
  }, avatarModel(pick.look) === 'female'));
  if (preview.person.usesBaseModel) refreshColors();
  const modelSelect = h('select', { id: 'avatar-model' }, ...AVATAR_MODELS.map(id => h('option', { value: id }, id === 'female' ? uiText('Female') : uiText('Male')))) as HTMLSelectElement;
  const hairLabels = { short: uiText('Short'), long: uiText('Long'), bun: uiText('Bun'), spiky: uiText('Spiky'), curly: uiText('Curly'), ponytail: uiText('Ponytail'), bald: uiText('No hair') };
  const hairSelect = h('select', { id: 'avatar-hairstyle' }, ...AVATAR_HAIRSTYLES.map(id => h('option', { value: id }, hairLabels[id]))) as HTMLSelectElement;
  modelSelect.value = avatarModel(pick.look);
  hairSelect.value = avatarHairstyle(pick.look);
  let closed = false, selection = 0;
  async function chooseVariant() {
    const visit = ++selection;
    const variant = { model: modelSelect.value as AvatarModel, hairstyle: hairSelect.value as AvatarHairstyle };
    save.setAttribute('disabled', '');
    try {
      await preloadAvatar({ ...pick.look, ...variant });
      if (closed || visit !== selection) return;
      pick.look = { ...pick.look, ...variant };
      preview.person.setLook(pick.look); refreshColors();
    } catch {
      if (!closed && visit === selection) {
        modelSelect.value = avatarModel(pick.look); hairSelect.value = avatarHairstyle(pick.look);
        toast(uiText('Could not load the character. Try again.'), 'warn');
      }
    } finally { if (!closed && visit === selection) save.removeAttribute('disabled'); }
  }
  modelSelect.addEventListener('change', () => void chooseVariant());
  hairSelect.addEventListener('change', () => void chooseVariant());
  const variants = h('div.avatar-variants', {},
    h('div', {}, h('label', { for: 'avatar-model' }, uiText('Avatar model')), modelSelect),
    h('div', {}, h('label', { for: 'avatar-hairstyle' }, uiText('Hairstyle')), hairSelect));

  // Leave the name blank (or skip this) and you go by the made-up one in the box; 🎲 deals another.
  // Guest is what you were before you picked one, so it isn't a name to keep.
  const input = h('input', { type: 'text', maxlength: 24, value: pick.name === 'Guest' ? '' : pick.name, placeholder: randomName(), 'aria-label': uiText('Your name') }) as HTMLInputElement;
  const reroll = h('button.btn', { type: 'button', title: uiText('Random name'), 'aria-label': uiText('Random name') }, '🎲');
  reroll.addEventListener('click', () => {
    let name = randomName();
    while (name === input.value || name === input.placeholder) name = randomName();
    input.value = input.placeholder = name;
    input.focus();
  });
  const typedName = () => input.value.trim().slice(0, 24) || input.placeholder;
  // Your account's name is the one everyone sees; only the look is yours to change here.
  const account = store.me.account;
  if (account) {
    input.value = account.name;
    input.readOnly = true;
    input.title = uiText('Your account name');
  }

  const skinRow = h('div.swatches', { role: 'radiogroup', 'aria-label': uiText('Skin tone') });
  const styleRow = h('div.seg', { role: 'radiogroup', 'aria-label': uiText('Hair style') });
  const hairRow = h('div.swatches', { role: 'radiogroup', 'aria-label': uiText('Hair color') });
  const shirtRow = h('div.swatches', { role: 'radiogroup', 'aria-label': uiText('Shirt color') });

  const swatch = (color: string, label: string, on: boolean, choose: () => void) =>
    h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(on), style: `background:${color}`, class: on ? 'sel' : '', 'aria-label': label, title: label, onclick: choose });

  const change = (look: Partial<Look>, color?: string) => {
    Object.assign(pick.look, look);
    if (color) pick.color = color;
    preview.person.setLook(pick.look);
    preview.person.setColor(pick.color);
    preview.cheer();
    paint();
  };

  const paint = () => {
    const { skin, hair, style } = pick.look;
    skinRow.replaceChildren(...SKIN_TONES.map((c, i) => swatch(c, uiText`Skin tone ${i + 1} of ${SKIN_TONES.length}`, i === skin, () => change({ skin: i }))));
    styleRow.replaceChildren(
      ...HAIR_STYLES.map((name, i) =>
        h('button.btn', { type: 'button', role: 'radio', 'aria-checked': String(i === style), class: i === style ? 'on' : '', onclick: () => change({ style: i }) }, name),
      ),
    );
    hairRow.replaceChildren(...HAIR_COLORS.map((c, i) => swatch(c, HAIR_COLOR_NAMES[i], i === hair, () => change({ hair: i }))));
    shirtRow.replaceChildren(...AVATAR_COLORS.map((c) => swatch(c, uiText`Shirt ${c}`, c === pick.color, () => change({}, c))));
  };
  paint();

  const surprise = h('button.btn', { type: 'button', title: uiText('Random look') }, uiText('🎲 Surprise me'));
  surprise.addEventListener('click', () => change(randomLook(), AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]));
  const save = h('button.btn.primary', { type: 'submit' }, first ? uiText('Enter the office 🚪') : uiText('Save'));
  const close = h('button.btn.close', { type: 'button', 'aria-label': uiText('Close'), title: first ? uiText('Skip: go in with this look (Esc)') : uiText('Close (Esc)') }, '✕');

  const form = h(
    'form.modal.charsel',
    { role: 'dialog', 'aria-label': uiText('Pick your character') },
    h('header', {}, h('h2', {}, first ? uiText('👋 Pick your character') : uiText('🧍 Your character')), close),
    h(
      'div.body',
      {},
      h('div.charsel-stage', {}, canvas, h('span.tip', {}, uiText('Drag to spin'))),
      h(
        'div.charsel-opts',
        {},
        h('label', {}, uiText('Your name')),
        account ? input : h('div.webhook', {}, input, reroll),
        account ? h('p.setting-note', {}, uiText`🔑 Signed in as ${account.name}, so that's your name here.`) : null,
        ...(preview.person.usesBaseModel ? [variants, colorFields, h('p.setting-note', {}, uiText('Everyone sees your changes after you save.'))] : [
          h('label', {}, uiText('Skin tone')),
          skinRow,
          h('label', {}, uiText('Hair')),
          styleRow,
          h('label', {}, uiText('Hair color')),
          hairRow,
          h('label', {}, uiText('Shirt')),
          shirtRow,
        ]),
      ),
    ),
    h('footer', {}, preview.person.usesBaseModel ? null : surprise, h('span.grow'), save),
  ) as HTMLFormElement;

  let done = false;
  const finish = (name: string) => {
    done = true;
    store.profile = { name, color: pick.color, look: { ...pick.look } };
    saveProfile(store.profile);
    modal.close();
    onSave(store.profile);
  };
  const modal = openModal(form, {
    // A stray click shouldn't skip the first one; ✕ and Esc still do.
    backdropCloses: !first,
    doing: uiText('🪞 picking a new look'),
    onClose: () => {
      closed = true; selection++;
      preview.dispose();
      // The office only lets you in with a character: skipping it goes in with this one, and the name in the box.
      if (first && !done) finish(typedName());
    },
  });
  close.addEventListener('click', () => modal.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finish(typedName());
  });
  if (!account) setTimeout(() => input.focus(), 30);
}
