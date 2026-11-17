"""Validate the original female/hair delivery and copy only the runtime assets."""
from pathlib import Path
import copy,hashlib,json,shutil,sys
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'Personaggi/Utenti_femmina'
POLICY=json.loads((ROOT/'scripts/policies/female-avatar-v03.json').read_text(encoding='utf8'))

def require(ok,message):
    if not ok:raise ValueError(message)

def validate(raw,contract,manifest):
    for name,digest in POLICY['original_files'].items():
        require(hashlib.sha256((SOURCE/'resources'/name).read_bytes()).hexdigest()==digest,'Original tool changed: '+name)
    sys.path.insert(0,str(SOURCE/'resources'))
    from inspect_character import inspect
    require(contract['contract']==POLICY['extends'] and contract['version']==POLICY['contract_version'],'Wrong rig contract')
    require(manifest['asset_id']==POLICY['asset_id'] and manifest['design_revision']==POLICY['revision'],'Unsupported female revision')
    for role in POLICY['material_roles']:
        require(manifest['material_roles'].get(role)=='char_mat_'+role,'Wrong material role: '+role)
    fixed=manifest.get('fixed_accessory',{})
    require(fixed.get('node')=='char_bow_visual' and fixed.get('parent')=='char_head' and fixed.get('outside_hair_group') is True and fixed.get('removable') is False and fixed.get('editable_property')=='color_only' and fixed.get('material')=='char_mat_bow','Wrong fixed bow contract')
    expected=[{'field':'materials','legacy_limit':8,'requested_limit':11},{'field':'primitives','legacy_limit':24,'requested_limit':25},{'field':'current_request.materials','limit':11,'actual':12,'reason':'Fixed bow independent color'},{'field':'current_request.primitives','limit':25,'actual':26,'reason':'Fixed bow under head'}]
    require(manifest.get('deviations')==expected,'Unreviewed deviations')
    original=inspect(raw,contract,'human',manifest)
    require(set(original['errors'])=={'Budget exceeded: materials','Budget exceeded: primitives','Manifest deviations require separate review; not an in-contract PASS'},'Unexpected rig failures: '+str(original['errors']))
    updated=copy.deepcopy(contract);updated['profiles']['human']['limits'].update(POLICY['limits'])
    updated['profiles']['human']['required_material_roles']=POLICY['material_roles']
    reviewed=copy.deepcopy(manifest);reviewed['deviations']=[]
    application=inspect(raw,updated,'human',reviewed)
    require(application['status']=='PASS','Female application policy failed: '+str(application['errors']))
    return {'policy':POLICY['id'],'original_contract':original,'application_policy':application}

def main():
    inventory=json.loads((SOURCE/'checksums.json').read_text(encoding='utf8'))['files']
    for name,digest in inventory.items():
        path=SOURCE/name
        require(path.resolve().is_relative_to(SOURCE.resolve()),'Inventory path escapes delivery')
        require(hashlib.sha256(path.read_bytes()).hexdigest()==digest,'Delivery checksum mismatch: '+name)
    sys.path.insert(0,str(SOURCE))
    from verify_assets import verify
    checks=verify(SOURCE)
    require(checks['functional_status']=='PASS','Component/assembly functional checks failed')
    require(set(checks['component_checks'])==set(POLICY['styles']),'Incomplete hairstyle set')
    require(set(checks['assembled_avatar_checks'])=={base+'_'+style for base in ['male','female'] for style in POLICY['styles']},'Incomplete cross-base checks')
    contract=json.loads((SOURCE/'resources/constraints.json').read_text(encoding='utf8'))
    manifest=json.loads((SOURCE/'female_base.manifest.json').read_text(encoding='utf8'))
    report=validate((SOURCE/'female_base.glb').read_bytes(),contract,manifest)
    require((SOURCE/'resources/male_reference.glb').read_bytes()==(ROOT/'src/client/models/human_base.glb').read_bytes(),'Male reference differs from runtime base')
    shutil.copyfile(SOURCE/'female_base.glb',ROOT/'src/client/models/female_base.glb')
    for style in POLICY['styles']:
        if style!='bald':shutil.copyfile(SOURCE/'hair'/('hair_'+style+'.glb'),ROOT/'src/client/models'/('hair_'+style+'.glb'))
    print(json.dumps(report))
    print('FEMALE_AND_HAIR_IMPORTED',manifest['sha256'],'inventory',len(inventory),'components',len(checks['component_checks']),'assemblies',len(checks['assembled_avatar_checks']))

if __name__=='__main__':main()
