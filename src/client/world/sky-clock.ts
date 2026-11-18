import { sunPosition } from '../../shared/sun';

/** Recompute slow astronomy at most once per simulated second; location/time jumps apply immediately. */
export class SunPositionCache {
  private second = NaN;
  private lat = NaN;
  private lon = NaN;
  private position = { el: 0, az: 0 };
  at(time: number, lat: number, lon: number) {
    const second = Math.floor(time / 1000);
    if (second !== this.second || lat !== this.lat || lon !== this.lon) {
      this.second = second; this.lat = lat; this.lon = lon;
      this.position = sunPosition(time, lat, lon);
    }
    return this.position;
  }
}
