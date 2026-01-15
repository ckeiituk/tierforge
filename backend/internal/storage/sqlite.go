package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	_ "github.com/mattn/go-sqlite3"
	"github.com/meur/tierforge/internal/models"
)

// Store handles all database operations
type Store struct {
	db *sql.DB
}

// New creates a new Store with SQLite
func New(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return store, nil
}

// Close closes the database connection
func (s *Store) Close() error {
	return s.db.Close()
}

// migrate runs database migrations
func (s *Store) migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS games (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			icon_url TEXT,
			item_schema TEXT,
			filters TEXT,
			default_tiers TEXT,
			sheets TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS items (
			id TEXT PRIMARY KEY,
			game_id TEXT NOT NULL REFERENCES games(id),
			sheet_id TEXT NOT NULL,
			name TEXT NOT NULL,
			name_ru TEXT,
			icon TEXT,
			category TEXT,
			data TEXT,
			UNIQUE(game_id, id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_items_game ON items(game_id)`,
		`CREATE INDEX IF NOT EXISTS idx_items_sheet ON items(game_id, sheet_id)`,
		`CREATE TABLE IF NOT EXISTS tierlists (
			id TEXT PRIMARY KEY,
			game_id TEXT NOT NULL REFERENCES games(id),
			sheet_id TEXT NOT NULL,
			name TEXT NOT NULL,
			author_id TEXT,
			tiers TEXT NOT NULL,
			share_code TEXT UNIQUE NOT NULL,
			is_public INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tierlists_share ON tierlists(share_code)`,
		`CREATE INDEX IF NOT EXISTS idx_tierlists_game ON tierlists(game_id)`,
	}

	for _, m := range migrations {
		if _, err := s.db.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	return nil
}

// --- Games ---

// GetGames returns all games
func (s *Store) GetGames() ([]models.Game, error) {
	rows, err := s.db.Query(`
		SELECT id, name, description, icon_url, item_schema, filters, default_tiers, sheets, created_at
		FROM games ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var games []models.Game
	for rows.Next() {
		var g models.Game
		var itemSchema, filters, defaultTiers, sheets string
		err := rows.Scan(&g.ID, &g.Name, &g.Description, &g.IconURL,
			&itemSchema, &filters, &defaultTiers, &sheets, &g.CreatedAt)
		if err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(itemSchema), &g.ItemSchema)
		json.Unmarshal([]byte(filters), &g.Filters)
		json.Unmarshal([]byte(defaultTiers), &g.DefaultTiers)
		json.Unmarshal([]byte(sheets), &g.Sheets)
		games = append(games, g)
	}
	return games, nil
}

// GetGame returns a game by ID
func (s *Store) GetGame(id string) (*models.Game, error) {
	var g models.Game
	var itemSchema, filters, defaultTiers, sheets string
	err := s.db.QueryRow(`
		SELECT id, name, description, icon_url, item_schema, filters, default_tiers, sheets, created_at
		FROM games WHERE id = ?
	`, id).Scan(&g.ID, &g.Name, &g.Description, &g.IconURL,
		&itemSchema, &filters, &defaultTiers, &sheets, &g.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	json.Unmarshal([]byte(itemSchema), &g.ItemSchema)
	json.Unmarshal([]byte(filters), &g.Filters)
	json.Unmarshal([]byte(defaultTiers), &g.DefaultTiers)
	json.Unmarshal([]byte(sheets), &g.Sheets)
	return &g, nil
}

// CreateGame creates a new game
func (s *Store) CreateGame(g *models.Game) error {
	itemSchema, _ := json.Marshal(g.ItemSchema)
	filters, _ := json.Marshal(g.Filters)
	defaultTiers, _ := json.Marshal(g.DefaultTiers)
	sheets, _ := json.Marshal(g.Sheets)

	_, err := s.db.Exec(`
		INSERT INTO games (id, name, description, icon_url, item_schema, filters, default_tiers, sheets)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, g.ID, g.Name, g.Description, g.IconURL, itemSchema, filters, defaultTiers, sheets)
	return err
}

// --- Items ---

// GetItems returns items for a game, optionally filtered by sheet
func (s *Store) GetItems(gameID, sheetID string) ([]models.Item, error) {
	var rows *sql.Rows
	var err error

	if sheetID != "" {
		rows, err = s.db.Query(`
			SELECT id, game_id, sheet_id, name, name_ru, icon, category, data
			FROM items WHERE game_id = ? AND sheet_id = ? ORDER BY name
		`, gameID, sheetID)
	} else {
		rows, err = s.db.Query(`
			SELECT id, game_id, sheet_id, name, name_ru, icon, category, data
			FROM items WHERE game_id = ? ORDER BY name
		`, gameID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.Item
	for rows.Next() {
		var item models.Item
		var dataStr string
		err := rows.Scan(&item.ID, &item.GameID, &item.SheetID, &item.Name,
			&item.NameRu, &item.Icon, &item.Category, &dataStr)
		if err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(dataStr), &item.Data)
		items = append(items, item)
	}
	return items, nil
}

// CreateItem creates a new item
func (s *Store) CreateItem(item *models.Item) error {
	data, _ := json.Marshal(item.Data)
	_, err := s.db.Exec(`
		INSERT INTO items (id, game_id, sheet_id, name, name_ru, icon, category, data)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, item.ID, item.GameID, item.SheetID, item.Name, item.NameRu, item.Icon, item.Category, data)
	return err
}

// BulkCreateItems creates multiple items in a transaction
func (s *Store) BulkCreateItems(items []models.Item) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO items (id, game_id, sheet_id, name, name_ru, icon, category, data)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, item := range items {
		data, _ := json.Marshal(item.Data)
		_, err := stmt.Exec(item.ID, item.GameID, item.SheetID, item.Name,
			item.NameRu, item.Icon, item.Category, data)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// --- TierLists ---

// generateShareCode creates a short unique share code
func generateShareCode() string {
	u := uuid.New()
	return u.String()[:8]
}

// CreateTierList creates a new tier list
func (s *Store) CreateTierList(tl *models.TierListCreate) (*models.TierList, error) {
	id := uuid.New().String()
	shareCode := generateShareCode()
	tiers, _ := json.Marshal(tl.Tiers)
	now := time.Now()

	_, err := s.db.Exec(`
		INSERT INTO tierlists (id, game_id, sheet_id, name, tiers, share_code, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, tl.GameID, tl.SheetID, tl.Name, tiers, shareCode, now, now)
	if err != nil {
		return nil, err
	}

	return &models.TierList{
		ID:        id,
		GameID:    tl.GameID,
		SheetID:   tl.SheetID,
		Name:      tl.Name,
		Tiers:     tl.Tiers,
		ShareCode: shareCode,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// GetTierList returns a tier list by ID
func (s *Store) GetTierList(id string) (*models.TierList, error) {
	var tl models.TierList
	var tiersStr string
	var authorID sql.NullString

	err := s.db.QueryRow(`
		SELECT id, game_id, sheet_id, name, author_id, tiers, share_code, is_public, created_at, updated_at
		FROM tierlists WHERE id = ?
	`, id).Scan(&tl.ID, &tl.GameID, &tl.SheetID, &tl.Name, &authorID,
		&tiersStr, &tl.ShareCode, &tl.IsPublic, &tl.CreatedAt, &tl.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if authorID.Valid {
		tl.AuthorID = &authorID.String
	}
	json.Unmarshal([]byte(tiersStr), &tl.Tiers)
	return &tl, nil
}

// GetTierListByShareCode returns a tier list by share code
func (s *Store) GetTierListByShareCode(code string) (*models.TierList, error) {
	var tl models.TierList
	var tiersStr string
	var authorID sql.NullString

	err := s.db.QueryRow(`
		SELECT id, game_id, sheet_id, name, author_id, tiers, share_code, is_public, created_at, updated_at
		FROM tierlists WHERE share_code = ?
	`, code).Scan(&tl.ID, &tl.GameID, &tl.SheetID, &tl.Name, &authorID,
		&tiersStr, &tl.ShareCode, &tl.IsPublic, &tl.CreatedAt, &tl.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if authorID.Valid {
		tl.AuthorID = &authorID.String
	}
	json.Unmarshal([]byte(tiersStr), &tl.Tiers)
	return &tl, nil
}

// UpdateTierList updates an existing tier list
func (s *Store) UpdateTierList(id string, update *models.TierListUpdate) error {
	// Build dynamic update query
	sets := []string{"updated_at = ?"}
	args := []interface{}{time.Now()}

	if update.Name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *update.Name)
	}
	if update.Tiers != nil {
		tiers, _ := json.Marshal(update.Tiers)
		sets = append(sets, "tiers = ?")
		args = append(args, tiers)
	}
	if update.IsPublic != nil {
		sets = append(sets, "is_public = ?")
		args = append(args, *update.IsPublic)
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE tierlists SET %s WHERE id = ?",
		stringJoin(sets, ", "))

	_, err := s.db.Exec(query, args...)
	return err
}

func stringJoin(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
