#!/usr/bin/env python3
"""Pubblica esattamente i file Git del commit indicato in un vault dedicato."""
import argparse,ctypes,fcntl,hashlib,json,os,shutil,subprocess,sys,tarfile,tempfile
from pathlib import Path
def command(*cmd,**kwargs):
 return subprocess.run(cmd,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs).stdout
def publish(repo,vault,ref):
 repo=Path(repo).resolve(strict=True)
 vault=Path(vault).absolute()
 parent=vault.parent.resolve(strict=True)
 if vault.is_symlink() or vault.name in ("",".",".."): raise ValueError("Destinazione non valida")
 marker=parent/("."+vault.name+".publisher.json")
 lock=parent/("."+vault.name+".publisher.lock")
 with open(lock,"a") as lockfile:
  fcntl.flock(lockfile,fcntl.LOCK_EX)
  if vault.exists() and not marker.is_file(): raise ValueError("Vault esistente non gestito: rifiutata la sostituzione")
  commit=command("git","-C",str(repo),"rev-parse","--verify",ref+"^{commit}").decode().strip()
  fmt=command("git","-C",str(repo),"rev-parse","--show-object-format").decode().strip()
  if fmt not in ("sha1","sha256"): raise ValueError("Formato oggetti non supportato")
  entries=command("git","-C",str(repo),"ls-tree","-r","-z",commit).split(b"\0")
  expected={}
  for e in entries:
   if not e: continue
   header,path=e.split(b"\t",1); mode,kind,oid=header.decode().split()
   name=path.decode("utf-8")
   parts=Path(name).parts
   if name.startswith("/") or ".." in parts or kind!="blob" or mode not in ("100644","100755"): raise ValueError("Percorso o tipo file non consentito")
   expected[name]=oid
  stage=Path(tempfile.mkdtemp(prefix="."+vault.name+".staging-",dir=parent))
  archive=None
  try:
   fd,archive=tempfile.mkstemp(prefix="."+vault.name+".archive-",dir=parent)
   with os.fdopen(fd,"wb") as out:
    subprocess.run(["git","-C",str(repo),"archive","--format=tar",commit],stdout=out,stderr=subprocess.PIPE,check=True)
   with tarfile.open(archive,"r") as tar:
    for m in tar:
     parts=Path(m.name).parts
     if m.name.startswith("/") or ".." in parts or not (m.isfile() or m.isdir()): raise ValueError("Archivio contiene voci non consentite")
     dest=stage.joinpath(*parts)
     if m.isdir():
      dest.mkdir(parents=True,exist_ok=True)
     else:
      dest.parent.mkdir(parents=True,exist_ok=True)
      data=tar.extractfile(m)
      if data is None: raise ValueError("Contenuto archivio non disponibile")
      with data,dest.open("xb") as out: shutil.copyfileobj(data,out)
      os.chmod(dest,0o755 if m.mode & 0o111 else 0o644)
   actual={}
   for p in stage.rglob("*"):
    if p.is_symlink(): raise ValueError("Collegamento simbolico non consentito")
    if p.is_file():
     name=p.relative_to(stage).as_posix()
     digest=hashlib.new(fmt); digest.update(("blob "+str(p.stat().st_size)+"\0").encode())
     with p.open("rb") as f:
      for chunk in iter(lambda:f.read(1024*1024),b""):digest.update(chunk)
     actual[name]=digest.hexdigest()
   if actual!=expected: raise ValueError("I file estratti non corrispondono al commit Git")
   if vault.exists():
    if not vault.is_dir(): raise ValueError("Vault non e una directory")
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.renameat2(-100,os.fsencode(stage),-100,os.fsencode(vault),2)!=0:
     e=ctypes.get_errno(); raise OSError(e,os.strerror(e))
    shutil.rmtree(stage)
   else: os.replace(stage,vault)
   tmp=marker.with_suffix(".tmp")
   tmp.write_text(json.dumps({"commit":commit,"files":len(expected)})+"\n")
   os.replace(tmp,marker)
   return {"commit":commit,"files":len(expected),"identical":True}
  finally:
   if archive and os.path.exists(archive):os.unlink(archive)
   if stage.exists():shutil.rmtree(stage)
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--repo",required=True);p.add_argument("--vault",required=True);p.add_argument("--ref",default="refs/remotes/origin/main")
 try:
  a=p.parse_args();print(json.dumps(publish(a.repo,a.vault,a.ref)));sys.exit(0)
 except (ValueError,OSError,subprocess.CalledProcessError,tarfile.TarError) as e:
  print(json.dumps({"error":str(e)}),file=sys.stderr);sys.exit(1)
