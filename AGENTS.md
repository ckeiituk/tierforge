# Repository Guidelines

## Project Structure & Module Organization
- `backend/` Go REST API. Entry points live in `backend/cmd/` (server in `cmd/server/main.go`), shared packages in `backend/internal/`, and seeds/data helpers in `backend/seeds/` and `backend/data/`.
- `frontend/` Vite + TypeScript app. Source code is in `frontend/src/`, static assets in `frontend/public/`, and build output in `frontend/dist/`.
- `docs/` holds documentation; `scripts/` and root `*.py` files are data maintenance utilities; `docker-compose.yml` defines full-stack local dev.

## Build, Test, and Development Commands
- `make dev` runs both services via Docker Compose (`backend` on :8080, `frontend` on :3000).
- `make dev-backend` / `make dev-frontend` run the Go server or Vite dev server directly.
- `make build` builds the Go binary and the frontend bundle.
- `make install` installs Go modules and frontend npm dependencies.
- `make lint` runs `go vet ./...` and `eslint` against `frontend/src`.
- Frontend-only: `npm run dev`, `npm run build` (runs `tsc` then `vite build`), `npm run type-check` (`tsc --noEmit`).

## Coding Style & Naming Conventions
- TypeScript is strict (`frontend/tsconfig.json`); avoid `any`, prefer explicit callback/event types, and use `unknown` with guards at boundaries.
- Frontend code uses 4-space indentation and the `@/` import alias (e.g., `@/components/TierList`).
- Component files use `PascalCase` names (e.g., `TierList.ts`); keep new UI modules under `frontend/src/`.
- Go code should remain gofmt formatted and organized into `cmd/` entry points and `internal/` packages.

## Testing Guidelines
- Backend tests follow Go conventions: files named `*_test.go`, executed with `go test ./...`.
- Frontend tests are not configured yet; if you add them, also add a `npm run test` script so `make test` succeeds.
- Use `npm run type-check` and `npm run lint` as frontend quality gates.

## Commit & Pull Request Guidelines
- Commit subjects in history are short, imperative, and occasionally use prefixes like `refactor:`; keep that style.
- PRs should include a brief summary, testing notes, and screenshots/GIFs for UI changes.
- Link related issues and call out any data migrations or seed changes.

## Configuration Tips
- Local dev uses `VITE_API_URL` (frontend) and `DB_PATH`/`PORT` (backend) from `docker-compose.yml`.
- The repo includes SQLite files for dev; avoid committing new generated DB artifacts unless intentional.
