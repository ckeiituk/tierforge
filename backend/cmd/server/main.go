package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/meur/tierforge/internal/api"
	"github.com/meur/tierforge/internal/storage"
)

func main() {
	// Parse flags
	port := flag.String("port", getEnv("PORT", "8080"), "Server port")
	dbPath := flag.String("db", getEnv("DB_PATH", "./tierforge.db"), "SQLite database path")
	flag.Parse()

	// Initialize storage
	store, err := storage.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}
	defer store.Close()

	// Create router
	r := api.New(store)

	// Serve frontend static files (for production deployment)
	workDir, _ := os.Getwd()
	filesDir := http.Dir(filepath.Join(workDir, "../frontend/dist"))
	FileServer(r, "/", filesDir)

	log.Printf("🚀 TierForge API starting on http://localhost:%s", *port)
	log.Printf("📦 Database: %s", *dbPath)

	if err := http.ListenAndServe(":"+*port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// FileServer conveniently sets up a http.FileServer handler to serve
// static files from a http.FileSystem.
func FileServer(r chi.Router, path string, root http.FileSystem) {
	if strings.ContainsAny(path, "{}*") {
		panic("FileServer does not permit URL parameters.")
	}

	if path != "/" && path[len(path)-1] != '/' {
		r.Get(path, http.RedirectHandler(path+"/", 301).ServeHTTP)
		path += "/"
	}
	path += "*"

	r.Get(path, func(w http.ResponseWriter, req *http.Request) {
		rctx := chi.RouteContext(req.Context())
		pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
		fs := http.StripPrefix(pathPrefix, http.FileServer(root))
		fs.ServeHTTP(w, req)
	})
}
