import { rms } from './dsp';

/** Music volume shared by the rooftop DJ and its meter, separate from office sounds. */
export class MusicBus {
  bus!: GainNode;
  private meter!: AnalyserNode;
  private volume = 0.5;
  private muted = false;
  connect(ctx: AudioContext) {
    this.bus = ctx.createGain();
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    this.bus.connect(ctx.destination);
    this.bus.connect(this.meter);
    this.applyVolume();
  }
  setVolume(volume: number, muted: boolean) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    this.applyVolume();
  }
  private applyVolume() {
    if (this.bus) this.bus.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.bus.context.currentTime, 0.06);
  }
  level() { return this.meter ? rms(this.meter) : 0; }
}
