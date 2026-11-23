import { italianServerPanels } from './it-server-panels.js';
import { italianPlugins } from './it-plugins.js';
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
export const italian: Readonly<Record<string, string>> = { 'Stop the container before changing the model or instructions.': 'Ferma il container prima di modificare il modello o le istruzioni.', 'Create Codex agent': 'Crea agente Codex', 'Office name': 'Nome ufficio', 'Create local office': 'Crea ufficio locale', 'The agent starts at a free desk with a private copy of the committed project.': 'L’agente occuperà una scrivania libera e lavorerà su una copia privata dell’ultimo commit del progetto.', 'Codex sign-in': 'Accesso Codex', 'Connect ChatGPT': 'Collega ChatGPT', 'Connect API key': 'Collega chiave API', 'OpenAI API key': 'Chiave API OpenAI', 'Open ChatGPT': 'Apri ChatGPT', 'Waiting for the device code…': 'In attesa del codice dispositivo…', 'Codex connected': 'Codex collegato', 'Sign-in failed. Check device-code access or use an API key.': 'Accesso non riuscito. Verifica che il codice dispositivo sia abilitato oppure usa una chiave API.', 'Start container': 'Avvia container', 'Stop container': 'Ferma container', 'Remove agent': 'Rimuovi agente', 'Remove agent?': 'Rimuovere l’agente?', 'The private checkout is retained. Its Codex sign-in and session history will be removed.': 'La copia di lavoro verrà conservata. Verranno eliminati l’accesso Codex e lo storico delle sessioni dell’agente.', 'Avatar model': 'Modello', 'Hairstyle': 'Acconciatura', 'Female': 'Femminile', 'Male': 'Maschile', 'No hair': 'Senza capelli', 'Skirt': 'Gonna', 'Bow': 'Fiocco', 'Dress shirt': 'Camicia', 'Skin': 'Pelle', 'Eyebrows': 'Sopracciglia', 'Eyes': 'Occhi', 'Jacket': 'Giacca', 'Tie': 'Cravatta', 'Trousers': 'Pantaloni', 'Shoes': 'Scarpe', 'Original colors': 'Colori originali', 'Use a color such as #123ABC.': 'Usa un colore come #123ABC.', 'Everyone sees your changes after you save.': 'Le modifiche sono visibili a tutti dopo il salvataggio.', 'Atrium': 'Atrio', 'Ground floor · reception and lounge': 'Piano terra · reception e salottini', ...part0, ...part1, ...part2, ...part3, ...part4, ...part5, ...part6, ...italianConnections, ...italianConferenceRoom, ...italianReceptionSign, ...italianAppOptimizations, ...italianGraphics, ...italianAgentAppearance, ...italianServerPanels, ...italianPlugins };
