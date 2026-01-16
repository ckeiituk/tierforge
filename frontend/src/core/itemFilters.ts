import type { FilterConfig, Item } from '@/types';

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

const normalizeValue = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'number') return [String(value)];
    if (typeof value === 'boolean') return [value ? 'true' : 'false'];
    if (Array.isArray(value)) {
        return value.filter((entry): entry is string => typeof entry === 'string');
    }
    return [];
};

const tierLevelPattern = /\d+/;

export const extractTierLevel = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = tierLevelPattern.exec(trimmed);
    if (!match) return null;
    return match[0] ?? null;
};

const normalizeFilterValues = (filter: FilterConfig, value: unknown): string[] => {
    const values = normalizeValue(value);
    if (filter.id === 'level' && filter.field === 'tier') {
        return values
            .map((entry: string) => extractTierLevel(entry))
            .filter((entry: string | null): entry is string => Boolean(entry));
    }
    return values;
};

export const hasActiveFilters = (
    filters: FilterConfig[],
    activeFilters: Record<string, string[]>
): boolean => filters.some((filter) => (activeFilters[filter.id] ?? []).length > 0);

export const matchesActiveFilters = (
    item: Item,
    filters: FilterConfig[],
    activeFilters: Record<string, string[]>
): boolean => {
    if (filters.length === 0) return true;

    return filters.every((filter) => {
        const activeValues = activeFilters[filter.id] ?? [];
        if (activeValues.length === 0) return true;

        const raw = item.data[filter.field];
        const values = normalizeFilterValues(filter, raw);
        if (values.length === 0) return false;

        return values.some((value) => activeValues.includes(value));
    });
};

export const matchesSearchQuery = (item: Item, query: string): boolean => {
    const normalized = normalizeQuery(query);
    if (!normalized) return true;

    const name = item.name.toLowerCase();
    if (name.includes(normalized)) return true;

    const nameRu = item.name_ru?.toLowerCase();
    return Boolean(nameRu && nameRu.includes(normalized));
};
