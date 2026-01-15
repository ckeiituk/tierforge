package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// handleGetGames returns all available games
func (s *Server) handleGetGames(w http.ResponseWriter, r *http.Request) {
	games, err := s.store.GetGames()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch games")
		return
	}
	respondJSON(w, http.StatusOK, games)
}

// handleGetGame returns a single game by ID
func (s *Server) handleGetGame(w http.ResponseWriter, r *http.Request) {
	gameID := chi.URLParam(r, "gameID")

	game, err := s.store.GetGame(gameID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch game")
		return
	}
	if game == nil {
		respondError(w, http.StatusNotFound, "Game not found")
		return
	}

	respondJSON(w, http.StatusOK, game)
}

// handleGetItems returns items for a game
func (s *Server) handleGetItems(w http.ResponseWriter, r *http.Request) {
	gameID := chi.URLParam(r, "gameID")
	sheetID := r.URL.Query().Get("sheet")

	items, err := s.store.GetItems(gameID, sheetID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch items")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"items":       items,
		"total_count": len(items),
	})
}

// handleGetSheets returns available sheets for a game
func (s *Server) handleGetSheets(w http.ResponseWriter, r *http.Request) {
	gameID := chi.URLParam(r, "gameID")

	game, err := s.store.GetGame(gameID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch game")
		return
	}
	if game == nil {
		respondError(w, http.StatusNotFound, "Game not found")
		return
	}

	respondJSON(w, http.StatusOK, game.Sheets)
}
