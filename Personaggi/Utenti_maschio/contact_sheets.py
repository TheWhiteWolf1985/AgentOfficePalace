"""Portable contact sheets from Blender RGB/RGBA PNG renders, standard library only."""
from pathlib import Path
import struct, zlib, binascii

def read_png(path):
    data=Path(path).read_bytes()
    offset=8; packed=b''
    while offset<len(data):
        n=struct.unpack_from('>I',data,offset)[0]
        kind=data[offset+4:offset+8]; chunk=data[offset+8:offset+8+n]
        if kind==b'IHDR':
            w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',chunk)
            if depth!=8 or color not in [2,6] or interlace:raise ValueError('Expected noninterlaced RGB/RGBA8')
            channels=3 if color==2 else 4
        if kind==b'IDAT':packed+=chunk
        offset+=n+12
    raw=zlib.decompress(packed); stride=w*channels; rows=[]; previous=bytearray(stride); j=0
    for _ in range(h):
        filter_type=raw[j]; j+=1
        row=bytearray(raw[j:j+stride]); j+=stride
        if filter_type:
            for x in range(stride):
                a=row[x-channels] if x>=channels else 0
                b=previous[x]; c=previous[x-channels] if x>=channels else 0
                if filter_type==1:v=a
                elif filter_type==2:v=b
                elif filter_type==3:v=(a+b)//2
                elif filter_type==4:
                    p=a+b-c; pa,pb,pc=abs(p-a),abs(p-b),abs(p-c)
                    v=a if pa<=pb and pa<=pc else b if pb<=pc else c
                else:raise ValueError('PNG filter')
                row[x]=(row[x]+v)&255
        previous=row
        rows.append(row)
    return w,h,channels,rows

def sheet(paths, target, columns, tile=400):
    paths=list(paths); count=len(paths); rows=(count+columns-1)//columns
    w,h=columns*tile,rows*tile
    result=[bytearray([50,60,70,255]*w) for _ in range(h)]
    for i,path in enumerate(paths):
        iw,ih,ch,src=read_png(path)
        tx,ty=(i%columns)*tile,(i//columns)*tile
        for y in range(tile):
            sy=y*ih//tile; line=result[ty+y]
            for x in range(tile):
                sx=x*iw//tile; pixel=src[sy][sx*ch:sx*ch+ch]
                if ch==3:pixel.append(255)
                line[(tx+x)*4:(tx+x+1)*4]=pixel
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
    raw=b''.join(b'\x00'+r for r in result)
    Path(target).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+
                             chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))

def create(views):
    views=Path(views)
    for direction in ['side','back']:
        sheet([views/('reception_'+a+'_'+direction+'.png') for a in ['a','b']],views/(direction+'.png'),2,600)
    poses=['rest','walk_a','walk_b','sit','hold','paper_book','ladder','pole']
    for asset in ['reception_a','reception_b']:
        sheet([views/(asset+'_pose_'+p+'.png') for p in poses],views/(asset+'_poses.png'),4)
    sheet([views/(asset+'_pose_'+p+'.png') for asset in ['reception_a','reception_b'] for p in poses],views/'poses.png',8,300)

if __name__=='__main__':
    import sys
    create(sys.argv[1])
