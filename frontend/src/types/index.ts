// ========================================
// Core Types for TierForge
// ========================================

// --- Game Configuration ---

export interface Game {
    id: string;
    name: string;
    description: string;
    icon_url: string;
    item_schema: Record<string, unknown>;
    filters: FilterConfig[];
    default_tiers: TierConfig[];
    sheets: SheetConfig[];
}

export interface FilterConfig {
    id: string;
    name: string;
    field: string;
    type: 'select' | 'multiselect' | 'toggle';
    options: string[];
    icon_map?: Record<string, string>;
}

export interface SheetConfig {
    id: string;
    name: string;
    description: string;
    item_filter: string;
}

export interface TierConfig {
    id: string;
    name: string;
    color: string;
    order: number;
}

// --- Items ---

export interface Item {
    id: string;
    game_id: string;
    sheet_id: string;
    name: string;
    name_ru?: string;
    icon: string;
    category: string;
    data: Record<string, unknown>;
}

export interface ItemList {
    items: Item[];
    total_count: number;
}

// --- Tier Lists ---

export interface TierList {
    id: string;
    game_id: string;
    sheet_id: string;
    name: string;
    author_id?: string;
    tiers: Tier[];
    share_code: string;
    is_public: boolean;
    created_at: string;
    updated_at: string;
}

export interface Tier {
    id: string;
    name: string;
    color: string;
    order: number;
    items: string[]; // Item IDs
}

export interface TierListCreate {
    game_id: string;
    sheet_id: string;
    name: string;
    tiers?: Tier[];
}

export interface TierListUpdate {
    name?: string;
    tiers?: Tier[];
    is_public?: boolean;
}

// --- UI State ---

export interface AppState {
    currentGame: Game | null;
    currentSheet: SheetConfig | null;
    items: Map<string, Item>;
    tierList: TierList | null;
    unrankedItems: string[];
    selectedItems: Set<string>;
    isDragging: boolean;
    isEditing: boolean;
    filters: Record<string, string[]>;
    history: HistoryEntry[];
    historyIndex: number;
}

export interface HistoryEntry {
    tiers: Tier[];
    timestamp: number;
    action: string;
}

// --- Events ---

export type AppEvent =
    | { type: 'GAME_CHANGED'; game: Game }
    | { type: 'SHEET_CHANGED'; sheet: SheetConfig }
    | { type: 'ITEMS_LOADED'; items: Item[] }
    | { type: 'TIERLIST_LOADED'; tierList: TierList }
    | { type: 'ITEM_MOVED'; itemId: string; fromTier: string; toTier: string; position: number }
    | { type: 'TIER_ADDED'; tier: Tier }
    | { type: 'TIER_REMOVED'; tierId: string }
    | { type: 'TIER_UPDATED'; tier: Tier }
    | { type: 'TIERS_REORDERED'; tierIds: string[] }
    | { type: 'FILTER_CHANGED'; filterId: string; values: string[] }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'SAVE_REQUESTED' }
    | { type: 'SELECTION_CHANGED'; itemIds: Set<string> };
