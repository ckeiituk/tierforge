import type { Game, ItemList, TierList, TierListCreate, TierListUpdate, SheetConfig } from '@/types';

const API_BASE = '/api';

class APIError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'APIError';
    }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new APIError(response.status, error.error || 'Request failed');
    }

    return response.json();
}

// --- Games ---

export async function getGames(): Promise<Game[]> {
    return request<Game[]>('/games');
}

export async function getGame(gameId: string): Promise<Game> {
    return request<Game>(`/games/${gameId}`);
}

export async function getItems(gameId: string, sheetId?: string): Promise<ItemList> {
    const query = sheetId ? `?sheet=${encodeURIComponent(sheetId)}` : '';
    return request<ItemList>(`/games/${gameId}/items${query}`);
}

export async function getSheets(gameId: string): Promise<SheetConfig[]> {
    return request<SheetConfig[]>(`/games/${gameId}/sheets`);
}

// --- TierLists ---

export async function createTierList(data: TierListCreate): Promise<TierList> {
    return request<TierList>('/tierlists', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function getTierList(id: string): Promise<TierList> {
    return request<TierList>(`/tierlists/${id}`);
}

export async function updateTierList(id: string, data: TierListUpdate): Promise<TierList> {
    return request<TierList>(`/tierlists/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function getTierListByCode(code: string): Promise<TierList> {
    return request<TierList>(`/s/${code}`);
}

// --- Utility ---

export { APIError };
