package models

import (
	"time"
)

// TierList represents a user's tier list
type TierList struct {
	ID        string    `json:"id"`
	GameID    string    `json:"game_id"`
	SheetID   string    `json:"sheet_id"`
	Name      string    `json:"name"`
	AuthorID  *string   `json:"author_id,omitempty"` // nil = anonymous
	Tiers     []Tier    `json:"tiers"`
	ShareCode string    `json:"share_code"`
	IsPublic  bool      `json:"is_public"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Tier represents a single tier in a tier list
type Tier struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Color string   `json:"color"`
	Order int      `json:"order"`
	Items []string `json:"items"` // Item IDs in order
}

// TierListCreate is the request body for creating a tier list
type TierListCreate struct {
	GameID  string `json:"game_id"`
	SheetID string `json:"sheet_id"`
	Name    string `json:"name"`
	Tiers   []Tier `json:"tiers"`
}

// TierListUpdate is the request body for updating a tier list
type TierListUpdate struct {
	Name     *string `json:"name,omitempty"`
	Tiers    []Tier  `json:"tiers,omitempty"`
	IsPublic *bool   `json:"is_public,omitempty"`
}

// TierListSummary is a lightweight version for listings
type TierListSummary struct {
	ID        string    `json:"id"`
	GameID    string    `json:"game_id"`
	SheetID   string    `json:"sheet_id"`
	Name      string    `json:"name"`
	ShareCode string    `json:"share_code"`
	ItemCount int       `json:"item_count"`
	UpdatedAt time.Time `json:"updated_at"`
}
