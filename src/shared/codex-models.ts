import catalogue from './codex-models.json' with {type:'json'};
import { isAgentEffort, type ModelOption } from './providers.js';

/** Extracted with `codex debug models --bundled` from the shipped agent image. */
export const CODEX_CATALOGUE_VERSION = catalogue.cliVersion.replace('codex-cli ','');
export const CODEX_MODEL_OPTIONS: ModelOption[] = catalogue.models.map(m => ({
  id:m.id, name:m.name, efforts:m.efforts.filter(isAgentEffort),
}));
