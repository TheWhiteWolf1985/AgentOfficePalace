import part0 from './it-1.js';
import part1 from './it-2.js';
import part2 from './it-3.js';
import part3 from './it-4.js';
import part4 from './it-5.js';
import part5 from './it-6.js';
import part6 from './it-7.js';
import { italianConnections } from './it-connections.js';
/** Italian UI catalogue; English source text is the fallback. */
export const italian: Readonly<Record<string, string>> = { ...part0, ...part1, ...part2, ...part3, ...part4, ...part5, ...part6, ...italianConnections };
