import type { Look } from '../../../shared/avatar';
import { avatarModel } from '../../../shared/avatar-variants';
import { model, type ModelName } from '../models';
import { Person, type PersonAssets } from './person';

const assets: PersonAssets = {
  body: variant => model(variant === 'female' ? 'human_female' : 'human_base')?.scene ?? null,
  hair: style => style === 'bald' ? null : model(`hair_${style}` as ModelName)?.scene ?? null,
};

/** Local users, peers and preview use the same preloaded body/hair sources. */
export function createUserPerson(name: string, color: string, look: Look): Person {
  return new Person(name, color, look, assets.body(avatarModel(look)) ?? undefined, assets);
}
