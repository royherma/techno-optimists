# Short names for the things done more than once a day.
# Everything here delegates to npm scripts - this is a front door, not a
# second build system. `make` on its own lists what there is.

.DEFAULT_GOAL := help
.PHONY: help dev web api db seed reset check ship ship-dev verify verify-dev logs logs-dev doctor save

help: ## list targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "};{printf "  \033[1m%-12s\033[0m %s\n",$$1,$$2}'

# --- running it locally -----------------------------------------------------

dev: ## api + web together (what you want 90% of the time)
	@npm run dev & npm run dev:web

api: ## the worker alone on :8791
	@npm run dev

web: ## astro alone on :4321 (proxies /api to :8791)
	@npm run dev:web

# --- data -------------------------------------------------------------------

db: ## rebuild LOCAL d1 - schema only, no rows
	@npm run db:local

seed: ## regenerate seed.sql and load it into local d1
	@npm run db:seed:local

reset: ## db + seed, from scratch
	@npm run db:reset:local

# --- before you ship --------------------------------------------------------

check: ## typecheck + tests
	@npm run typecheck && npm test

# --- shipping ---------------------------------------------------------------
#
# The build prerenders from LOCAL d1, so whatever is in it lands on the site.
# `ship` empties local d1 first: prod shows real Challenges or none, never the
# dev fixtures. Use `ship-dev` for the throwaway environment where seeds belong.

ship: ## check, empty local d1, deploy PROD, verify
	@npm run typecheck && npm run db:local && npm run deploy:prod && npm run verify

ship-dev: ## check, deploy dev, verify dev
	@npm run typecheck && npm run deploy:dev && npm run verify:dev

# --- is it actually working ------------------------------------------------

verify: ## probe prod end to end
	@npm run verify

verify-dev: ## probe dev end to end
	@npm run verify:dev

doctor: ## walk the whole sign-in flow on dev
	@npm run auth:doctor

logs: ## tail prod
	@npm run tail:prod

logs-dev: ## tail dev
	@npm run tail:dev

# --- not losing work --------------------------------------------------------

save: ## commit everything as wip and push (two sessions edit this repo)
	@git add -A && git commit -m "wip: $(shell date +%H:%M)" && git push
