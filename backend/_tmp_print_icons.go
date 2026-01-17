package main

import (
    "fmt"
    "log"

    "github.com/meur/tierforge/internal/storage"
)

func main() {
    store, err := storage.New("./tierforge.db")
    if err != nil {
        log.Fatal(err)
    }
    defer store.Close()

    items, err := store.GetItems("dos2", "skills")
    if err != nil {
        log.Fatal(err)
    }

    want := map[string]bool{"Bless": true, "Electric Discharge": true, "Armor of Frost": true}
    for _, item := range items {
        if want[item.Name] {
            fmt.Printf("%s icon=%q\n", item.Name, item.Icon)
        }
    }
}
