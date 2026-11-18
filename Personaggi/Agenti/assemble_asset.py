"""Blender asset assembly only; does not create software agents in the app."""
from pathlib import Path
import sys,argparse
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from build_scene import load,apply_look,export,ASSETS,attach,write
from appearance import make_look,STYLES
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--asset',choices=ASSETS,required=True)
    ap.add_argument('--style',choices=STYLES);ap.add_argument('--seed');ap.add_argument('--out',type=Path,required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    base=HERE/'assets'/(args.asset+'.glb');load(base)
    look=make_look(args.seed,args.asset) if args.seed is not None else None
    if look:
        if args.style:look['hairstyle']=args.style
        apply_look(look);style=look['hairstyle']
    else:
        style=args.style or ('short' if args.asset=='agent_male_base' else 'long');attach(style,HERE/'hair')
    args.out.parent.mkdir(parents=True,exist_ok=True);export(args.out.resolve(),args.asset,style,base)
    if look:write(args.out.with_suffix('.look.json'),look)
    print('ASSEMBLED_DRAFT_ASSET',args.out,flush=True)
