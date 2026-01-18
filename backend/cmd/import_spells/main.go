package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/meur/tierforge/internal/models"
	"github.com/meur/tierforge/internal/storage"
)

type SpellData struct {
	RuName          string `json:"ru_name"`
	EnName          string `json:"en_name"`
	RuURL           string `json:"ru_url"`
	EnURL           string `json:"en_url"`
	Tier            string `json:"tier"`
	PrimarySchool   string `json:"primary_school"`
	SecondarySchool string `json:"secondary_school,omitempty"`
	IsCombo         bool   `json:"is_combo,omitempty"`
	Icon            string `json:"icon"`
}

type SchoolData struct {
	EnName string               `json:"en_name"`
	Spells map[string]SpellData `json:"spells"`
}

type SpellsRoot struct {
	Schools map[string]SchoolData `json:"schools"`
}

var slugRegex = regexp.MustCompile(`[^\p{L}\p{N}]+`)

func slugify(s string) string {
	s = strings.ToLower(s)
	s = slugRegex.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func main() {
	dbPath := flag.String("db", "./tierforge.db", "SQLite database path")
	spellsPath := flag.String("spells", "data/spells.json", "Spells JSON path")
	flag.Parse()

	data, err := os.ReadFile(*spellsPath)
	if err != nil {
		log.Fatalf("Failed to read spells: %v", err)
	}

	var root SpellsRoot
	if err := json.Unmarshal(data, &root); err != nil {
		log.Fatalf("Failed to parse spells: %v", err)
	}

	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer store.Close()

	// Ensure the game exists to satisfy Foreign Key constraints
	game := &models.Game{
		ID:          "dos2",
		Name:        "Divinity: Original Sin 2",
		Description: "Skills from Divinity: Original Sin 2",
		IconURL:     "placeholder.png",
		Sheets: []models.SheetConfig{
			{
				ID:          "skills",
				Name:        "Skills",
				Description: "All skills and spells",
				ItemFilter:  "",
			},
		},
		DefaultTiers: []models.TierConfig{
			{ID: "S", Name: "S", Color: "#FF7F7F", Order: 0},
			{ID: "A", Name: "A", Color: "#FFBF7F", Order: 1},
			{ID: "B", Name: "B", Color: "#FFFF7F", Order: 2},
			{ID: "C", Name: "C", Color: "#7FFF7F", Order: 3},
			{ID: "D", Name: "D", Color: "#7F7FFF", Order: 4},
		},
	}

	if err := store.CreateGame(game); err != nil {
		log.Fatalf("Failed to create game record: %v", err)
	}

	var allItems []models.Item
	schoolCount := 0
	spellCount := 0

	for ruSchoolName, school := range root.Schools {
		schoolCount++
		sheetID := "skills"
		
		schoolSlug := slugify(school.EnName)
		if schoolSlug == "" {
			schoolSlug = slugify(ruSchoolName)
		}

		for _, spell := range school.Spells {
			// Use English name for ID if possible, otherwise Russian
			nameForID := spell.EnName
			if nameForID == "" {
				nameForID = spell.RuName
			}
			
			// Use explicit primary school from spell if available (especially for combos)
			category := spell.PrimarySchool
			if category == "" {
				category = ruSchoolName
			}
			if category == "Комбинированные навыки" && spell.PrimarySchool != "" {
				category = spell.PrimarySchool
			}

			// Generate stable ID
			// We try to stick to [School]-[Name] format
			// But for combos, school is variable.
			// Let's rely on the spell name primarily for uniqueness across the game
			
			spellSlug := slugify(nameForID)
			
			// To avoid collisions/ambiguity, we can prefix with school slug if needed,
			// but pure name slug is cleaner URL.
			// However, standard spells are often [School]-[Spell].
			// Let's try to infer the school slug for the ID from the category.
			
			catSlug := slugify(category)
			// Map RU category back to EN for ID consistency if we can (hard without map here)
			// Actually we have school.EnName, but for combo skills, category is one of the components.
			// Let's use the spellSlug as is for now, or prefix it with "skill-" to be safe?
			// Existing items were like "warfare-bouncing-shield" ?
			// Let's check logic: id := schoolSlug + "-" + nameSlug
			
			// If it's a combo skill, we might not have a clean "English School Name" easily available 
			// without a map unless we pass it.
			// For standard skills, school.EnName is good.
			
			id := catSlug + "-" + spellSlug
			if spell.EnName != "" && school.EnName != "" && !spell.IsCombo {
				id = slugify(school.EnName) + "-" + slugify(spell.EnName)
			}
			
			// Check if we have English name to display
			displayName := spell.EnName
			if displayName == "" {
				displayName = spell.RuName
			}

			item := models.Item{
				ID:       id,
				GameID:   "dos2",
				SheetID:  sheetID,
				Name:     displayName,
				NameRu:   spell.RuName,
				Category: category,
				Icon:     spell.Icon,
				Data: map[string]interface{}{
					"tier":             spell.Tier,
					"primary_school":   category,
					"secondary_school": spell.SecondarySchool,
					"is_combo":         spell.IsCombo,
					"wiki_url_ru":      spell.RuURL,
					"wiki_url_en":      spell.EnURL,
				},
			}
			allItems = append(allItems, item)
			spellCount++
		}
	}

	// Delete existing items for this game to prevent duplicates (since IDs might have changed)
	fmt.Println("Cleaning up old items...")
	if err := store.DeleteItemsByGame("dos2"); err != nil {
		log.Printf("Warning: failed to clean up items: %v", err)
	}

	fmt.Printf("Importing %d spells from %d schools...\n", spellCount, schoolCount)

	if err := store.BulkCreateItems(allItems); err != nil {
		log.Fatalf("Failed to bulk create items: %v", err)
	}

	fmt.Println("✓ Successfully imported all spells!")
}
