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

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
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
		log.Fatalf("%s✗ Failed to read spells: %v%s", colorRed, err, colorReset)
	}

	var root SpellsRoot
	if err := json.Unmarshal(data, &root); err != nil {
		log.Fatalf("%s✗ Failed to parse spells: %v%s", colorRed, err, colorReset)
	}

	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("%s✗ Failed to connect to database: %v%s", colorRed, err, colorReset)
	}
	defer store.Close()

	// Load game configuration from seed file
	seedPath := "seeds/dos2_game.json"
	seedData, err := os.ReadFile(seedPath)
	if err != nil {
		log.Fatalf("%s✗ Failed to read game seed file %s: %v%s", colorRed, seedPath, err, colorReset)
	}

	var game models.Game
	if err := json.Unmarshal(seedData, &game); err != nil {
		log.Fatalf("%s✗ Failed to parse game seed: %v%s", colorRed, err, colorReset)
	}

	if err := store.CreateGame(&game); err != nil {
		log.Fatalf("%s✗ Failed to create game record: %v%s", colorRed, err, colorReset)
	}
	fmt.Printf("%s🎮 Game '%s' created/updated.%s\n", colorCyan, game.Name, colorReset)

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
	fmt.Printf("%s🗑️  Cleaning up old items...%s\n", colorYellow, colorReset)
	if err := store.DeleteItemsByGame("dos2"); err != nil {
		log.Printf("%s⚠ Warning: failed to clean up items: %v%s", colorYellow, err, colorReset)
	}

	fmt.Printf("%s📥 Importing %d spells from %d schools...%s\n", colorCyan, spellCount, schoolCount, colorReset)

	if err := store.BulkCreateItems(allItems); err != nil {
		log.Fatalf("%s✗ Failed to bulk create items: %v%s", colorRed, err, colorReset)
	}

	fmt.Printf("%s✓ Successfully imported all spells!%s\n", colorGreen, colorReset)
}
