"""Build the vm112/amd64 nested Codex sandbox profile from the matching Moby release."""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

url = "https://raw.githubusercontent.com/moby/moby/v26.1.5/profiles/seccomp/default.json"
expected = "9c1025c88ccaa517b648da571961838744ea2137f176bfe6a48b21294cae9c76"
data = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(url, timeout=30).read()
if hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit("Unexpected Moby seccomp profile")
profile = json.loads(data)
# Only the child user namespace receives mount privileges. The outer rootless
# worker lacks CAP_SYS_ADMIN, and can only create a namespace mapped to itself.
profile["syscalls"].extend([
    {"names": ["clone"], "action": "SCMP_ACT_ALLOW",
     "args": [{"index": 0, "value": 0x10000000, "valueTwo": 0x10000000, "op": "SCMP_CMP_MASKED_EQ"}]},
    {"names": ["mount", "umount2", "pivot_root"], "action": "SCMP_ACT_ALLOW"},
])
json.dump(profile, sys.stdout)
