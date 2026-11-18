"""Attach one modular hairstyle to the base. Run with background Blender."""
from pathlib import Path
import sys,argparse,bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from delivery_runtime import CONFIG,STYLES,attach,empty_scene,export_avatar
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--base',type=Path,default=HERE/(CONFIG['asset']+'.glb'))
    ap.add_argument('--style',choices=STYLES,required=True);ap.add_argument('--out',type=Path,required=True)
    ap.add_argument('--blend',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    empty_scene();bpy.ops.import_scene.gltf(filepath=str(args.base.resolve()))
    attach(args.style);export_avatar(args.out.resolve(),args.style,reference_body=args.base.resolve())
    if args.blend:bpy.ops.wm.save_as_mainfile(filepath=str(args.out.resolve().with_suffix('.blend')))
    print('ASSEMBLED',args.style,args.out,flush=True)
