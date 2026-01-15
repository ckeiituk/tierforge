package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/meur/tierforge/internal/storage"
)

// Server holds the HTTP server dependencies
type Server struct {
	store  *storage.Store
	router chi.Router
}

// New creates a new API server
func New(store *storage.Store) *Server {
	s := &Server{
		store:  store,
		router: chi.NewRouter(),
	}

	s.setupMiddleware()
	s.setupRoutes()

	return s
}

// ServeHTTP implements http.Handler
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Server) setupMiddleware() {
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Compress(5))
	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*", "https://*.tierforge.app"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
}

func (s *Server) setupRoutes() {
	s.router.Route("/api", func(r chi.Router) {
		// Games
		r.Get("/games", s.handleGetGames)
		r.Get("/games/{gameID}", s.handleGetGame)
		r.Get("/games/{gameID}/items", s.handleGetItems)
		r.Get("/games/{gameID}/sheets", s.handleGetSheets)

		// TierLists
		r.Post("/tierlists", s.handleCreateTierList)
		r.Get("/tierlists/{id}", s.handleGetTierList)
		r.Put("/tierlists/{id}", s.handleUpdateTierList)

		// Share links
		r.Get("/s/{code}", s.handleGetTierListByCode)
	})

	// Health check
	s.router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
}

// --- Response helpers ---

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}
