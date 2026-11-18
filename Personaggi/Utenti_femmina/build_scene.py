"""Build the complete package into a chosen folder, using Blender only."""
from pathlib import Path
import sys,argparse
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from delivery_runtime import build
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path,default=HERE)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    build(args.out)
    print('BUILD_COMPLETE',args.out,flush=True)
