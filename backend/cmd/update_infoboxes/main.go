package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/meur/tierforge/internal/storage"
)

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
	colorCyan   = "\033[36m"
)

// InfoboxData from infoboxes.json
type InfoboxData struct {
	URL         string `json:"url"`
	InfoboxHTML string `json:"infobox_html"`
	Icon        string `json:"icon"`
}

func main() {
	dbPath := flag.String("db", "./tierforge.db", "SQLite database path")
	infoboxPath := flag.String("infoboxes", "data/infoboxes.json", "Infoboxes JSON path")
	flag.Parse()
	
	// Read infoboxes.json
	data, err := os.ReadFile(*infoboxPath)
	if err != nil {
		log.Fatalf("%s✗ Failed to read infoboxes: %v%s", colorRed, err, colorReset)
	}

	var infoboxes map[string]InfoboxData
	if err := json.Unmarshal(data, &infoboxes); err != nil {
		log.Fatalf("%s✗ Failed to parse infoboxes: %v%s", colorRed, err, colorReset)
	}

	fmt.Printf("%s📦 Loaded %d infoboxes%s\n", colorCyan, len(infoboxes), colorReset)

	// Connect to database
	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("%s✗ Failed to connect to database: %v%s", colorRed, err, colorReset)
	}

	// Update items
	updated := 0
	notFoundList := []string{}
	
	for spellName, info := range infoboxes {
		// Try to find item by name (case-insensitive partial match)
		items, err := store.GetItems("dos2", "skills")
		if err != nil {
			log.Printf("%s⚠ Error getting items: %v%s", colorYellow, err, colorReset)
			continue
		}

		found := false
		for _, item := range items {
			if item.Name == spellName || item.NameRu == spellName {
				// Update item with icon and infobox_html
				if item.Data == nil {
					item.Data = make(map[string]interface{})
				}
				item.Data["infobox_html"] = info.InfoboxHTML
				item.Data["wiki_url"] = info.URL
				
				if info.Icon != "" {
					item.Icon = info.Icon
				}
				
				if err := store.UpdateItem(&item); err != nil {
					log.Printf("%s✗ Failed to update %s: %v%s", colorRed, spellName, err, colorReset)
				} else {
					updated++
					found = true
				}
				break
			}
		}
		
		if !found {
			notFoundList = append(notFoundList, spellName)
		}
	}

	fmt.Printf("%s✓ Updated: %d items%s\n", colorGreen, updated, colorReset)
	
	if len(notFoundList) > 0 {
		fmt.Printf("%s⚠ Not found: %d items%s\n", colorYellow, len(notFoundList), colorReset)
		for _, name := range notFoundList {
			fmt.Printf("  %s- %s%s\n", colorYellow, name, colorReset)
		}
	} else {
		fmt.Printf("%s✓ All infoboxes matched!%s\n", colorGreen, colorReset)
	}
}
