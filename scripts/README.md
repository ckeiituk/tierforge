# Data Collection Scripts

This directory contains scripts for collecting and processing DOS2 skill data.

## Pipeline

Run in order:

```bash
# 1. Scrape base spell data from Russian Fandom wiki
python3 scripts/scrape_all_spells.py

# 2. Fetch infoboxes and icons from Fextralife
python3 scripts/batch_fetch_infoboxes.py

# 3. Set correct secondary schools for combo skills
python3 scripts/apply_combo_schools.py

# 4. Import into database
cd backend
go run cmd/import_spells/main.go --db tierforge.db --spells ../data/spells.json
go run cmd/update_infoboxes/main.go --db tierforge.db --infoboxes ../data/infoboxes.json
```

## Script Details

### `scrape_all_spells.py`
Scrapes spell names, URLs, tiers, and schools from the Russian Fandom wiki.
- **Input:** URLs hardcoded for each school
- **Output:** `data/spells.json`

### `batch_fetch_infoboxes.py`
Fetches detailed HTML infoboxes and icons from Fextralife for each spell.
- **Input:** `data/spells.json`
- **Output:** `data/infoboxes.json`

### `apply_combo_schools.py`
Corrects `secondary_school` for all 48 combo skills to ensure proper border coloring.
- **Input/Output:** `data/spells.json`
- **Logic:** Border color = Secondary school (not Primary), providing visual contrast

## Notes
- Always run from project root
- Requires `requests` and `beautifulsoup4` (`pip install requests beautifulsoup4`)
