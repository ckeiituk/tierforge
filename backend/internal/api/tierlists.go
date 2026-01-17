package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/meur/tierforge/internal/models"
)

// handleCreateTierList creates a new tier list
func (s *Server) handleCreateTierList(w http.ResponseWriter, r *http.Request) {
	var req models.TierListCreate
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.GameID == "" || req.SheetID == "" || req.Name == "" {
		respondError(w, http.StatusBadRequest, "game_id, sheet_id, and name are required")
		return
	}

	// Validate game exists
	game, err := s.store.GetGame(req.GameID)
	if err != nil || game == nil {
		respondError(w, http.StatusBadRequest, "Invalid game_id")
		return
	}

	// Use default tiers if none provided
	if len(req.Tiers) == 0 {
		for _, t := range game.DefaultTiers {
			req.Tiers = append(req.Tiers, models.Tier{
				ID:    t.ID,
				Name:  t.Name,
				Color: t.Color,
				Order: t.Order,
				Items: []string{},
			})
		}
	}

	tierList, err := s.store.CreateTierList(&req)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create tier list")
		return
	}

	respondJSON(w, http.StatusCreated, tierList)
}

// handleGetTierList returns a tier list by ID
func (s *Server) handleGetTierList(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	tierList, err := s.store.GetTierList(id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch tier list")
		return
	}
	if tierList == nil {
		respondError(w, http.StatusNotFound, "Tier list not found")
		return
	}

	respondJSON(w, http.StatusOK, tierList)
}

// handleUpdateTierList updates an existing tier list
func (s *Server) handleUpdateTierList(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Check if tier list exists
	existing, err := s.store.GetTierList(id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch tier list")
		return
	}
	if existing == nil {
		respondError(w, http.StatusNotFound, "Tier list not found")
		return
	}

	var update models.TierListUpdate
	if err := decodeJSON(r, &update); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := s.store.UpdateTierList(id, &update); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update tier list")
		return
	}

	// Return updated tier list
	updated, _ := s.store.GetTierList(id)
	respondJSON(w, http.StatusOK, updated)
}

// handleGetTierListByCode returns a tier list by share code
func (s *Server) handleGetTierListByCode(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")

	tierList, err := s.store.GetTierListByShareCode(code)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch tier list")
		return
	}
	if tierList == nil {
		respondError(w, http.StatusNotFound, "Tier list not found")
		return
	}

	respondJSON(w, http.StatusOK, tierList)
}

// handleDeleteTierList deletes a tier list by ID
func (s *Server) handleDeleteTierList(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	existing, err := s.store.GetTierList(id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch tier list")
		return
	}
	if existing == nil {
		respondError(w, http.StatusNotFound, "Tier list not found")
		return
	}

	if err := s.store.DeleteTierList(id); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete tier list")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
