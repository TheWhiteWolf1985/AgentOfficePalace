import copy
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import merge_service as ms
import office_pr as op
from gate_revisioni import valuta_gate
from test_gate_revisioni import review
from wiki_publish import publish

HEAD = 'a' * 40
BASE = 'b' * 40
OTHER = 'c' * 40
PR = {'state':'open', 'draft':False, 'merged':False,
      'base':{'ref':'main','sha':BASE},
      'head':{'sha':HEAD,'ref':'codex/collaudo','repo':{'full_name':ms.REPO}}}
REVIEWS = [review('capoanalista',1),review('capoeditore',2)]

class MergeTests(unittest.TestCase):
    def run_merge(self, mode='ok'):
        calls=[]; reads=0; revreads=0
        def api(method,path,payload=None,allow404=False):
            nonlocal reads,revreads
            calls.append((method,path,payload))
            if path.endswith('/reviews?limit=50&page=1'):
                revreads+=1
                if mode=='revoked' and revreads>1:
                    return REVIEWS+[review('capoeditore',3,state='REQUEST_CHANGES')]
                if mode=='red': return REVIEWS+[review('capoeditore',3,state='REQUEST_CHANGES')]
                return REVIEWS
            if path.endswith('/merge'): return None
            if '/branches/' in path: return None
            reads+=1
            value=copy.deepcopy(PR)
            if mode=='idempotent' or reads>=3:
                value.update(state='closed',merged=True,merge_commit_sha=OTHER)
                value['head']['ref']='refs/pull/6/head'
            if reads==2 and mode=='head_changed': value['head']['sha']=OTHER
            if reads==2 and mode=='base_changed': value['base']['sha']=OTHER
            if reads==2 and mode=='closed': value['state']='closed'
            return value
        result=subprocess.CompletedProcess([],1 if mode=='checker_failed' else 0,
            json.dumps({'passed':mode!='checker_failed'}),'')
        with patch.object(ms,'api',side_effect=api),patch.object(ms.subprocess,'run',return_value=result),patch.object(ms,'with_sync',side_effect=lambda r,_:r):
            try: outcome=ms.merge(6,OTHER if mode=='wrong_expected' else HEAD)
            except ms.GateError as e: outcome={'error':str(e)}
        return outcome,calls
    def test_success(self):
        result,calls=self.run_merge()
        self.assertTrue(result['merged']); self.assertTrue(result['branch_deleted'])
        self.assertEqual(sum(p.endswith('/merge') for m,p,d in calls if m=='POST'),1)
    def test_retries_are_idempotent(self):
        result,calls=self.run_merge('idempotent')
        self.assertTrue(result['merged'])
        self.assertFalse(any(p.endswith('/merge') for m,p,d in calls))
    def test_all_failed_conditions_prevent_merge(self):
        for mode in ('wrong_expected','red','revoked','head_changed','base_changed','closed','checker_failed'):
            with self.subTest(mode=mode):
                result,calls=self.run_merge(mode)
                self.assertIn('error',result)
                self.assertFalse(any(p.endswith('/merge') for m,p,d in calls))
    def test_invalid_input(self):
        for n,h in [(True,HEAD),(0,HEAD),(1,'x'),(1,None)]:
            with self.assertRaises(ms.GateError): ms.merge(n,h)

class ReviewTests(unittest.TestCase):
    def execute(self,role='capoeditore',commit=HEAD,local=HEAD,dirty='',checker=True,changed=False):
        posts=[]; reads=0
        def request(method,path,payload=None):
            nonlocal reads
            if path=='/user': return {'login':role}
            if '/reviews?' in path: return [REVIEWS[0]]
            if method=='POST': posts.append(payload); return {'commit_id':HEAD}
            reads+=1
            p=copy.deepcopy(PR)
            if changed and reads>1: p['head']['sha']=OTHER
            return p
        def git(*args):
            if args[:2]==('remote','get-url'): return 'ssh://git@192.168.1.76:2222/officeagents/documentazione.git'
            if args==('rev-parse','HEAD'): return local
            if args==('status','--porcelain'): return dirty
            if args==('rev-parse','--show-toplevel'): return '/checkout'
            raise AssertionError(args)
        argv=['office-pr','revisione','6','--commit',commit,'--esito','approva','--nota','Valutazione motivata dello stato e delle fonti']
        result=subprocess.CompletedProcess([],0 if checker else 1,json.dumps({'passed':checker,'commit':HEAD}),'')
        with patch.object(sys,'argv',argv),patch.object(op,'request',side_effect=request),patch.object(op,'all_reviews',return_value=[REVIEWS[0]]),patch.object(op,'git',side_effect=git),patch.object(op.subprocess,'run',return_value=result) as run,patch('sys.stdout',new_callable=io.StringIO):
            try: op.main(); error=None
            except ValueError as e: error=str(e)
        return posts,error,run.call_count
    def test_editor_checker_required(self):
        posts,error,count=self.execute()
        self.assertIsNone(error);self.assertEqual(len(posts),1);self.assertEqual(count,1)
    def test_wrong_commit_dirty_checkout_and_checker_failure(self):
        for opts in ({'commit':OTHER},{'local':OTHER},{'dirty':'M page.md'},{'checker':False},{'changed':True},{'role':'lettura'}):
            with self.subTest(opts=opts):
                posts,error,count=self.execute(**opts)
                self.assertTrue(error); self.assertFalse(posts)

class PublishTests(unittest.TestCase):
    def test_exact_content_deletions_and_hostile_entries(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);repo=root/'repo';repo.mkdir();vault=root/'vault'
            def git(*args): return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.PIPE).decode().strip()
            git('init','-q');git('config','user.email','collaudo@localhost');git('config','user.name','Collaudo')
            (repo/'pagina.md').write_bytes(b'# Pagina\n');git('add','.');git('commit','-qm','Prima')
            one=git('rev-parse','HEAD');self.assertTrue(publish(repo,vault,one)['identical'])
            self.assertEqual((vault/'pagina.md').read_bytes(),b'# Pagina\n')
            (repo/'pagina.md').unlink();(repo/'nuova.md').write_bytes(b'# Nuova\n');git('add','-A');git('commit','-qm','Seconda')
            self.assertTrue(publish(repo,vault,'HEAD')['identical']);self.assertFalse((vault/'pagina.md').exists())
            (repo/'link').symlink_to('/etc/passwd');git('add','link');git('commit','-qm','Link vietato')
            with self.assertRaises(ValueError):publish(repo,vault,'HEAD')
            self.assertEqual((vault/'nuova.md').read_bytes(),b'# Nuova\n')
            self.assertFalse(any(root.glob('.vault.staging-*')))

if __name__=='__main__':unittest.main()
