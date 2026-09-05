# CryptoDemo Exchange - DEMO / PAPER TRADING.
# POSIX sh only; no bashisms, so this works with the default /bin/sh.

SHELL := /bin/sh
COMPOSE ?= docker compose
DEV := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help
.PHONY: help up down logs migrate seed test lint build fresh dev

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  %-10s %s\n", $$1, $$2}'

up: ## Start the whole stack in the background
	$(COMPOSE) up -d

dev: ## Start the stack with source bind-mounts and hot reload
	$(DEV) up

down: ## Stop the stack (volumes are kept)
	$(COMPOSE) down

logs: ## Follow logs for every service
	$(COMPOSE) logs -f

build: ## Rebuild all images
	$(COMPOSE) build

migrate: ## Apply database migrations
	$(COMPOSE) run --rm backend alembic upgrade head

seed: ## Load idempotent demo seed data (safe to re-run)
	$(COMPOSE) run --rm backend python -m app.db.seed

test: ## Run the backend test suite
	$(COMPOSE) run --rm backend pytest -q

lint: ## Byte-compile the backend and run the frontend type + lint checks
	$(COMPOSE) run --rm backend python -m compileall -q app alembic
	$(COMPOSE) run --rm frontend npm run typecheck
	$(COMPOSE) run --rm frontend npm run lint

fresh: ## DESTRUCTIVE: wipe the database volume, rebuild, migrate and seed
	$(COMPOSE) down -v
	$(COMPOSE) up -d
	$(MAKE) migrate
	$(MAKE) seed
	@echo "Fresh stack ready. All seeded balances are SIMULATED."
