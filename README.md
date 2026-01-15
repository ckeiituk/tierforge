# TierForge

Universal tier list engine with multi-game support.

## Features

- 🎮 Multi-game support (DOS2, BG3, and more)
- 🎨 Game-specific theming
- 🖱️ Intuitive drag & drop
- 💾 Cloud sync with share links
- ⌨️ Keyboard shortcuts
- ↩️ Undo/Redo support

## Project Structure

```
tierforge/
├── backend/          # Go REST API
├── frontend/         # Vite + TypeScript
├── docs/             # Documentation
└── docker-compose.yml
```

## Development

### Prerequisites

- Go 1.21+
- Node.js 20+
- Docker (optional)

### Quick Start

```bash
# Backend
cd backend
go mod download
go run cmd/server/main.go

# Frontend
cd frontend
npm install
npm run dev
```

## License

MIT
