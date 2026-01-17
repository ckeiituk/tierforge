package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/meur/tierforge/internal/storage"
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
		log.Fatalf("Failed to read infoboxes: %v", err)
	}

	var infoboxes map[string]InfoboxData
	if err := json.Unmarshal(data, &infoboxes); err != nil {
		log.Fatalf("Failed to parse infoboxes: %v", err)
	}

	fmt.Printf("Loaded %d infoboxes\n", len(infoboxes))

	// Connect to database
	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Update items
	updated := 0
	notFound := 0
	
	for spellName, info := range infoboxes {
		// Try to find item by name (case-insensitive partial match)
		items, err := store.GetItems("dos2", "skills")
		if err != nil {
			log.Printf("Error getting items: %v", err)
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
					log.Printf("Failed to update %s: %v", spellName, err)
				} else {
					updated++
					found = true
				}
				break
			}
		}
		
		if !found {
			notFound++
		}
	}

	fmt.Printf("Updated: %d items\n", updated)
	fmt.Printf("Not found: %d items\n", notFound)
}
