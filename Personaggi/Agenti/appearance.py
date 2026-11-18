"""Deterministic appearance data examples, no runtime/app integration."""
import random
STYLES=['short','long','bun','spiky','curly','ponytail','bald']
BASES=['agent_male_base','agent_female_base']
COLORS={
 'skin':[(.020,.025,.033),(.030,.048,.070),(.065,.060,.080),(.10,.12,.14)],
 'hair':[(.38,.245,.115),(.69,.43,.115),(.08,.030,.014),(.018,.012,.009),(.30,.025,.014),(.5,.53,.57)],
 'eyebrows':[(.008,.72,.78),(.020,.38,.95),(.45,.05,.75),(.10,.60,.20),(.85,.42,.015)],
 'iris':[(.008,.72,.78),(.020,.38,.95),(.45,.05,.75),(.10,.60,.20),(.85,.42,.015)],
 'clothing':[(.075,.016,.047),(.018,.032,.075),(.012,.060,.047),(.045,.045,.055),(.10,.022,.019)],
 'shirt':[(.78,.82,.84),(.90,.88,.82),(.13,.17,.21)],
 'tie':[(.008,.72,.78),(.020,.38,.95),(.45,.05,.75),(.85,.42,.015)],
 'pants':[(.055,.012,.036),(.018,.032,.075),(.020,.024,.030),(.012,.045,.033)],
 'shoes':[(.006,.009,.014),(.03,.025,.021),(.045,.055,.07)],
 'accent':[(.008,.72,.78),(.020,.38,.95),(.45,.05,.75),(.85,.42,.015)],
 'mouth':[(.008,.72,.78),(.020,.38,.95),(.45,.05,.75),(.10,.60,.20)],
 'bow':[(.008,.72,.78),(.020,.38,.95),(.45,.05,.75),(.85,.42,.015)]}
def make_look(seed,base=None):
    r=random.Random(str(seed));base=base or r.choice(BASES)
    roles=[n for n in COLORS if n!='bow' or base=='agent_female_base']
    return {'schema':'AOP_APPEARANCE_DRAFT_1','seed':str(seed),'asset_id':base,'hairstyle':r.choice(STYLES),
        'colors':{n:list(r.choice(COLORS[n])) for n in roles},
        'note':'Asset-level sample data; runtime randomization is NOT_RUN. Status is controlled separately, never randomized.'}
