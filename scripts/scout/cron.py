#!/usr/bin/env python3
"""Keep cron argument quoting intact while using the repo-wide operation lock."""
import os
from pathlib import Path
import shlex
import sys
root = Path(__file__).resolve().parents[2]
os.chdir(root)
command = shlex.join(['node', 'scripts/scout/cron.mjs', *sys.argv[1:]])
os.execv(sys.executable, [sys.executable, 'scripts/coordinate.py', 'run', 'scout:cron', command])
