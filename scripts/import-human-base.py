"""Apply the explicit application policy, preserving the producer's strict original FAIL report."""
from pathlib import Path
import copy,hashlib,json,shutil,sys
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'Personaggi/Utenti'
POLICY=json.loads((ROOT/'scripts/policies/human-base-v02.json').read_text(encoding='utf8'))

def require(condition,message):
    if not condition:raise ValueError(message)

def validate(raw,contract,manifest):
    for name,digest in POLICY['original_files'].items():
        require(hashlib.sha256((SOURCE/'resources'/name).read_bytes()).hexdigest()==digest,'Original tool/contract changed: '+name)
    sys.path.insert(0,str(SOURCE/'resources'))
    from inspect_character import inspect
    require(contract['contract']==POLICY['extends'] and contract['version']==POLICY['contract_version'],'Wrong base contract')
    require(manifest['asset_id']==POLICY['asset_id'] and manifest['design_revision']==POLICY['revision'],'Unsupported human revision')
    for role in POLICY['material_roles']:
        require(manifest['material_roles'].get(role)=='char_mat_'+role,'Wrong material role: '+role)
    expected=[{'field':'profiles.human.limits.'+name,'original_limit':contract['profiles']['human']['limits'][name],'actual':limit} for name,limit in POLICY['limits'].items()]
    deviations=[{key:item.get(key) for key in ['field','original_limit','actual']} for item in manifest.get('deviations',[])]
    require(deviations==expected,'Unreviewed deviations')
    strict=inspect(raw,contract,'human',manifest)
    require(set(strict['errors'])=={'Budget exceeded: materials','Budget exceeded: primitives','Manifest deviations require separate review; not an in-contract PASS'},'Unexpected original contract failures: '+str(strict['errors']))
    # Only these two human budgets are extended. Every other original check runs unchanged.
    application_contract=copy.deepcopy(contract)
    application_contract['profiles']['human']['limits'].update(POLICY['limits'])
    application_contract['profiles']['human']['required_material_roles']=POLICY['material_roles']
    reviewed_manifest=copy.deepcopy(manifest)
    reviewed_manifest['deviations']=[]
    application=inspect(raw,application_contract,'human',reviewed_manifest)
    require(application['status']=='PASS','Application policy failed: '+str(application['errors']))
    return {'policy':POLICY['id'],'original_contract':strict,'application_policy':application}

def main():
    inventory=json.loads((SOURCE/'checksums.json').read_text(encoding='utf8'))['files']
    for name,sha in inventory.items():
        p=SOURCE/name
        require(p.resolve().is_relative_to(SOURCE.resolve()),'Inventory path outside delivery: '+name)
        require(hashlib.sha256(p.read_bytes()).hexdigest()==sha,'Inventory checksum mismatch: '+name)
    manifest=json.loads((SOURCE/'human_base.manifest.json').read_text(encoding='utf8'))
    contract=json.loads((SOURCE/'resources/constraints.json').read_text(encoding='utf8'))
    result=validate((SOURCE/'human_base.glb').read_bytes(),contract,manifest)
    shutil.copyfile(SOURCE/'human_base.glb',ROOT/'src/client/models/human_base.glb')
    print(json.dumps(result))
    print('HUMAN_BASE_IMPORTED',manifest['sha256'],'inventory files',len(inventory))

if __name__=='__main__':main()
