/** Where you arrive and where you stand, to restore your place on a later visit. */
import { ELEVATOR, ELEVATOR_CAR, FLOOR, SLAB, WALL_HEIGHT, inElevator, inWing } from '../../shared/layout';
import { LOBBY, LOBBY_NAME, ROOF, ROOF_NAME, SERVER_ROOM, SERVER_ROOM_NAME } from '../../shared/rooftop';
import { rememberSpot, store, type Spot } from '../state';
import type { Ctx } from './context';
import type { CoreState } from './ctx';
import { builtFloors } from './floors';
import type { Parts } from './parts';

export function installPlace(ctx: Ctx, core: CoreState, parts: Pick<Parts, 'worlds' | 'seating'>) {
  const { player } = ctx;

  /** In the car, facing out through the doors: where you are when you arrive on a floor, or down in the `garage`. */
  function placeInCar(at?: { x: number; z: number }, garage = false) {
    const spot = at && inElevator(at.x, at.z) ? at : { x: ELEVATOR.x, z: (ELEVATOR_CAR.minZ + ELEVATOR_CAR.maxZ) / 2 };
    placeAt({ x: spot.x, y: garage ? player.street : 0, z: spot.z, rotY: 0 });
  }

  /** Down in the garage (or out on the street) under the floor you're on. */
  function downstairs(): boolean {
    return !core.upTop && !core.atLobby && !core.atServer && player.pos.y < -SLAB - 1;
  }

  /**
   * Inside the office on your floor, its back office as far as it's built out too: not out on the
   * balcony, the fire escape, the street or the garage.
   */
  function indoors(): boolean {
    const p = player.pos;
    if (core.upTop || core.atLobby || core.atServer || p.y < -1 || p.y > WALL_HEIGHT) return false;
    return (p.x > FLOOR.minX && p.x < FLOOR.maxX && p.z > FLOOR.minZ && p.z < FLOOR.maxZ) || inWing(p.x, p.z, parts.worlds.officeWing());
  }

  /** On your feet at `at`, facing `rotY` and looking straight ahead. */
  function placeAt(at: { x: number; y: number; z: number; rotY: number }) {
    if (player.seat) parts.seating.standUp();

    player.pos.set(at.x, at.y, at.z);
    player.vy = 0;
    player.facing = at.rotY;
    player.camYaw = player.facing - Math.PI;
    player.lookPitch = -0.08;
  }

  /** Where you're standing, to come back to (see lastSpot): nowhere while you're between floors, or climbing between them. */
  function spotHere(): Spot | null {
    if (!store.floor || core.trip) return null;
    // Sitting, it's where you'd get up to; in a car, where you'd get out.
    const at = player.standingSpot() ?? player.pos;
    const name = store.floor === SERVER_ROOM ? SERVER_ROOM_NAME : store.floor === LOBBY ? LOBBY_NAME : store.floor === ROOF ? ROOF_NAME : (store.currentFloor()?.name ?? '');
    return { floor: store.floor, name, x: at.x, y: at.y, z: at.z, facing: player.facing };
  }

  function saveSpot() {
    const s = spotHere();
    if (s) rememberSpot(s);
  }

  return { placeInCar, downstairs, indoors, placeAt, spotHere, saveSpot };
}
