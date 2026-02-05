# TierForge

Universal tier list engine with multi-game support.

## Features

- 🎮 Multi-game support (DOS2, BG3, and more)
- 🎨 Game-specific theming with official color palettes
- 🖱️ Intuitive drag & drop interface
- 💾 Auto-save with cloud sync and share links
- 📋 Multiple presets per game
- 🔍 Advanced filtering (by school, AP cost, etc.)
- ⌨️ Keyboard shortcuts (Ctrl+Z/Y for undo/redo)
- 🎯 227 DOS2 skills with complete data

## Project Structure

```
tierforge/
├── backend/          # Go REST API + SQLite
│   ├── cmd/          # CLI tools (server, import, seed)
│   ├── internal/     # API handlers, storage layer
│   └── seeds/        # Game configuration
├── frontend/         # Vite + TypeScript SPA
│   └── src/
│       ├── components/  # UI components
│       ├── core/        # State management, auto-save
│       └── adapters/    # Game-specific logic
├── data/             # Game data (spells, infoboxes)
└── scripts/          # Data collection pipeline
```

## Development

### Prerequisites

- Go 1.21+
- Node.js 20+
- Python 3.10+ (for data scraping)

### Quick Start

```bash
# Clone repository
git clone https://github.com/ckeiituk/tierforge.git
cd tierforge

# Backend
cd backend
go mod download
go run cmd/server/main.go --db tierforge.db

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000

## Production Deployment

### VPS Setup (Ubuntu/Debian)

```bash
# 1. Клонирование
cd /var/www
git clone https://github.com/ckeiituk/tierforge.git
cd tierforge

# 2. Сборка и импорт
cd backend
go build -o tierforge cmd/server/main.go
go run cmd/import_spells/main.go --db tierforge.db --spells ../data/spells.json
go run cmd/update_infoboxes/main.go --db tierforge.db --infoboxes ../data/infoboxes.json

# 3. Фронтенд
cd ../frontend
npm install
npm run build

# 4. Права
cd /var/www
chown -R www-data:www-data tierforge
```

**Nginx configuration** (`/etc/nginx/sites-available/tierforge`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        root /var/www/tierforge/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tierforge /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Systemd service** (`/etc/systemd/system/tierforge.service`):

```ini
[Unit]
Description=TierForge API Server
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/tierforge/backend
ExecStart=/var/www/tierforge/backend/tierforge --db tierforge.db
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
# Start service
sudo systemctl daemon-reload
sudo systemctl enable tierforge
sudo systemctl start tierforge
sudo systemctl status tierforge
```

**SSL (optional but recommended):**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Data Pipeline

See [scripts/README.md](scripts/README.md) for details on the data collection pipeline.

```bash
# Rescrape spell data (if needed)
python3 scripts/scrape_all_spells.py
python3 scripts/batch_fetch_infoboxes.py
python3 scripts/apply_combo_schools.py

# Reimport into database
cd backend
go run cmd/import_spells/main.go --db tierforge.db --spells ../data/spells.json
go run cmd/update_infoboxes/main.go --db tierforge.db --infoboxes ../data/infoboxes.json
```

## Tech Stack

- **Frontend:** TypeScript, Vite, Custom component framework
- **Backend:** Go, Chi router, SQLite
- **Data:** Python (requests, BeautifulSoup4)
- **Deployment:** Nginx, Systemd

## License

MIT
