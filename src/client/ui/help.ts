import { t as uiText } from '../../shared/i18n';
// The rows of the controls help (openHelp in hud.ts), in the order it shows them: a key or an emoji, and
// what it does. A new control is a new row here.

import { IS_MAC } from './termkeys';

export const HELP_ROWS: readonly (readonly [string, string])[] = [
  ['W A S D', uiText('Walk (hold Shift to run)')],
  ['Space', uiText('Jump')],
  [uiText('Mouse'), uiText('Look around in first person (click to capture the mouse, Esc to free it)')],
  [uiText('Click / E'), uiText("Use what you look at: hire a worker, open its terminal, read a board, call a meeting in the meeting room, watch the TV, sit on a couch, a beanbag or a chair (walk off to get up)")],
  ['👥', uiText('Click someone under "In the office" to walk over to them (on another floor, you ride the elevator first). The line under their name says what they have open or where they are')],
  ['🛗', uiText('Every project is a floor: press E at the elevator or click the floor name to change floors or add a project. The ground-floor Atrium and top-floor meeting room are always available, even without any projects.')],
  ['📝', uiText('Draw together in the offices or the shared meeting room: press E at the whiteboard. Text, drawings and pictures stay on that board and everyone in the same space sees them live.')],
  ['🎉', uiText('Whenever a pull request merges, the gong next to the PR board rings, confetti rains down all over the floor and every worker gets up on its desk for a quick dance. Walk up to the gong and press E to bang it yourself')],
  ['N', uiText("Next worker that needs you: go to whoever needs input (they have a red beacon over their desk, and a banner up top says what each is asking), then whoever is done and nobody's looked at, longest-waiting first, and again for the next one. Arrows at the edge of the screen point to the ones out of sight")],
  ['🤝', uiText('Take the elevator to the shared meeting room, even without a project. Walk with WASD and press E at a chair to sit down or get up.')],
  [uiText('Drag / wheel'), uiText('Orbit and zoom the camera in third person')],
  ['P', uiText('Prompt: give a task to a new or existing worker at the desk you face')],
  ['C', uiText('Changes: what the worker at the desk you face changed — files and diff, commit, discard, open a PR')],
  ['B', uiText('Open a shared shell (dev servers, git, tests) at an empty desk')],
  ['R', uiText('Resume a sleeping worker')],
  ['X', uiText('Send a worker home (frees the desk)')],
  ['L', uiText('Hang a big sign over the desk you face ("Operations", "Code cleanup"), or change or take down the one there')],
  ['🚧', uiText('Room to grow: E at the sign on the north wall past the gong knocks through into a back office with 2 more desks, and again for 2 more. The same sign walls a row back up')],
  ['F', uiText('Hang a picture from the web on a wall. Look at a picture and press E to move, edit or take it down')],
  ['Q', uiText('Put back the issue card in your hands (E at a note on the issues board, or ✋ Pick it up in an issue; then E at an empty desk, a worker or the queue board)')],
  ['O', uiText('Open a pull request for a worker on its own branch, or see the one it has')],
  ['T', uiText('Chat')],
  ['/', uiText('Search the chat and every terminal on your floor, back to before the office last restarted')],
  [IS_MAC ? '⌘K' : 'Ctrl+K', uiText('Command palette: type a few letters to find a worker, issue, PR, service, board, teammate or action. Enter opens it, Shift+Enter walks you over to it first')],
  ['V', uiText('Join voice. In voice, hold V to talk (push to talk): you’re muted once you let go. Leave voice from the ☰ menu')],
  ['M', uiText('Mute or unmute your mic in voice. ⚙️ Settings can have you join muted, for push to talk')],
  ['Ctrl+Space', uiText('Dictate: in a worker’s terminal or a prompt box, hold Ctrl+Space (or the 🎤) and talk, and what you said is typed in when you let go, for you to read over and send. A quick tap leaves it listening until you tap again. The browser does the listening (Chrome, Edge and Safari can), so there’s nothing to install')],
  ['Tab', uiText('The ☰ menu, top right: every window, and what shows on screen. Pin what you use most to the top bar')],
  ['Esc', uiText('Close any window and get back to looking around')],
  ['Ctrl + [', uiText('Send Esc to a terminal instead, to close a menu like Claude’s /skills or interrupt Claude. ⎋ Esc in the terminal’s header does the same')],
  ['⚙️', uiText('Settings (in the ☰ menu): switch between first and third person')],
];
