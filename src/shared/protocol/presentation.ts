export interface PresentationState { mode: 'whiteboard' | 'presentation'; presenter?: string; revision: number }
export type PresentationClientMsg = { t: 'conference.present'; mode: 'whiteboard' | 'presentation' };
export type PresentationServerMsg = { t: 'conference.presentation'; state: PresentationState };
