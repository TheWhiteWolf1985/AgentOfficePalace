#!/usr/bin/env python3
"""Esegue i tre controlli della wiki sul checkout indicato, senza alterare la wiki."""
import argparse,json,os,subprocess,sys
from pathlib import Path

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--vault",type=Path,required=True)
 p.add_argument("--base",default="origin/main")
 args=p.parse_args()
 root=args.vault.resolve()
 if not (root/".git").exists(): raise ValueError("Il percorso deve essere un checkout Git completo")
 if subprocess.run(["git","-C",str(root),"status","--porcelain"],capture_output=True,text=True,check=True).stdout.strip(): raise ValueError("Il checkout contiene modifiche non committate: il controllo non sarebbe riferito a un commit certo")
 base=subprocess.run(["git","-C",str(root),"rev-parse","--verify",args.base+"^{commit}"],capture_output=True,text=True,check=True).stdout.strip()
 head=subprocess.run(["git","-C",str(root),"rev-parse","HEAD"],capture_output=True,text=True,check=True).stdout.strip()
 diff=subprocess.run(["git","-C",str(root),"diff","--name-only","--diff-filter=ACMR","-z",base+"..."+head],capture_output=True,check=True).stdout.decode("utf-8").split("\0")
 paths=[x for x in diff if x.endswith(".md") and x!="AGENTS.md"]
 tools=root/"99_Controllo"/"strumenti"
 commands=[
  ("wiki",["wiki.py","validate","--vault",str(root)]),
  ("metodo",["verifica_metodo.py","--vault",str(root)]),
  ("documenti",["verifica_documenti.py","--vault",str(root),"--changed"]+(["--paths"]+paths if paths else []))]
 report={"base":base,"commit":head,"changed_markdown":len(paths),"checks":[],"passed":True}
 for name,cmd in commands:
  f=tools/cmd[0]
  if not f.is_file():
   report["checks"].append({"name":name,"passed":False,"error":"checker assente"})
   report["passed"]=False
   continue
  try:
   r=subprocess.run([sys.executable,"-B",str(f),*cmd[1:]],cwd=root,capture_output=True,text=True,timeout=300,env={**os.environ,"PYTHONDONTWRITEBYTECODE":"1"})
   try: data=json.loads(r.stdout)
   except json.JSONDecodeError: data={"execution_error":(r.stderr or r.stdout)[:2000]}
   errors=data.get("errors",[])
   report["checks"].append({"name":name,"passed":r.returncode==0,"exit_code":r.returncode,"errors":errors,"execution_error":data.get("execution_error")})
   if r.returncode!=0: report["passed"]=False
  except (OSError,subprocess.TimeoutExpired) as e:
   report["checks"].append({"name":name,"passed":False,"error":str(e)})
   report["passed"]=False
 print(json.dumps(report,ensure_ascii=False,indent=2))
 return 0 if report["passed"] else 1
if __name__=="__main__":
 try: sys.exit(main())
 except (ValueError,OSError,subprocess.CalledProcessError) as e:
  print(json.dumps({"passed":False,"error":str(e)},ensure_ascii=False));sys.exit(3)
