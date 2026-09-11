#!/usr/bin/env python3
"""Exercise real OS locks in a disposable repository; never deploy."""
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import time

runner = str(Path(__file__).with_name('coordinate.py').resolve())
base = [sys.executable, runner]
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp) / 'repo'
    root.mkdir()
    def git(*args):
        subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
    git('init')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-m', 'test')
    tree = Path(temp) / 'tree'
    git('worktree', 'add', '-b', 'parallel', str(tree))
    def run(*args, cwd=root):
        return subprocess.run(base + list(args), cwd=cwd, capture_output=True, text=True)
    def status(cwd=root):
        return json.loads(run('status', cwd=cwd).stdout)
    assert not status()['busy']
    holder = subprocess.Popen(base + ['run', 'holder', 'sleep 2'], cwd=root, stdout=subprocess.DEVNULL)
    try:
        time.sleep(.2)
        for _ in range(100):
            state = status()
            if state['busy'] and state.get('owner', {}).get('operation') == 'holder':
                break
            time.sleep(.02)
        else:
            raise AssertionError('holder never acquired lock')
        assert status(tree)['busy'], 'worktree must see same lock'
        denied = run('run', 'contender', 'exit 0', cwd=tree)
        assert denied.returncode == 75, denied.stderr
        assert 'holder' in denied.stderr
    finally:
        holder.wait(timeout=5)
    assert not status()['busy']
    nested = shlex.join(base + ['run', 'inner', 'exit 0'])
    assert run('run', 'outer', nested).returncode == 0
    assert run('run', 'failure', 'exit 23').returncode == 23
    assert not status()['busy']
    assert status()['last_operation']['exit_code'] == 23
    holder = subprocess.Popen(base + ['run', 'signal', 'sleep 30'], cwd=root, stdout=subprocess.DEVNULL)
    try:
        time.sleep(.2)
        for _ in range(100):
            state = status()
            if state['busy'] and state.get('owner', {}).get('operation') == 'signal':
                break
            time.sleep(.02)
        time.sleep(.1)
        holder.terminate()
        assert holder.wait(timeout=5) != 0
        assert not status()['busy']
    finally:
        if holder.poll() is None:
            holder.kill()
            holder.wait()
print('PASS: exclusion, shared worktrees, nesting, failure exit code, release and signal cleanup')
