package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/meur/tierforge/internal/models"
	"github.com/meur/tierforge/internal/storage"
)

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
)

const wikiBaseURL = "https://divinityoriginalsin2.wiki.fextralife.com/"

var wikiAliases = map[string]string{
	"Bigger and Better": "Bigger And Better",
	"Five-star Diner":   "Five-Star Diner",
	"Walk it Off":       "Walk It Off",
}

type talentEntry struct {
	Name        string `json:"name"`
	Icon        string `json:"icon"`
	Description string `json:"description"`
	InfoboxHTML string `json:"infoboxHtml"`
}

func stableID(gameID string, sheetID string, name string) string {
	input := fmt.Sprintf("%s:%s:%s", gameID, sheetID, name)
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(input)).String()
}

func copyData(src map[string]interface{}) map[string]interface{} {
	if src == nil {
		return map[string]interface{}{}
	}
	dst := make(map[string]interface{}, len(src))
	for key, value := range src {
		dst[key] = value
	}
	return dst
}

func buildWikiURL(name string) string {
	wikiName := name
	if alias, ok := wikiAliases[name]; ok {
		wikiName = alias
	}
	return wikiBaseURL + url.QueryEscape(wikiName)
}

func main() {
	dbPath := flag.String("db", "backend/tierforge.db", "SQLite database path")
	talentsPath := flag.String(
		"talents-json",
		"../divinity/data/talents.json",
		"Path to talents JSON export from the divinity repo",
	)
	gameID := flag.String("game-id", "dos2", "Game ID")
	sheetID := flag.String("sheet-id", "talents", "Sheet ID")
	dryRun := flag.Bool("dry-run", false, "Print summary without writing to the database")
	flag.Parse()

	raw, err := os.ReadFile(*talentsPath)
	if err != nil {
		log.Fatalf("%s✗ Failed to read talents JSON: %v%s", colorRed, err, colorReset)
	}

	talents := map[string]talentEntry{}
	if err := json.Unmarshal(raw, &talents); err != nil {
		log.Fatalf("%s✗ Failed to parse talents JSON: %v%s", colorRed, err, colorReset)
	}
	if len(talents) == 0 {
		log.Fatalf("%s✗ Talents JSON is empty%s", colorRed, colorReset)
	}

	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("%s✗ Failed to connect to database: %v%s", colorRed, err, colorReset)
	}
	defer store.Close()

	existingItems, err := store.GetItems(*gameID, *sheetID)
	if err != nil {
		log.Fatalf("%s✗ Failed to read existing items: %v%s", colorRed, err, colorReset)
	}

	existingByName := make(map[string]models.Item, len(existingItems))
	duplicateNames := 0
	for _, item := range existingItems {
		if _, exists := existingByName[item.Name]; exists {
			duplicateNames++
			continue
		}
		existingByName[item.Name] = item
	}

	keys := make([]string, 0, len(talents))
	for key := range talents {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	items := make([]models.Item, 0, len(talents))
	created := 0
	updated := 0
	skipped := 0

	for _, key := range keys {
		entry := talents[key]
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			name = strings.TrimSpace(key)
		}
		if name == "" {
			skipped++
			continue
		}

		item, exists := existingByName[name]
		if !exists {
			item = models.Item{
				ID:       stableID(*gameID, *sheetID, name),
				GameID:   *gameID,
				SheetID:  *sheetID,
				Name:     name,
				Category: "Talents",
			}
		}

		item.GameID = *gameID
		item.SheetID = *sheetID
		item.Name = name
		if item.Category == "" {
			item.Category = "Talents"
		}
		if entry.Icon != "" {
			item.Icon = entry.Icon
		}

		data := copyData(item.Data)
		if entry.Description != "" {
			data["description"] = entry.Description
		}
		if entry.InfoboxHTML != "" {
			data["infobox_html"] = entry.InfoboxHTML
		}
		data["wiki_url"] = buildWikiURL(name)
		item.Data = data

		if exists {
			updated++
		} else {
			created++
		}
		items = append(items, item)
	}

	if duplicateNames > 0 {
		log.Printf("%s⚠ Warning: %d duplicate name(s) found in existing items%s", colorYellow, duplicateNames, colorReset)
	}

	fmt.Printf("%s📦 Loaded %d talents from JSON%s\n", colorCyan, len(talents), colorReset)

	if *dryRun {
		log.Printf(
			"Dry run: would import %d talents (created %d, updated %d, skipped %d). Existing items: %d",
			len(items),
			created,
			updated,
			skipped,
			len(existingItems),
		)
		return
	}

	if err := store.BulkCreateItems(items); err != nil {
		log.Fatalf("%s✗ Failed to import talents: %v%s", colorRed, err, colorReset)
	}

	fmt.Printf("%s✓ Imported %d talents (created %d, updated %d)%s\n", colorGreen, len(items), created, updated, colorReset)
}
