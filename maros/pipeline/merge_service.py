#!/usr/bin/env python3
"""Servizio di merge Forgejo: solo PR approvate dai ruoli nell'ordine previsto."""
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from gate_revisioni import valuta_gate

BASE = "http://192.168.1.76:3000/api/v1"
REPO = os.environ.get("MAROS_FORGEJO_REPO", "officeagents/documentazione")
TOKEN = Path("/run/mergebot/forgejo-token")
SECRET = Path("/run/mergebot/broker-secret")

class GateError(Exception):
    pass

def api(method, path, payload=None, allow404=False):
    req = urllib.request.Request(BASE + path, method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization":"token " + TOKEN.read_text().strip(),
                 "Content-Type":"application/json", "Accept":"application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        if allow404 and e.code == 404:
            return None
        try:
            message = json.loads(e.read(4096)).get("message", "")
        except Exception:
            message = ""
        raise GateError("Forgejo ha rifiutato l'operazione (HTTP %s): %s" % (e.code, message[:250])) from None

def reviews(path):
    result=[]
    for page in range(1,21):
        rows=api("GET", path+"/reviews?limit=50&page="+str(page))
        if not isinstance(rows,list):
            raise GateError("Elenco revisioni non disponibile")
        result.extend(rows)
        if len(rows)<50:
            return result
    raise GateError("Troppe revisioni: controllo incompleto")

def merge(number, expected):
    if not isinstance(number,int) or isinstance(number,bool) or number<=0:
        raise GateError("Numero PR non valido")
    if not isinstance(expected,str) or not re.fullmatch(r"[0-9a-fA-F]{40}",expected):
        raise GateError("Commit della revisione non valido")
    owner,name=REPO.split("/",1)
    repo="/repos/"+urllib.parse.quote(owner,safe="")+"/"+urllib.parse.quote(name,safe="")
    path=repo+"/pulls/"+str(number)
    pr=api("GET",path)
    if (pr.get("merged") and pr.get("head",{}).get("sha","").lower()==expected.lower()
        and pr.get("base",{}).get("ref")=="main"):
        return finish_merge(pr, repo, head=expected)
    if pr.get("state")!="open" or pr.get("draft") or pr.get("base",{}).get("ref")!="main":
        raise GateError("La PR deve essere aperta, pronta e diretta a main")
    head=pr.get("head",{}).get("sha","")
    if head.lower()!=expected.lower():
        raise GateError("Il commit e cambiato: aggiornare la schermata e ripetere i controlli")
    if pr.get("head",{}).get("repo",{}).get("full_name","").lower()!=REPO.lower():
        raise GateError("Il branch deve appartenere alla repository dell'ufficio")
    ref=pr.get("head",{}).get("ref","")
    if not ref or ref=="main":
        raise GateError("Branch della PR non valido")
    outcome=valuta_gate(head,reviews(path))
    if not outcome.verde:
        raise GateError(outcome.motivo)
    base=pr.get("base",{}).get("sha","")
    if not re.fullmatch(r"[0-9a-fA-F]{40}",base):
        raise GateError("Commit di main non disponibile")
    try:
        checked=subprocess.run(["python3","-B","/opt/maros-pipeline/gate_checker.py",head,base],
            capture_output=True,text=True,timeout=300)
        data=json.loads(checked.stdout)
    except (OSError,subprocess.TimeoutExpired,ValueError):
        raise GateError("Controlli documentali non disponibili") from None
    if checked.returncode or not data.get("passed"):
        raise GateError("Controlli documentali non superati: "+str(data.get("error","errore del checker"))[:250])
    current=api("GET",path)
    if current.get("base",{}).get("sha","").lower()!=base.lower():
        raise GateError("Main e cambiato durante il controllo; ripetere i checker")
    if current.get("head",{}).get("sha","").lower()!=head.lower():
        raise GateError("Il commit e cambiato durante il controllo")
    if current.get("state") != "open" or current.get("draft"):
        raise GateError("La PR non e piu pronta al merge")
    outcome=valuta_gate(head,reviews(path))
    if not outcome.verde:
        raise GateError("Gate modificati durante i checker: "+outcome.motivo)
    api("POST",path+"/merge",{"Do":"merge","head_commit_id":head,"delete_branch_after_merge":True})
    result=api("GET",path)
    if not result.get("merged"):
        raise GateError("Forgejo non conferma il merge; verificare la PR")
    return finish_merge(result, repo, head)

def finish_merge(result, repo, head):
    ref=result.get("head",{}).get("ref","")
    merged_commit=result.get("merge_commit_sha","")
    common={"merged":True,"merge_commit":merged_commit}
    # Forgejo replaces the deleted branch name with its retained pull ref.
    if ref.startswith("refs/pull/"):
        return with_sync({**common,"branch_deleted":True,"message":"Merge gia completato; branch eliminato"},repo)
    if not ref or ref=="main":
        return with_sync({**common,"branch_deleted":False,"message":"Merge completato; branch da verificare"},repo)
    refpath=repo+"/branches/"+urllib.parse.quote(ref,safe="")
    try:
        branch=api("GET",refpath,allow404=True)
        if branch is not None:
            branch_sha=(branch.get("commit") or {}).get("id","")
            if branch_sha.lower()!=head.lower():
                return with_sync({**common,"branch_deleted":False,"message":"Merge completato; branch non eliminato perche modificato"},repo)
            api("DELETE",refpath)
            branch=api("GET",refpath,allow404=True)
        return with_sync({**common,"branch_deleted":branch is None,"message":"Merge completato e branch eliminato" if branch is None else "Merge completato; eliminazione branch non confermata"},repo)
    except (GateError, urllib.error.URLError):
        return with_sync({**common,"branch_deleted":False,"message":"Merge completato; eliminazione branch non confermata"},repo)

def with_sync(result,repo):
    deadline=time.monotonic()+180
    marker=Path("/published/.vault.publisher.json")
    while time.monotonic()<deadline:
        try:
            main=api("GET",repo+"/branches/main")
            sha=(main.get("commit") or {}).get("id","")
            published=json.loads(marker.read_text()).get("commit","")
            merged_commit=result.get("merge_commit","")
            contains = re.fullmatch(r"[0-9a-fA-F]{40}",merged_commit) and subprocess.run(
                ["git","--git-dir=/sync/repository.git","merge-base","--is-ancestor",merged_commit,published],
                capture_output=True,timeout=10).returncode == 0
            if sha and sha.lower()==published.lower() and contains and Path("/published/vault").is_dir():
                result["vault_synced"]=True
                result["published_commit"]=published
                return result
        except (GateError, OSError, ValueError, TypeError, urllib.error.URLError):
            pass
        time.sleep(3)
    result["vault_synced"]=False
    result["message"]=result.get("message","Merge completato")+"; sincronizzazione del vault non confermata"
    return result

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
    def answer(self,status,body):
        raw=json.dumps(body,ensure_ascii=False).encode()
        self.send_response(status);self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_POST(self):
        if self.path!="/merge":
            return self.answer(404,{"error":"Operazione non disponibile"})
        auth=self.headers.get("Authorization","")
        expected="Bearer "+SECRET.read_text().strip()
        if not hmac.compare_digest(auth,expected):
            return self.answer(403,{"error":"Accesso negato"})
        try:
            n=int(self.headers.get("Content-Length","0"))
            if n<=0 or n>4096:
                raise GateError("Richiesta non valida")
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict) or data.get("repo")!=REPO:
                raise GateError("Repository non autorizzata")
            self.answer(200,merge(data.get("number"),data.get("head")))
        except (GateError,ValueError,KeyError,TypeError,urllib.error.URLError) as e:
            self.answer(409,{"error":str(e)[:400]})
        except Exception:
            self.answer(500,{"error":"Errore del controllo di merge"})

if __name__=="__main__":
    HTTPServer(("0.0.0.0",8787),Handler).serve_forever()
