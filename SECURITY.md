# Security policy

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting on this repo:
[Report a vulnerability](https://github.com/royherma/techno-optimists/security/advisories/new).
It is enabled, so the link works and only the maintainers see the report.

Say what you found, how to reproduce it, and what an attacker gets. A proof of
concept helps; a working exploit is not required.

## Supported versions

This is a deployed site, not a released library. The `main` branch and whatever
is live on technooptimists.org are the only supported versions. There are no
backports.

## What is worth reporting

Auth here is email magic links. Tokens are stored as SHA-256 and never in
plaintext, and a link is single-use with a 15 minute life. A way around any of
that is worth reporting.

So is anything in this shape:

- Reading or writing another person's account, Challenge, comment or progress
  update.
- Getting an email address out of the API. Email lives in `identities` and is
  never returned by the public person shape.
- Reaching an admin-only route (for example `/api/challenges/import`) without
  being in `ADMIN_EMAILS`.
- Defeating the sign-in rate limits (5/hour per address, 20/hour per IP).
- Script injection that survives the CSP.

## What is not a vulnerability

- **`ADMIN_EMAILS` unset means nobody is an admin.** A fresh clone has no admins,
  the site works and the import route stays closed. That is the intended default.
- **`dev_link` in a sign-in response on dev or local.** It is returned only when
  `ENVIRONMENT !== 'prod'`. In prod a missing mail key breaks sign-in loudly
  rather than opening a door. Finding it in a **production** response is a real
  report.
- Findings from an automated scanner with no reachable impact, pasted without a
  reproduction.
