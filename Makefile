.PHONY: help dev prod down restart logs \
        migrate migrate-new \
        seed setup setup-fresh \
        test test-backend test-frontend test-e2e \
        lint lint-backend lint-frontend \
        shell-backend shell-frontend shell-db \
        build clean ps \
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
	$(COMPOSE_DEV) up --build -d

prod: ## Start production environment (uses docker-compose.prod.yml overrides)
	$(COMPOSE_PROD) up --build -d

prod-down: ## Stop production environment
	$(COMPOSE_PROD) down

down: ## Stop all containers
	$(COMPOSE_DEV) down

down-v: ## Stop all containers and remove volumes (DANGER: deletes DB data)
	$(COMPOSE_DEV) down -v

restart: ## Restart all containers
	$(COMPOSE_DEV) restart

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

test-frontend: ## Run frontend unit + integration tests
	$(FRONTEND_CTR) npm run test

test-frontend-cov: ## Run frontend tests with coverage
	$(FRONTEND_CTR) npm run test:coverage

test-e2e: ## Run E2E tests (Playwright)
	$(COMPOSE_E2E) up --build -d
	cd e2e && PLAYWRIGHT_CHROMIUM_CHANNEL=$${PLAYWRIGHT_CHROMIUM_CHANNEL:-chrome} E2E_BASE_URL=$${E2E_BASE_URL:-http://localhost:3001} E2E_API_BASE=$${E2E_API_BASE:-http://localhost:8001} npx playwright test --reporter=list
	$(COMPOSE_E2E) down

# ─── Lint ─────────────────────────────────────────────────────────────────────
lint: lint-backend lint-frontend ## Run all linters

lint-backend: ## Lint backend (ruff)
	$(COMPOSE_DEV) build backend
	$(BACKEND_RUN) ruff check app
	$(BACKEND_RUN) ruff format --check app

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
