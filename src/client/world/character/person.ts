import * as THREE from 'three';
import { HAIR_COLORS, SKIN_TONES, type Look } from '../../../shared/avatar';
import type { CarriedIssue } from '../../../shared/protocol';
import { HIPS, type PersonRig } from './rig';
import { OpenBook } from '../../features/bookshelf/book';
import { HeldCard } from '../../features/carrying/card';
import { disposeSprite, mesh, textSprite, toon, toonUnique } from '../toon';
import { REACH_TIME, reachCurve } from './curves';
import { styleHair } from './person-hair';
import { humanBase } from './human-base';
import { avatarModel, avatarHairstyle, type AvatarModel, type AvatarHairstyle } from '../../../shared/avatar-variants';

export interface PersonAssets {
  body(model: AvatarModel): THREE.Object3D | null;
  hair(style: AvatarHairstyle): THREE.Object3D | null;
}

export type Pose = 'stand' | 'walk' | 'sit' | 'type';

/** Voice loudness (RMS) above which someone counts as speaking. */
const SPEAKING = 0.04;

/** Where the line under a person's name tag sits, just over their hair, and how far it lifts the name tag. */
const DOING_Y = 1.95;
const DOING_LIFT = 0.25;

/** A user avatar with the delivered base, or the procedural fallback. Forward is +z. */
export class Person {
  readonly root = new THREE.Group();
  private body = new THREE.Group();

  readonly rig: PersonRig;
  private baseVisual?: ReturnType<typeof humanBase>;
  private appliedModel: AvatarModel;
  private appliedHair?: AvatarHairstyle;
  get usesBaseModel() { return !!this.baseVisual; }
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private shirt: THREE.MeshToonMaterial;
  private skin: THREE.MeshToonMaterial;
  private hairMat: THREE.MeshToonMaterial;
  private hair = new THREE.Group();
  private look: Look;
  private label: THREE.Sprite | null = null;
  /** The smaller line under the name tag: what they have open, or where they are (see whereabouts). */
  private doing: THREE.Sprite | null = null;
  private doingText = '';
  private speaking = false;
  private mic: THREE.Mesh;
  private head: THREE.Group;
  private smile?: THREE.Mesh;
  private mouth?: THREE.Mesh;
  private voiceLevel = 0;
  /** 0 = lips together, 1 = wide open. Follows the voice's loudness. */
  private mouthOpen = 0;
  /** Keep the talking mouth up through the short gaps between words. */
  private talkUntil = 0;
  private walkPhase = 0;
  private reachT = -1;


  /** An issue card off the board, held out in front in both hands. */
  private card: HeldCard;
  private cardHolder = new THREE.Group();
  /** A book off the bookshelf, open in both hands while they read (see read). */
  private book: OpenBook | null = null;
  private bookHolder = new THREE.Group();
  pose: Pose = 'stand';
  /** Hips this high above the feet while sitting (on the seat), or null on their feet. */
  private hips: number | null = null;
  /** The last seat's, so getting up eases back down from it. */
  private seatHips = HIPS;
  /** 0 standing … 1 sitting, eased between so sitting down and getting up take a moment. */
  private sitK = 0;
  /** Holding on to the ladder or a fire pole (see setGrip). */
  private grip: 'ladder' | 'pole' | null = null;
  /** A hand on someone's shoulder, marching them along (see holdOn). */
  private gripping = false;
  /** Something they're saying (see say), and for how many more seconds. */
  private speech: { sprite: THREE.Sprite; left: number } | null = null;

