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
