"""Generate female base, seven modular components and 14 testing assemblies."""
from pathlib import Path
import sys,argparse,shutil,json
import bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from support import empty_scene,write_json,RES
from hair_design import STYLES,build_component
from female_design import build_female
from assemble import load_base,attach_hair
from package_core import export_component,export_avatar,sha

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,default=HERE/'generated')
    out=ap.parse_args(sys.argv[sys.argv.index('--')+1:]).out.resolve();out.mkdir(parents=True,exist_ok=True)
    if not bpy.app.background or '--factory-startup' not in sys.argv:raise RuntimeError('Use background factory startup')
    bpy.context.preferences.filepaths.save_version=0
    for style in STYLES:
        root=build_component(style)
        path=out/'hair'/('hair_'+style+'.glb')
        export_component(path,style)
        bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.blend')))
    build_female();attach_hair(out/'hair/hair_short.glb','short')
    export_avatar(out/'female_base.glb','female_base_v02','short')
    bpy.context.scene.name='Female_Base_Short'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'female_base.blend'))
    (out/'reference').mkdir(exist_ok=True)
    shutil.copy2(RES/'male_reference.glb',out/'reference/male_reference.glb')
    report={}
    for base in ['male','female']:
        for style in STYLES:
            source=RES/'male_reference.glb' if base=='male' else out/'female_base.glb'
            load_base(source);attach_hair(out/'hair'/('hair_'+style+'.glb'),style)
            asset=base+'_'+style;path=out/'assemblies'/(asset+'.glb')
            report[asset]=export_avatar(path,asset,style,reference_body=source)
            bpy.context.scene.name=asset
            bpy.ops.wm.save_as_mainfile(filepath=str(path.with_suffix('.blend')))
    write_json(out/'BUILD_REPORT.json',{'status':'PASS','assemblies':report,'male_reference_sha256':sha(RES/'male_reference.glb')})
    write_json(out/'hair/CATALOG.json',{'styles':STYLES,'default':'short','one_active_only':True,
        'shared_bases':['human_base_v02','female_base_v02'],'attachment':'char_hair at local identity',
        'bald':'empty component; remove all existing hair mesh children; head and eyebrows remain visible'})
    print('FEMALE_AND_MODULAR_HAIR_BUILD_DONE',out,flush=True)

if __name__=='__main__':main()
