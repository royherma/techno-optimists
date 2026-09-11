# Agent entry point

Read [CLAUDE.md](CLAUDE.md) before working. Its project rules apply to every agent.

## Simultaneous work

- Run `npm run agents:status` and `git status --short` when starting and before shipping.
- Use separate Git worktrees for independent edits. Agree on file ownership when sharing a checkout; an operation lock does not protect source edits.
- Use the root npm scripts or Make targets for builds, database mutations and deployment. They acquire one shared lock across this repository's local worktrees, covering the full `ship` pipeline through verification. Dev and prod share a lock because builds use the same port and mutable local inputs.
- A busy operation exits with code 75 and prints its owner, task, checkout and start time. Continue independent editing or retry after it finishes. Never bypass with direct Wrangler, workspace builds, or manual database commands.
- Name your session with `AGENT_NAME=my-task npm run ship:dev` so others can identify it.
- Locks release when the holding processes close their descriptors. Do not delete lock files or kill another agent's process to take over. Investigate the owner and its child processes if an operation appears stuck.
- Prefer `npm run ship` / `npm run ship:dev` to hold the lock across preparation, deployment and verification. Separate invocations release the lock between steps.
- This coordinates cooperating agents on this machine sharing a Git common directory. Separate clones, other machines, direct CLI calls and CI are outside its protection. Those must use one designated deployment owner until a shared remote deployment queue exists.

## The lock does not protect source files

`coordinate.py` is an flock around build, database and deploy commands. It serializes
processes. It does not watch the filesystem, so every way one agent destroys another's
work is outside it: an editor write, `git checkout`, `rm`, a `>` redirect. Holding the
lock is not permission to touch a file someone else is in.

- Before editing, `git status --short`. A path dirty that you did not touch belongs to
  the other session - commit it (`wip:`, say it is a safety commit) or leave it alone.
  Never revert it to "clean up" first.
- Re-read a file immediately before editing it if more than a couple of minutes passed.
  An mtime that moved since you read it means someone is in that file right now; your
  old copy would overwrite their lines with no diff to show what went missing.
- Never `git checkout <path>`, `git restore`, `reset --hard` or `clean` to undo your own
  edits. They take the other session's uncommitted lines with them and the reflog holds
  nothing that was never committed. A `wip:` commit is the only reversible undo here.
- Never delete or truncate a file you have not read this session, and never `>` over one.
- `git stash` is banned even when your own diff looks trivial. A stash is invisible to
  the other agent, survives no checkout it was not made in, and the one in this repo had
  to be read line by line to prove it held nothing but regenerated timestamps.

## Worktrees live in .worktrees/

`git worktree list` is the first thing to run when a second agent appears - it says
whether you share a checkout or not.

- Create them at `.worktrees/<task>` inside this repo, per the root CLAUDE.md. Never in
  `/private/tmp` or `/tmp`: macOS reaps those, and a reaped worktree takes every
  uncommitted line in it with no reflog entry, because the objects were never written.
- A `.git` **file** (not directory) marks a registered worktree. Never `rm -rf` one -
  `git worktree remove` so the registration goes with it.
- Commit and push before leaving a worktree. The push is the only copy that survives the
  directory.
