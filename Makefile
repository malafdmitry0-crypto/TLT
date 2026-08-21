.PHONY: help dev prod down restart logs \
        migrate migrate-new \
        seed setup setup-fresh \
        test test-backend test-frontend test-e2e test-compose-readiness test-worker-chaos \
        test-formulas test-formulas-full test-formulas-mutation \
        audit-docs audit-contracts audit-mcp audit-db-invariants audit-smoke audit-calc \
        audit-mutation audit-business audit-user-flows audit-layout audit-accessibility \
        audit-warnings audit-backend audit-frontend audit-functional audit-deep \
        qa-agent-install qa-agent-typecheck qa-agent-test qa-agent-example qa-agent-tlt-ai-cases qa-agent-visual qa-agent-app-tests qa-agent-security \
        lint lint-backend lint-backend-mypy-ratchet lint-frontend \
        shell-backend shell-frontend shell-db \
        build clean ps db-perf-report \
        package package-backend package-frontend release

# ─── Defaults ────────────────────────────────────────────────────────────────
COMPOSE        = docker compose
COMPOSE_DEV    = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_PROD   = $(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml
COMPOSE_E2E    = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.e2e.yml
BACKEND        = $(COMPOSE_DEV) exec backend
BACKEND_RUN    = $(COMPOSE_DEV) run -T --rm --entrypoint '' backend
FRONTEND_CTR   = $(COMPOSE_DEV) exec frontend

# Тег для production-образов. Переопределить: make package IMAGE_TAG=v1.0.0
IMAGE_TAG     ?= latest
REGISTRY      ?=
BACKEND_IMAGE  = $(if $(REGISTRY),$(REGISTRY)/,)heatcalc-backend:$(IMAGE_TAG)
FRONTEND_IMAGE = $(if $(REGISTRY),$(REGISTRY)/,)heatcalc-frontend:$(IMAGE_TAG)

# ─── Help ─────────────────────────────────────────────────────────────────────
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage: make \033[36m<target>\033[0m\n\nTargets:\n"} \
	      /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ─── Docker ───────────────────────────────────────────────────────────────────
dev: ## Start dev environment (hot-reload)
	$(COMPOSE_DEV) up --build

dev-d: ## Start dev environment in background
	$(COMPOSE_DEV) up --build --wait --wait-timeout 180 -d

prod: ## Start production environment (uses docker-compose.prod.yml overrides)
	$(COMPOSE_PROD) up --build --wait --wait-timeout 180 -d

prod-down: ## Stop production environment
	$(COMPOSE_PROD) down

down: ## Stop all containers
	$(COMPOSE_DEV) down

down-v: ## Stop all containers and remove volumes (DANGER: deletes DB data)
	$(COMPOSE_DEV) down -v

restart: ## Restart all containers
	$(COMPOSE_DEV) restart
	$(COMPOSE_DEV) up -d --wait --wait-timeout 180

ps: ## Show running containers
	$(COMPOSE_DEV) ps

build: ## Rebuild images without starting
	$(COMPOSE_DEV) build

logs: ## Tail all logs
	$(COMPOSE_DEV) logs -f

logs-backend: ## Tail backend logs
	$(COMPOSE_DEV) logs -f backend

logs-frontend: ## Tail frontend logs
	$(COMPOSE_DEV) logs -f frontend

logs-db: ## Tail database logs
	$(COMPOSE_DEV) logs -f db

# ─── Migrations ───────────────────────────────────────────────────────────────
migrate: ## Apply all pending migrations
	$(BACKEND) alembic upgrade head

migrate-new: ## Create new migration (use: make migrate-new MSG="description")
	$(BACKEND) alembic revision --autogenerate -m "$(MSG)"

migrate-down: ## Rollback last migration
	$(BACKEND) alembic downgrade -1

migrate-history: ## Show migration history
	$(BACKEND) alembic history --verbose

seed: ## Fill DB with test data (idempotent)
	$(BACKEND) python -m app.seeds

setup: ## One-shot: start dev + migrate + seed
	@bash scripts/dev-setup.sh

setup-fresh: ## One-shot: wipe DB + start dev + migrate + seed (DANGER: deletes all data)
	@bash scripts/dev-setup.sh --fresh

# ─── Tests ────────────────────────────────────────────────────────────────────
test: test-backend test-frontend ## Run all tests (backend + frontend)

test-backend: ## Run backend unit + integration tests
	$(BACKEND) pytest app/tests -v

test-backend-unit: ## Run backend unit tests only
	$(BACKEND) pytest app/tests/unit -v

test-backend-integration: ## Run backend integration tests only
	$(BACKEND) pytest app/tests/integration -v

test-backend-cov: ## Run backend tests with coverage report
	$(BACKEND) pytest app/tests --cov=app --cov-report=html --cov-report=term-missing

test-formulas: ## Run formula QA: unit/metamorphic/golden tests + service guards
	@bash scripts/formula-qa.sh quick

test-formulas-full: ## Run formula QA plus API/object integration guards
	@bash scripts/formula-qa.sh full

test-formulas-mutation: ## Run mutation testing for backend formulas (requires mutmut)
	@bash scripts/formula-qa.sh mutation

audit-docs: ## Codex audit: docs drift
	@bash scripts/codex-functional-audit.sh docs

audit-contracts: ## Codex audit: docs -> formula -> API -> UI contract matrix
	@bash scripts/codex-functional-audit.sh contracts

audit-mcp: ## Codex audit: MCP/Postgres smoke + DB invariants
	@bash scripts/codex-functional-audit.sh mcp

audit-db-invariants: ## Codex audit: Postgres business-data invariants only
	@bash scripts/codex-functional-audit.sh db-invariants

audit-smoke: ## Codex audit: API/UI smoke against running stack
	@bash scripts/codex-functional-audit.sh smoke

audit-calc: ## Codex audit: calculation accuracy gate
	@bash scripts/codex-functional-audit.sh calc

audit-mutation: ## Codex audit: formula mutation testing
	@bash scripts/codex-functional-audit.sh mutation

audit-business: ## Codex audit: deep backend business logic tests
	@bash scripts/codex-functional-audit.sh business

audit-user-flows: ## Codex audit: Playwright user-flow simulation
	@bash scripts/codex-functional-audit.sh user-flows

audit-layout: ## Codex audit: Playwright layout regression checks
	@bash scripts/codex-functional-audit.sh layout

audit-accessibility: ## Codex audit: Playwright accessibility checks
	@bash scripts/codex-functional-audit.sh accessibility

audit-warnings: ## Codex audit: selected backend warnings fail the gate
	@bash scripts/codex-functional-audit.sh warnings

audit-backend: ## Codex audit: backend unit + integration
	@bash scripts/codex-functional-audit.sh backend

audit-frontend: ## Codex audit: frontend tests
	@bash scripts/codex-functional-audit.sh frontend

audit-functional: ## Codex audit: docs + MCP + smoke + calc + business + user flows
	@bash scripts/codex-functional-audit.sh all

audit-deep: ## Codex audit: full deep gate including backend/frontend suites
	@bash scripts/codex-functional-audit.sh deep

qa-agent-install: ## Install TypeScript QA agent dependencies
	npm --prefix qa-agent install

qa-agent-typecheck: ## Typecheck the TypeScript QA agent
	npm --prefix qa-agent run typecheck

qa-agent-test: ## Run TypeScript QA agent unit tests
	npm --prefix qa-agent run qa-agent:test

qa-agent-example: ## Run TypeScript QA agent vertical-slice example
	npm --prefix qa-agent run qa-agent:example

qa-agent-tlt-ai-cases: ## Run TLT AI/domain heat-loss case agent
	npm --prefix qa-agent run qa-agent:tlt-ai-cases

qa-agent-visual: ## Run QA agent visual screenshot review with LLM
	npm --prefix qa-agent run qa-agent:visual

qa-agent-app-tests: ## Run application tests through QA agent and optionally generate test proposals
	npm --prefix qa-agent run qa-agent:app-tests

qa-agent-security: ## Run local-only defensive security scans through QA agent
	npm --prefix qa-agent run qa-agent:security

test-frontend: ## Run frontend unit + integration tests
	$(FRONTEND_CTR) npm run test:run

test-frontend-cov: ## Run frontend tests with coverage
	$(FRONTEND_CTR) npm run test:coverage

test-e2e: ## Run E2E tests (Playwright)
	$(COMPOSE_E2E) up --build --wait --wait-timeout 180 -d
	cd e2e && PLAYWRIGHT_CHROMIUM_CHANNEL=$${PLAYWRIGHT_CHROMIUM_CHANNEL:-chrome} E2E_BASE_URL=$${E2E_BASE_URL:-http://127.0.0.1:3001} E2E_API_BASE=$${E2E_API_BASE:-http://127.0.0.1:8001} npx playwright test --reporter=list; status=$$?; cd ..; $(COMPOSE_E2E) down; exit $$status

test-compose-readiness: ## Validate worker readiness wiring in every Compose variant
	python3 scripts/test-compose-readiness.py

test-worker-chaos: ## Run isolated live Redis/PostgreSQL worker fault-injection contracts
	scripts/test-worker-chaos.sh

# ─── Lint ─────────────────────────────────────────────────────────────────────
lint: lint-backend lint-frontend ## Run all linters

lint-backend: ## Lint backend (ruff)
	$(COMPOSE_DEV) build backend
	$(BACKEND_RUN) ruff check app
	$(BACKEND_RUN) ruff format --check app

lint-backend-mypy-ratchet: ## Enforce shrink-only strict-mypy production baseline
	python3 scripts/backend-mypy-ratchet.py

lint-backend-fix: ## Auto-fix backend lint issues
	$(COMPOSE_DEV) build backend
	$(BACKEND_RUN) ruff check --fix app
	$(BACKEND_RUN) ruff format app

lint-frontend: ## Lint frontend (eslint)
	$(FRONTEND_CTR) npm run lint

# ─── Shells ───────────────────────────────────────────────────────────────────
shell-backend: ## Open shell in backend container
	$(BACKEND) bash

shell-frontend: ## Open shell in frontend container
	$(FRONTEND_CTR) sh

shell-db: ## Open psql shell in database container
	$(COMPOSE_DEV) exec db psql -U $${POSTGRES_USER:-heatcalc} -d $${POSTGRES_DB:-heatcalc_db}

db-perf-report: ## Print pg_stat_statements, seq scan, bloat, and unused-index report
	$(COMPOSE_DEV) exec -T db psql -U $${POSTGRES_USER:-heatcalc} -d $${POSTGRES_DB:-heatcalc_db} -f - < scripts/db-perf-report.sql

# ─── Cleanup ──────────────────────────────────────────────────────────────────
clean: ## Remove stopped containers, unused images and build cache
	docker system prune -f

clean-all: ## Full cleanup including volumes (DANGER: deletes DB data)
	docker system prune -af --volumes

# ─── Packaging / Release ──────────────────────────────────────────────────────
package: package-backend package-frontend ## Build production images (backend + frontend)
	@echo ""
	@echo "✓ Образы собраны:"
	@echo "    $(BACKEND_IMAGE)"
	@echo "    $(FRONTEND_IMAGE)"

package-backend: ## Build backend production image
	docker build \
		--file backend/Dockerfile \
		--tag $(BACKEND_IMAGE) \
		--label org.opencontainers.image.title="HeatCalc Backend" \
		--label org.opencontainers.image.version=$(IMAGE_TAG) \
		backend

package-frontend: ## Build frontend production image
	docker build \
		--file frontend/Dockerfile \
		--tag $(FRONTEND_IMAGE) \
		--build-arg VITE_API_BASE_URL=$${VITE_API_BASE_URL:-/api/v1} \
		--label org.opencontainers.image.title="HeatCalc Frontend" \
		--label org.opencontainers.image.version=$(IMAGE_TAG) \
		frontend

package-save: package ## Build images and экспорт в tar (для on-premise развёртывания без registry)
	@mkdir -p dist
	docker save $(BACKEND_IMAGE) | gzip > dist/heatcalc-backend-$(IMAGE_TAG).tar.gz
	docker save $(FRONTEND_IMAGE) | gzip > dist/heatcalc-frontend-$(IMAGE_TAG).tar.gz
	@echo ""
	@echo "✓ Архивы сохранены в dist/:"
	@ls -lh dist/heatcalc-*-$(IMAGE_TAG).tar.gz

push: package ## Push images to registry (требует REGISTRY=...)
	@test -n "$(REGISTRY)" || (echo "ERROR: укажите REGISTRY=registry.example.com" && exit 1)
	docker push $(BACKEND_IMAGE)
	docker push $(FRONTEND_IMAGE)

release: ## Полный релиз: тесты + сборка образов + tar-архивы
	$(MAKE) test
	$(MAKE) package-save IMAGE_TAG=$(IMAGE_TAG)
	@echo ""
	@echo "✓ Релиз $(IMAGE_TAG) готов"
