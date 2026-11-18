import { italianAppOptimizations } from './it-app-optimizations.js';
import { italianGraphics } from './it-graphics.js';
import { italianReceptionSign } from './it-reception-sign.js';
import { italianConferenceRoom } from './it-conference-room.js';
import part0 from './it-1.js';
import part1 from './it-2.js';
import part2 from './it-3.js';
import part3 from './it-4.js';
import part4 from './it-5.js';
import part5 from './it-6.js';
import part6 from './it-7.js';
import { italianConnections } from './it-connections.js';
import { italianAgentAppearance } from './it-agent-appearance.js';
/** Italian UI catalogue; English source text is the fallback. */
export const italian: Readonly<Record<string, string>> = { 'Avatar model': 'Modello', 'Hairstyle': 'Acconciatura', 'Female': 'Femminile', 'Male': 'Maschile', 'No hair': 'Senza capelli', 'Skirt': 'Gonna', 'Bow': 'Fiocco', 'Dress shirt': 'Camicia', 'Skin': 'Pelle', 'Eyebrows': 'Sopracciglia', 'Eyes': 'Occhi', 'Jacket': 'Giacca', 'Tie': 'Cravatta', 'Trousers': 'Pantaloni', 'Shoes': 'Scarpe', 'Original colors': 'Colori originali', 'Use a color such as #123ABC.': 'Usa un colore come #123ABC.', 'Everyone sees your changes after you save.': 'Le modifiche sono visibili a tutti dopo il salvataggio.', 'Atrium': 'Atrio', 'Ground floor · reception and lounge': 'Piano terra · reception e salottini', ...part0, ...part1, ...part2, ...part3, ...part4, ...part5, ...part6, ...italianConnections, ...italianConferenceRoom, ...italianReceptionSign, ...italianAppOptimizations, ...italianGraphics, ...italianAgentAppearance };
