#!/bin/bash
set -e

PROJECT_ROOT="/home/meur/vscode/tierforge"
BACKEND_DIR="$PROJECT_ROOT/backend"
DATA_DIR="$PROJECT_ROOT/data"
DB_PATH="$PROJECT_ROOT/tierforge.db"

echo "🚀 Starting spell database refresh..."

# 1. Scrape all spells
echo "--- Scraping all spells from wiki ---"
python3 "$PROJECT_ROOT/scripts/scrape_all_spells.py"

# 2. Fetch infoboxes and icons
echo "--- Fetching infoboxes and icons ---"
python3 "$PROJECT_ROOT/scripts/batch_fetch_infoboxes.py"

# 3. Update game configuration (seed)
echo "--- Seeding game configuration ---"
cd "$BACKEND_DIR"
go run cmd/seed/main.go --db "$DB_PATH" --seeds "$BACKEND_DIR/seeds"

# 4. Import new spells
echo "--- Importing spells into database ---"
go run cmd/import_spells/main.go --db "$DB_PATH" --spells "$DATA_DIR/spells.json"

# 5. Enrich spells with infoboxes and icons
echo "--- Updating infoboxes and icons ---"
go run cmd/update_infoboxes/main.go --db "$DB_PATH" --infoboxes "$DATA_DIR/infoboxes.json"

echo "✨ Spell database refresh complete!"
