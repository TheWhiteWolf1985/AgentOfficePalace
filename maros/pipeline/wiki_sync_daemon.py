#!/usr/bin/env python3
"""Mantiene il vault di prova identico al branch main del Forgejo locale."""
import json,os,subprocess,sys,time
from pathlib import Path
from wiki_publish import publish

remote="ssh://git@192.168.1.76:2222/officeagents/documentazione.git"
cache=Path("/sync/repository.git")
parent=Path("/published")
vault=parent/"vault"
os.environ["GIT_SSH_COMMAND"]="ssh -F /dev/null -i /run/readonly/id_ed25519 -o UserKnownHostsFile=/run/known_hosts -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10"
os.environ["GIT_TERMINAL_PROMPT"]="0"
def git(*args):
 return subprocess.run(["git",*args],capture_output=True,text=True,check=True,timeout=180).stdout.strip()
while True:
 try:
  if not cache.exists():
   git("clone","--bare",remote,str(cache))
  elif git("--git-dir",str(cache),"remote","get-url","origin")!=remote:
   raise ValueError("Remoto della cache non riconosciuto")
  git("--git-dir",str(cache),"fetch","--prune","origin","+refs/heads/*:refs/heads/*")
  commit=git("--git-dir",str(cache),"rev-parse","refs/heads/main^{commit}")
  for required in ("95_Template/Progetto.md","99_Controllo/strumenti/wiki.py","99_Controllo/evidenze/fonti.json"):
   git("--git-dir",str(cache),"cat-file","-e",commit+":"+required)
  marker=parent/".vault.publisher.json"
  old=json.loads(marker.read_text()).get("commit") if marker.is_file() else None
  if old!=commit or not vault.is_dir():
   result=publish(cache,vault,"refs/heads/main")
   print("vault aggiornato: "+json.dumps(result),flush=True)
 except Exception as e:
  print("sincronizzazione non riuscita: "+str(e)[:400],file=sys.stderr,flush=True)
 time.sleep(15)
