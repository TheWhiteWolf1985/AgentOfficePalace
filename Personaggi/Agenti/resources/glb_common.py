"""Inspect a GLB and this kit's profile using only Python's standard library.
This is not the complete Khronos validator or a replacement for Blender/manual review.
"""
from pathlib import Path
import argparse,hashlib,json,math,re,struct,sys

I=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
def mul(a,b):return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
def transform(m,p):return [sum(m[r][k]*([*p,1][k]) for k in range(4)) for r in range(3)]
def local(n):
    if 'matrix' in n:
        v=n['matrix']
        if len(v)!=16:raise ValueError('node matrix length')
        return [[v[c*4+r] for c in range(4)] for r in range(4)]
    x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1]);tx,ty,tz=n.get('translation',[0,0,0])
    if not all(math.isfinite(v) for v in [x,y,z,w,sx,sy,sz,tx,ty,tz]):raise ValueError('nonfinite transform')
    if abs(x*x+y*y+z*z+w*w-1)>0.001:raise ValueError('non-unit quaternion')
    return [[(1-2*(y*y+z*z))*sx,2*(x*y-z*w)*sy,2*(x*z+y*w)*sz,tx],
            [2*(x*y+z*w)*sx,(1-2*(x*x+z*z))*sy,2*(y*z-x*w)*sz,ty],
            [2*(x*z-y*w)*sx,2*(y*z+x*w)*sy,(1-2*(x*x+y*y))*sz,tz],[0,0,0,1]]

def parse(data):
    if len(data)<20:raise ValueError('GLB truncated')
    magic,version,length=struct.unpack_from('<III',data)
    if magic!=0x46546c67 or version!=2 or length!=len(data):raise ValueError('GLB header/version/length invalid')
    chunks=[];offset=12
    while offset<len(data):
        if offset+8>len(data):raise ValueError('chunk header truncated')
        length,kind=struct.unpack_from('<II',data,offset);offset+=8
        if length%4 or offset+length>len(data):raise ValueError('chunk length/alignment invalid')
        chunks.append((kind,data[offset:offset+length]));offset+=length
    if not chunks or chunks[0][0]!=0x4e4f534a:raise ValueError('first chunk must be JSON')
    if sum(t==0x4e4f534a for t,_ in chunks)!=1 or sum(t==0x004e4942 for t,_ in chunks)>1:raise ValueError('duplicate chunks')
    g=json.loads(chunks[0][1]);binary=next((v for t,v in chunks if t==0x004e4942),b'')
    if g.get('asset',{}).get('version')!='2.0':raise ValueError('asset.version must be2.0')
    return g,binary

