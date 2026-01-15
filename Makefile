.PHONY: dev dev-backend dev-frontend build clean

# Development
dev:
	@echo "Starting TierForge in development mode..."
	docker-compose up

dev-backend:
	cd backend && go run cmd/server/main.go

dev-frontend:
	cd frontend && npm run dev

# Build
build:
	cd backend && go build -o server cmd/server/main.go
	cd frontend && npm run build

# Database
seed:
	cd backend && go run cmd/seed/main.go

# Clean
clean:
	rm -f backend/server
	rm -rf frontend/dist
	rm -f *.db

# Install dependencies
install:
	cd backend && go mod download
	cd frontend && npm install

# Lint
lint:
	cd frontend && npm run lint
	cd backend && go vet ./...

# Test
test:
	cd backend && go test ./...
	cd frontend && npm run test
