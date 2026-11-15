/** The office gong and its work celebrations. */
export type GongWhy = 'hit' | 'merged' | 'queue';
export type RooftopClientMsg = { t: 'gong' };
export type RooftopServerMsg = { t: 'gong'; why: GongWhy; by?: string; pr?: number };
