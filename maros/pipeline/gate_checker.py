#!/usr/bin/env python3
"""Controlla un commit di PR rispetto a main usando la cache Git locale."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
cache=Path("/sync/repository.git")
scratch=Path("/pipeline-work")
trusted=Path("/wiki-tools")
def cmd(*args,timeout=240):
 return subprocess.run(args,capture_output=True,text=True,check=True,timeout=timeout).stdout.strip()
def run(head,base):
 if len(head)!=40 or len(base)!=40: raise ValueError("Commit non validi")
 with tempfile.TemporaryDirectory(prefix="check-",dir=scratch) as name:
  target=Path(name)/"checkout"
  cmd("git","clone","--quiet","--shared","--no-checkout",str(cache),str(target))
  cmd("git","-C",str(target),"checkout","--quiet","--detach",head)
  cmd("git","-C",str(target),"cat-file","-e",base+"^{commit}")
  # A reviewed branch must contain the current main: no unchecked integration tree.
  if subprocess.run(["git","-C",str(target),"merge-base","--is-ancestor",base,head],capture_output=True).returncode:
   raise ValueError("Main e avanzato: aggiornare il branch e ripetere le revisioni sul nuovo commit")
  t=target/"99_Controllo/strumenti"
  for f in ("wiki.py","verifica_metodo.py","verifica_documenti.py","contratto_documentale.json","legacy_documenti.json"):
   if not (t/f).is_file() or hashlib.sha256((t/f).read_bytes()).digest()!=hashlib.sha256((trusted/f).read_bytes()).digest():
    raise ValueError("Checker o contratto diverso dalla versione autorizzata: "+f)
  r=subprocess.run(["python3","-B","/opt/maros-pipeline/wiki_checks.py","--vault",str(target),"--base",base],capture_output=True,text=True,timeout=300)
  try: data=json.loads(r.stdout)
  except json.JSONDecodeError: raise ValueError("Esito checker non interpretabile")
  if r.returncode or not data.get("passed"):
   bad=[x["name"] for x in data.get("checks",[]) if not x.get("passed")]
   raise ValueError("Controlli documentali non superati: "+", ".join(bad))
  if data.get("commit")!=head or data.get("base")!=base: raise ValueError("I checker hanno esaminato una revisione diversa")
  return data
if __name__=="__main__":
 try:
  data=run(sys.argv[1],sys.argv[2])
  print(json.dumps({"passed":True,"commit":data["commit"]}))
 except (OSError,ValueError,subprocess.CalledProcessError,subprocess.TimeoutExpired,IndexError) as e:
  print(json.dumps({"passed":False,"error":str(e)[:400]}));sys.exit(1)
