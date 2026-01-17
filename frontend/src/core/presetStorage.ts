import type { TierListPreset, TierListPresetState } from '@/types';

const STORAGE_PREFIX = 'tierforge.presets';

const getStorageKey = (gameId: string, sheetId: string): string =>
    `${STORAGE_PREFIX}.${gameId}.${sheetId}`;

const isPresetSummary = (value: unknown): value is TierListPreset => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string' && typeof record.name === 'string';
};

const normalizePresetState = (value: unknown): TierListPresetState => {
    const fallback: TierListPresetState = { activeId: null, presets: [] };
    if (!value || typeof value !== 'object') return fallback;

    const record = value as Record<string, unknown>;
    const presetsRaw = Array.isArray(record.presets) ? record.presets : [];
    const presets = presetsRaw.filter(isPresetSummary);

    const activeId = typeof record.activeId === 'string' ? record.activeId : null;
    const resolvedActiveId = activeId && presets.some((preset) => preset.id === activeId)
        ? activeId
        : presets[0]?.id ?? null;

    return { activeId: resolvedActiveId, presets };
};

export const createEmptyPresetState = (): TierListPresetState => ({
    activeId: null,
    presets: [],
});

export const loadPresetState = (gameId: string, sheetId: string): TierListPresetState => {
    try {
        const raw = localStorage.getItem(getStorageKey(gameId, sheetId));
        if (!raw) return createEmptyPresetState();
        const parsed: unknown = JSON.parse(raw);
        return normalizePresetState(parsed);
    } catch (error) {
        console.error('Failed to load preset state', error);
        return createEmptyPresetState();
    }
};

export const savePresetState = (
    gameId: string,
    sheetId: string,
    state: TierListPresetState
): void => {
    try {
        localStorage.setItem(getStorageKey(gameId, sheetId), JSON.stringify(state));
    } catch (error) {
        console.error('Failed to save preset state', error);
    }
};
