import { t as uiText } from './i18n.js';
/** Stable destinations, independent of project floor ids. Keep @roof for saved locations. */
export const ROOF = '@roof';
export const SERVER_ROOM = '@server-room';
export const SERVER_ROOM_NAME = uiText('Server room');
export const isFixedFloor = (id: string | null | undefined) => id === LOBBY || id === SERVER_ROOM || id === ROOF;
export const LOBBY = '@lobby';
export const LOBBY_NAME = uiText('Atrium');
export const ROOF_NAME = uiText('Meeting room');
