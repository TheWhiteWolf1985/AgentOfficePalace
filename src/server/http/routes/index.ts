// Every HTTP route the office answers, in the order they're tried: a new route goes where it has to
// come in that order (see http/router.ts). The public ones are tried first, then the sign-in check,
// then the rest; the last one answers every path left with the client bundle, or a 404.
import type { Route } from '../router.js';
import { serverRoomRoute } from './server-room.js';
import { agentRoutes } from './agents.js';
import { authRoutes } from './auth.js';
import { fileRoutes } from './files.js';
import { githubRoutes } from './github.js';
import { pageRoutes } from './pages.js';
import { searchRoutes } from './search.js';
import { serviceRoutes } from './services.js';
import { receptionSignRoute } from './reception-sign.js';
import { connectionsRoute } from './connections.js';
import { preferencesRoute } from './preferences.js';
import { updateActivity, updatesRoute } from './updates.js';
import { pluginsRoute } from './plugins.js';

export const routes: readonly Route[] = [
  // Anyone.
  authRoutes.login,
  authRoutes.loginOptions,
  authRoutes.join,
  authRoutes.claimable,
  authRoutes.claim,
  authRoutes.link,
  authRoutes.logout,
  pageRoutes.health,
  updateActivity,
  pageRoutes.assets,
  pageRoutes.login,
  pageRoutes.claim,
  pageRoutes.join,
  pageRoutes.favicon,
  // Signed in.
  authRoutes.whoami,
  serverRoomRoute,
  preferencesRoute,
  connectionsRoute,
  pluginsRoute,
  updatesRoute,
  receptionSignRoute,
  agentRoutes.models,
  agentRoutes.queueTargets,
  fileRoutes.image,
  fileRoutes.whiteboardFile,
  fileRoutes.termDrop,
  fileRoutes.changedFile,
  fileRoutes.docs,
  searchRoutes.search,
  serviceRoutes.forwards,
  githubRoutes.github,
  pageRoutes.office,
  pageRoutes.lite,
  pageRoutes.bundle,
];
