package models

// Item represents an item that can be ranked in a tier list
type Item struct {
	ID       string                 `json:"id"`
	GameID   string                 `json:"game_id"`
	SheetID  string                 `json:"sheet_id"`  // Which sheet this item belongs to
	Name     string                 `json:"name"`
	NameRu   string                 `json:"name_ru,omitempty"` // Russian localization
	Icon     string                 `json:"icon"`
	Category string                 `json:"category"` // Primary category (school, class, etc.)
	Data     map[string]interface{} `json:"data"`     // Flexible data based on game schema
}

// ItemList is a collection of items
type ItemList struct {
	Items      []Item `json:"items"`
	TotalCount int    `json:"total_count"`
}
