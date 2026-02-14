.PHONY: help build test run lint clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the project
	npm run build

test: ## Run tests
	npm test

run: ## Run the application
	npm start

lint: ## Run linter
	npm run lint

clean: ## Clean build artifacts
	rm -rf dist/ node_modules/
