package models

import (
	"encoding/json"
	"time"
)

// Game represents a game configuration
type Game struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	IconURL      string          `json:"icon_url"`
	ItemSchema   json.RawMessage `json:"item_schema"`
	Filters      []FilterConfig  `json:"filters"`
	DefaultTiers []TierConfig    `json:"default_tiers"`
	Sheets       []SheetConfig   `json:"sheets"`
	CreatedAt    time.Time       `json:"created_at"`
}

// FilterConfig defines a filter option for items
type FilterConfig struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Field    string   `json:"field"`    // Field in item.Data to filter by
	Type     string   `json:"type"`     // "select", "multiselect", "toggle"
	Options  []string `json:"options"`  // For select/multiselect
	IconMap  map[string]string `json:"icon_map,omitempty"` // Option -> icon URL
}

// SheetConfig defines a sheet (sub-tierlist) within a game
type SheetConfig struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	ItemFilter  string `json:"item_filter"` // Filter expression for items in this sheet
}

// TierConfig defines default tier setup
type TierConfig struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
	Order int    `json:"order"`
}

// DefaultTiers returns standard S-F tier configuration
func DefaultTiers() []TierConfig {
	return []TierConfig{
		{ID: "s", Name: "S", Color: "#ff7f7f", Order: 0},
		{ID: "a", Name: "A", Color: "#ffbf7f", Order: 1},
		{ID: "b", Name: "B", Color: "#ffff7f", Order: 2},
		{ID: "c", Name: "C", Color: "#7fff7f", Order: 3},
		{ID: "d", Name: "D", Color: "#7fbfff", Order: 4},
		{ID: "f", Name: "F", Color: "#ff7fff", Order: 5},
	}
}
