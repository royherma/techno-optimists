#!/usr/bin/env python3
"""Serialize shared build/deploy resources across local Git worktrees (macOS/Linux)."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid


def main():
    common = subprocess.check_output(
        ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], text=True
    ).strip()
    directory = Path(common) / 'agent-coordination'
    directory.mkdir(exist_ok=True)
    # Never delete this file: flock protects its inode, not its pathname.
    lock = open(directory / 'operation.lock', 'a+')
    owner_path = directory / 'owner.json'
    try:
        owner = json.loads(owner_path.read_text())
    except (FileNotFoundError, ValueError):
        owner = {}
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        acquired = True
    except BlockingIOError:
        acquired = False
    if sys.argv[1:] == ['status']:
        print(json.dumps({'busy': not acquired, 'owner' if not acquired else 'last_operation': owner}, indent=2))
        return 0
    if len(sys.argv) != 4 or sys.argv[1] != 'run':
        print('Usage: coordinate.py status | run LABEL SHELL_COMMAND', file=sys.stderr)
        return 2
    nested = not acquired and owner.get('token') == os.environ.get('TECHNO_OPERATION_TOKEN') and bool(owner.get('token'))
    if not acquired and not nested:
        print('Shared build/deploy resources are busy. Retry after this operation finishes:\n' + json.dumps(owner, indent=2), file=sys.stderr)
        return 75
    if acquired:
        owner = {'token': str(uuid.uuid4()), 'pid': os.getpid(),
                 'agent': os.environ.get('AGENT_NAME', os.environ.get('CODEX_THREAD_ID', 'unnamed')),
                 'operation': sys.argv[2], 'cwd': os.getcwd(),
                 'started_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()}
        owner_path.write_text(json.dumps(owner, indent=2) + '\n')
        print('Acquired shared operation lock: ' + sys.argv[2], flush=True)
        subprocess.run(['git', 'status', '--short'], check=True)
    env = dict(os.environ, TECHNO_OPERATION_TOKEN=owner['token'])
    child = subprocess.Popen(sys.argv[3], shell=True, env=env,
                             pass_fds=(lock.fileno(),), start_new_session=True)
    def forward(signum, _frame):
        try:
            os.killpg(child.pid, signum)
        except ProcessLookupError:
            pass
    signal.signal(signal.SIGTERM, forward)
    signal.signal(signal.SIGINT, forward)
    result = child.wait()
    if acquired:
        owner.update(finished_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), exit_code=result)
        owner_path.write_text(json.dumps(owner, indent=2) + '\n')
    return result if result >= 0 else 128 - result


if __name__ == '__main__':
    sys.exit(main())
