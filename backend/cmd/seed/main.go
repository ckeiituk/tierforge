package main

import (
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/meur/tierforge/internal/models"
	"github.com/meur/tierforge/internal/storage"
)

func main() {
	dbPath := flag.String("db", "./tierforge.db", "SQLite database path")
	seedsDir := flag.String("seeds", "./seeds", "Seeds directory")
	flag.Parse()

	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer store.Close()

	// Seed games
	gameFiles := []string{"dos2_game.json", "bg3_game.json"}
	for _, file := range gameFiles {
		path := filepath.Join(*seedsDir, file)
		if err := seedGame(store, path); err != nil {
			log.Printf("Warning: failed to seed %s: %v", file, err)
		} else {
			log.Printf("✓ Seeded game from %s", file)
		}
	}

	log.Println("🌱 Seeding complete!")
}

func seedGame(store *storage.Store, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var game models.Game
	if err := json.Unmarshal(data, &game); err != nil {
		return err
	}

	return store.CreateGame(&game)
}
