"""Component checks and full-avatar checks are separate. No original validator edits."""
from pathlib import Path
from collections import Counter
import sys,json,hashlib
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from glb_reader import Asset
from contract_config import ROLES,STYLES
CONTRACT=json.loads((HERE/'resources/constraints.json').read_text(encoding='utf8'))
from inspect_character import inspect

def verify(out):
    out=Path(out);components={};assemblies={};errors=[]
    reference=Asset(HERE/'resources/male_reference.glb')
    reference_body=Counter((v,s) for n,m,v,s in reference.triangles() if not reference.ancestor(n,'char_hair'))
    reference_hair=Counter((v,s) for n,m,v,s in reference.triangles() if reference.ancestor(n,'char_hair'))
    female=Asset(out/'female_base.glb')
    female_body=Counter((v,s) for n,m,v,s in female.triangles() if not female.ancestor(n,'char_hair'))
    palette={m['name']:m['pbrMetallicRoughness']['baseColorFactor'] for m in reference.g['materials']}
    for style in STYLES:
        asset=Asset(out/'hair'/('hair_'+style+'.glb'));g=asset.g;ce=[]
        meshes=[n for n in g['nodes'] if 'mesh' in n]
        if len(meshes)!=(0 if style=='bald' else 1):ce.append('wrong mesh count')
        if [m['name'] for m in g.get('materials',[])]!=['char_mat_hair']:ce.append('wrong material set')
        if g.get('skins') or g.get('animations') or g.get('cameras'):ce.append('forbidden skin/animation/camera')
        if any(b.get('uri') for b in g.get('buffers',[])) or any(i.get('uri') for i in g.get('images',[])):ce.append('external resource')
        for n in g['nodes']:
            if n.get('translation',[0,0,0])!=[0,0,0] or n.get('rotation',[0,0,0,1])!=[0,0,0,1] or n.get('scale',[1,1,1])!=[1,1,1]:ce.append('nonidentity attachment transform')
        primitive_count=sum(len(m['primitives']) for m in g.get('meshes',[]))
        if primitive_count!=(0 if style=='bald' else 1):ce.append('wrong component primitive count')
        # Component vertices are relative to the head pivot (runtime Y=1.32 m).
        points=[v[:3] for _,_,triangle,_ in asset.triangles() for v in triangle]
        bounds=None
        if points:
            lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
            lo[1]+=1.32;hi[1]+=1.32;bounds={'assembled_min':lo,'assembled_max':hi}
            for i in range(3):
                if lo[i]<CONTRACT['profiles']['human']['bounds_min'][i]-.0001 or hi[i]>CONTRACT['profiles']['human']['bounds_max'][i]+.0001:ce.append('component outside assembled human envelope')
        components[style]={'status':'FAIL' if ce else 'PASS','errors':ce,'meshes':len(meshes),'primitives':primitive_count,
                           'triangles':len(list(asset.triangles())),'bounds_at_attachment':bounds,'source_sha256':hashlib.sha256(asset.data).hexdigest(),
                           'original_full_human_validator':'NOT_RUN','reason':'Hair components do not contain the full human rig; tested by component rules instead.'}
    for base in ['male','female']:
        for style in STYLES:
            key=base+'_'+style;path=out/'assemblies'/(key+'.glb');asset=Asset(path)
            manifest=json.loads(path.with_suffix('.manifest.json').read_text(encoding='utf8'))
            strict=inspect(asset.data,CONTRACT,'human',manifest)
            allowed={'Budget exceeded: materials','Budget exceeded: primitives','Manifest deviations require separate review; not an in-contract PASS'}
            ae=[e for e in strict['errors'] if e not in allowed]
            if strict['metrics']['materials']>11 or strict['metrics']['primitives']>25:ae.append('requested budget exceeded')
            if manifest['material_roles']!=ROLES:ae.append('material role mapping differs')
            for mat in asset.g['materials']:
                name=mat['name'];rgba=mat.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])
                if name not in palette or max(abs(x-y) for x,y in zip(rgba,palette[name]))>1e-6:ae.append('initial palette differs: '+name)
            if not asset.ancestor('char_eyebrows_visual','char_head') or asset.ancestor('char_eyebrows_visual','char_hair'):ae.append('eyebrows parent')
            if base=='male':
                body=Counter((v,s) for n,m,v,s in asset.triangles() if not asset.ancestor(n,'char_hair'))
                if body!=reference_body:ae.append('male body changed')
                if style=='short':
                    hair=Counter((v,s) for n,m,v,s in asset.triangles() if asset.ancestor(n,'char_hair'))
                    if hair!=reference_hair:ae.append('short hairstyle differs from original')
            else:
                body=Counter((v,s) for n,m,v,s in asset.triangles() if not asset.ancestor(n,'char_hair'))
                if body!=female_body:ae.append('female body changed across hairstyles')
                if style=='short' and asset.signatures()!=female.signatures():ae.append('default female differs from tested short assembly')
                used={}
                for n,m,v,s in asset.triangles():used.setdefault(m,set()).add(n)
                if used.get('char_mat_pants')!={'char_torso_visual'}:ae.append('female skirt material assignment')
                if not {'char_leg_negx_visual','char_leg_posx_visual'}<=used.get('char_mat_skin',set()):ae.append('bare legs missing skin channel')
                if used.get('char_mat_shoes')!={'char_leg_negx_visual','char_leg_posx_visual'}:ae.append('heels material assignment')
            h=[n for n in asset.g['nodes'] if 'mesh' in n and asset.ancestor(n['name'],'char_hair')]
            if len(h)!=(0 if style=='bald' else 1):ae.append('more than one hair mesh/style active')
            # Underlying head must be closed after welding the GLB split vertices.
            edges=Counter()
            for n,m,tri,s in asset.triangles():
                if n!='char_head_visual':continue
                p=[v[:3] for v in tri]
                for a,b in [(p[0],p[1]),(p[1],p[2]),(p[2],p[0])]:edges[tuple(sorted((a,b)))]+=1
            if any(v!=2 for v in edges.values()):ae.append('head not complete/closed')
            assemblies[key]={'status':'FAIL' if ae else 'PASS','errors':ae,'metrics':strict['metrics'],
                              'original_validator_status':strict['status'],'original_validator_errors':strict['errors'],
                              'source_sha256':hashlib.sha256(asset.data).hexdigest()}
    status='PASS' if all(v['status']=='PASS' for v in [*components.values(),*assemblies.values()]) else 'FAIL'
    return {'status':status,'component_checks':components,'assembled_avatar_checks':assemblies,
             'scope':'Current request: 11 materials/25 primitives, all other original limits unchanged. Legacy full-rig validator results retained separately.'}

if __name__=='__main__':
    out=Path(sys.argv[1]) if len(sys.argv)>1 else HERE
    result=verify(out);print(json.dumps(result,indent=2));sys.exit(0 if result['status']=='PASS' else 1)