  constructor(
    private name: string,
    color: string,
    look: Look,
    asset?: THREE.Object3D,
    private assets?: PersonAssets,
  ) {
    this.look = { ...look };
    this.appliedModel = avatarModel(look);
    let torso: THREE.Object3D;
    if (asset) {
      const base = this.baseVisual = humanBase(asset);
      this.root = base.rig.root;
      this.body = base.rig.body;
      this.head = base.rig.head;
      torso = base.rig.torso;
      this.armL = base.rig.armL;
      this.armR = base.rig.armR;
      this.legL = base.rig.legL;
      this.legR = base.rig.legR;
      this.shirt = base.clothing;
      this.skin = base.skin;
      this.hairMat = base.hair;
      base.setColors(look.colors);
    } else {
      this.shirt = toonUnique(color);
      const skin = (this.skin = toonUnique(SKIN_TONES[look.skin]));
      this.hairMat = toonUnique(HAIR_COLORS[look.hair]);
      this.hairMat.side = THREE.DoubleSide;
      const pants = toon('#3d405b');
      const ink = toon('#1d1d1d');

      this.root.add(this.body);
      torso = mesh(new THREE.CapsuleGeometry(0.26, 0.28, 6, 12), this.shirt, 0, 0.72, 0);
      this.body.add(torso);
      // Head
      const head = (this.head = new THREE.Group());
      head.position.y = 1.32;
      head.add(mesh(new THREE.SphereGeometry(0.34, 20, 16), skin));
      head.add(this.hair);
      this.buildHair();
      for (const sx of [-1, 1]) {
        head.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), ink, sx * 0.12, 0.02, 0.3, false));
        head.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), toon('#ff9f9f'), sx * 0.2, -0.08, 0.27, false));
      }
      const smile = (this.smile = mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), ink, 0, -0.08, 0.32, false));
      smile.rotation.z = Math.PI;
      head.add(smile);
      // Talking mouth: a flattened ball pressed into the face, scaled open and shut with the voice.
      this.mouth = mesh(new THREE.SphereGeometry(1, 16, 12), toon('#7a2635'), 0, -0.1, 0.295, false);
      const tongue = mesh(new THREE.SphereGeometry(1, 12, 10), toon('#ff8fa3'), 0, -0.5, 0, false);
      tongue.scale.set(0.6, 0.45, 1.15);
      this.mouth.add(tongue);
      this.mouth.visible = false;
      head.add(this.mouth);
      this.body.add(head);

      const limb = (len: number, r: number, mat: THREE.Material, x: number, y: number) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        pivot.add(mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat, 0, -len / 2 - r / 2, 0));
        this.body.add(pivot);
        return pivot;
      };
      this.legL = limb(0.22, 0.1, pants, -0.12, HIPS);
      this.legR = limb(0.22, 0.1, pants, 0.12, HIPS);
      this.armL = limb(0.24, 0.08, this.shirt, -0.33, 0.9);
      this.armR = limb(0.24, 0.08, this.shirt, 0.33, 0.9);
      for (const arm of [this.armL, this.armR]) arm.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), skin, 0, -0.38, 0));
    }
    // Forward is +z, so the character's left arm is the one on +x. The handle faces the hand.
    // Between the hands when both arms are out in front (see update), its front to whoever they walk up to.
    const holder = this.cardHolder;
    holder.position.set(0, 0.8, 0.36);
    holder.rotation.x = -0.1;
    this.body.add(holder);
    this.card = new HeldCard(holder, 0.46);
    // Held out at chest height, turned round and tipped up so the pages face their eyes, top edge
    // away from them, with the hands on its bottom corners.
    this.bookHolder.position.set(0, 1, 0.48);
    this.bookHolder.rotation.set(0.85, Math.PI, 0);
    this.bookHolder.scale.setScalar(1.25);
    this.body.add(this.bookHolder);
    // Little mic icon that pops up while speaking
    this.mic = mesh(new THREE.SphereGeometry(0.09, 10, 8), toon('#7cf29a', { emissive: '#2a9d4b' }), 0, 2.25, 0, false);
    this.mic.visible = false;
    this.root.add(this.mic);

    this.rig = { root: this.root, body: this.body, torso, head: this.head, armL: this.armL, armR: this.armR, legL: this.legL, legR: this.legR };
    this.setLabel(name, false);
    this.applyHairstyle(look);
  }

  setColor(color: string) {
    if (!this.baseVisual) this.shirt.color.set(color);
  }

  get skinColor(): string {
    return this.baseVisual ? `#${this.skin.color.getHexString()}` : SKIN_TONES[this.look.skin];
  }

  get shirtColor(): string { return `#${this.shirt.color.getHexString()}`; }

  setLook(look: Look) {
    const restyle = look.style !== this.look.style;
    const nextModel = avatarModel(look);
    if (this.baseVisual && nextModel !== this.appliedModel) {
      const asset = this.assets?.body(nextModel);
      if (asset) {
        this.replaceVisual(asset);
        this.appliedModel = nextModel;
      }
    }
    this.look = { ...look };
    if (this.baseVisual) {
      this.baseVisual.setColors(look.colors);
      this.applyHairstyle(look);
      return;
    }
    this.hairMat.color.set(HAIR_COLORS[look.hair]);
    if (restyle) this.buildHair();
    this.skin.color.set(SKIN_TONES[this.look.skin]);
  }

  /** Keep the controller's root/rig identity, labels, pose and held objects across body changes. */
  private replaceVisual(asset: THREE.Object3D) {
    const next = humanBase(asset), previous = this.baseVisual;
    this.body.remove(this.cardHolder, this.bookHolder);
    this.root.remove(this.body);
    this.body = next.rig.body;
    this.root.add(this.body);
    this.body.add(this.cardHolder, this.bookHolder);
    next.rig.root = this.root;
    Object.assign(this.rig, next.rig);
    this.head = next.rig.head;
    this.armL = next.rig.armL; this.armR = next.rig.armR;
    this.legL = next.rig.legL; this.legR = next.rig.legR;
    this.shirt = next.clothing; this.skin = next.skin; this.hairMat = next.hair;
    this.baseVisual = next;
    this.appliedHair = undefined;
    previous?.dispose();
  }

  private applyHairstyle(look: Look) {
    if (!this.baseVisual || !this.assets) return;
    const style = avatarHairstyle(look);
    if (style === this.appliedHair) return;
    const component = style === 'bald' ? null : this.assets.hair(style);
    if (style !== 'bald' && !component) return;
    this.baseVisual.setHair(component);
    this.appliedHair = style;
  }

  /** Hair is a set of shapes on the head (see styleHair). */
  private buildHair() {
    styleHair(this.hair, this.hairMat, this.look.style);
  }

  setLabel(name: string, muted: boolean | null) {
    this.name = name;
    if (this.label) {
      this.root.remove(this.label);
      disposeSprite(this.label);
    }
    const suffix = muted === null ? '' : muted ? ' 🔇' : ' 🎙️';
    this.label = textSprite(`${name}${suffix}`, { bg: '#fffaf3', size: 40 });
    this.root.add(this.label);
    this.placeLabels();
  }

  /** Puts a smaller line under the name tag, like "💻 in Pixel's terminal"; none (or '') takes it away. */
  setDoing(text: string | undefined) {
    text ??= '';
    if (text === this.doingText) return;
    this.doingText = text;
    if (this.doing) {
      this.root.remove(this.doing);
      disposeSprite(this.doing);
      this.doing = null;
    }
    if (text) {
      this.doing = textSprite(text, { bg: '#e9ecef', size: 26 });
      this.doing.position.y = DOING_Y;
      this.doing.visible = this.label?.visible ?? true;
      this.root.add(this.doing);
    }
    this.placeLabels();
  }

  /** Where a chat bubble goes: over the name tag, however high it sits. */
  get bubbleY(): number {
    return 2.45 + (this.doing ? DOING_LIFT : 0);
  }

  /** The name tag and the mic badge move up out of the way of the line under them. */
  private placeLabels() {
    const lift = this.doing ? DOING_LIFT : 0;
    if (this.label) this.label.position.y = 2.0 + lift;
    this.mic.position.y = 2.25 + lift;
  }

  /** How loud this person is talking right now (0 when silent); drives the mic badge and the mouth. */
  setVoiceLevel(level: number) {
    this.voiceLevel = level;
    this.speaking = level > SPEAKING;
    this.mic.visible = this.speaking;
  }

  showLabel(v: boolean) {
    if (this.label) this.label.visible = v;
    if (this.doing) this.doing.visible = v;
  }

  /** Reach out with the right hand, as if pressing or grabbing something in front of you. */
  reach() {
    this.reachT = 0;
  }

  /** Puts something on them to stay: on their head (a helm), their body, or in their right hand or their left (a halberd). */
  wear(o: THREE.Object3D, on: 'head' | 'body' | 'hand' | 'offhand') {
    o.traverse((m) => ((m as THREE.Mesh).castShadow = true));
    // Forward is +z, so the character's right arm is the one on -x (see reach).
    (on === 'head' ? this.head : on === 'hand' ? this.armL : on === 'offhand' ? this.armR : this.body).add(o);
  }

  /** Keeps a hand out in front, on the shoulder of someone they're marching along (or lets go). */
  holdOn(on: boolean) {
    this.gripping = on;
  }

  /** Says something in a bubble over their head for `seconds` (the one before goes). */
  say(text: string, seconds = 3.5) {
    this.hush();
    this.speech = { sprite: textSprite(text, { bg: '#fffaf3', size: 34 }), left: seconds };
    this.speech.sprite.position.y = this.bubbleY;
    this.root.add(this.speech.sprite);
  }

  private hush() {
    if (!this.speech) return;
    this.root.remove(this.speech.sprite);
    disposeSprite(this.speech.sprite);
    this.speech = null;
  }


  /** Carries an issue card in both hands, or puts it down (null). The mug waits while the hands are full. */
  carry(card: CarriedIssue | null | undefined) {
    this.card.set(card);
  }

  /** Opens a book in both hands and reads it, turning the pages (or closes it). A card they carry waits. */
  read(on: boolean) {
    if (on === !!this.book) return;
    if (on) {
      this.book = new OpenBook();
      this.bookHolder.add(this.book.group);
    } else {
      this.bookHolder.remove(this.book!.group);
      this.book!.dispose();
      this.book = null;
    }
    this.cardHolder.visible = !on;
  }

  /** Turns a page of the book they're reading now. */
  turnPage() {
    this.book?.turn();
  }

  /** Sits down with the hips `hips` above the feet, on a couch or a chair, or gets up (null). */
  sit(hips: number | null) {
    this.hips = hips;
    if (hips !== null) this.seatHips = hips;
    this.pose = hips === null ? 'stand' : 'sit';
  }

  /**
   * On the ladder (hand over hand, as they climb) or a fire pole (hanging on with both arms up, legs
   * wrapped round it: it's on their left, the +x side), or neither.
   */
  setGrip(grip: 'ladder' | 'pole' | null) {
    this.grip = grip;
  }


  /** `pace` speeds up the walk cycle for someone walking faster than usual. */
  update(dt: number, t: number, moving: boolean, airborne: boolean, pace = 1) {
    const target = moving ? 1 : 0;
    this.walkPhase += dt * 11 * target * pace;
    const swing = Math.sin(this.walkPhase) * 0.7 * target;
    if (airborne) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
      this.armL.rotation.z = -2.4;
      this.armR.rotation.z = 2.4;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing;
      this.armR.rotation.x = swing;
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, -0.1, 0.3);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, 0.1, 0.3);
    }
    this.sitK += ((this.hips === null ? 0 : 1) - this.sitK) * Math.min(1, dt * 10);
    const sit = this.sitK > 0.001 ? this.sitK : 0;
    if (sit) {
      for (const leg of [this.legL, this.legR]) leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, -1.35, sit);
      for (const arm of [this.armL, this.armR]) arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, -0.55, sit);
    }
    if (this.book) {
      // Both arms out in front, hands under the book's bottom corners.
      this.armL.rotation.set(-1.5, 0, 0.32);
      this.armR.rotation.set(-1.5, 0, -0.32);
      this.book.update(dt);
    } else if (this.card.held) {
      // Both arms out in front, hands on the card's edges : they don't swing while they walk.
      this.armL.rotation.set(-1.25, 0, 0.3);
      this.armR.rotation.set(-1.25, 0, -0.3);
    }
    let reach = 0;
    if (this.reachT >= 0) {
      this.reachT += dt;
      reach = reachCurve(this.reachT / REACH_TIME);
      // Forward is +z, so the character's right arm is the one on -x.
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -1.65, reach);
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.22, reach);
      if (this.reachT >= REACH_TIME) this.reachT = -1;
    }
    if (this.gripping && !this.book && !this.card.held) {
      // The right arm out and a little down, onto the shoulder of whoever's in front.
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -1.15, Math.min(1, dt * 10));
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.3, Math.min(1, dt * 10));
    }
    if (this.speech) {
      this.speech.left -= dt;
      if (this.speech.left <= 0) this.hush();
    }
    // Lean into the reach a little.
    this.body.rotation.x = reach * 0.12;
    this.body.rotation.z = 0;
    if (this.grip === 'ladder') {
      const c = Math.sin(this.walkPhase);
      this.armL.rotation.set(-2.55 + c * 0.35, 0, -0.12);
      this.armR.rotation.set(-2.55 - c * 0.35, 0, 0.12);
      this.legL.rotation.set(-0.55 - c * 0.45, 0, 0);
      this.legR.rotation.set(-0.55 + c * 0.45, 0, 0);
      this.body.rotation.x = -0.08;
    } else if (this.grip === 'pole') {
      this.armL.rotation.set(0, 0, 2.95);
      this.armR.rotation.set(0, 0, 2.45);
      this.legL.rotation.set(-0.35, 0, 0.25);
      this.legR.rotation.set(-1.15, 0, 0.35);
      this.body.rotation.z = -0.16;
    }
    this.body.position.y = moving && !airborne ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    // Down onto (or up onto) the seat: the hips go where it puts them.
    if (sit) this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, this.seatHips - HIPS, sit);
    if (this.speaking) this.mic.scale.setScalar(1 + Math.sin(t * 14) * 0.2);

    // Lip flap: pop open fast on each syllable, close a little slower.
    const want = THREE.MathUtils.clamp((this.voiceLevel - 0.02) / 0.12, 0, 1);
    this.mouthOpen += (want - this.mouthOpen) * Math.min(1, dt * (want > this.mouthOpen ? 35 : 15));
    if (this.voiceLevel > SPEAKING * 0.75) this.talkUntil = t + 0.4;
    const talking = t < this.talkUntil;
    if (this.smile && this.mouth) {
      this.smile.visible = !talking;
      this.mouth.visible = talking;
      if (talking) this.mouth.scale.set(0.07 * (1 - this.mouthOpen * 0.2), 0.01 + this.mouthOpen * 0.045, 0.05);
    }
    // Reading, they look down into the book.
    this.head.rotation.x = -this.mouthOpen * 0.08 + (this.book ? 0.32 : 0);
    this.head.rotation.y = this.head.rotation.z = 0;
    this.body.rotation.y = this.body.rotation.z = 0;
  }

  /** Release instance resources, leaving cached GLB buffers and shared palette materials intact. */
  dispose() {
    if (this.label) disposeSprite(this.label);
    if (this.doing) disposeSprite(this.doing);
    this.hush();
    this.card.set(null);
    this.read(false);
    this.root.traverse(node => {
      if (node instanceof THREE.Mesh && !node.userData.sharedHumanGeometry) node.geometry.dispose();
    });
    if (this.baseVisual) this.baseVisual.dispose();
    else { this.shirt.dispose(); this.skin.dispose(); this.hairMat.dispose(); }
  }

}
