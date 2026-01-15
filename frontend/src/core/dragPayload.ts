export interface DragPayload {
    itemId: string;
    fromTier: string;
}

const DRAG_MIME_TYPE = 'application/x-tierforge-item';
const TIER_DRAG_MIME_TYPE = 'application/x-tierforge-tier';

export interface TierDragPayload {
    tierId: string;
}

const isDragPayload = (value: unknown): value is DragPayload => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    return typeof payload.itemId === 'string' && typeof payload.fromTier === 'string';
};

export const setDragPayload = (dataTransfer: DataTransfer, payload: DragPayload): void => {
    dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify(payload));
    dataTransfer.setData('text/plain', payload.itemId);
};

const isTierDragPayload = (value: unknown): value is TierDragPayload => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    return typeof payload.tierId === 'string';
};

export const setTierDragPayload = (dataTransfer: DataTransfer, payload: TierDragPayload): void => {
    dataTransfer.setData(TIER_DRAG_MIME_TYPE, JSON.stringify(payload));
};

export const getDragPayload = (dataTransfer: DataTransfer | null): DragPayload | null => {
    if (!dataTransfer) return null;

    const raw = dataTransfer.getData(DRAG_MIME_TYPE) || dataTransfer.getData('application/json');
    if (raw) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isDragPayload(parsed)) {
                return parsed;
            }
        } catch {
            // Ignore malformed drag payloads
        }
    }

    const itemId = dataTransfer.getData('text/plain');
    if (!itemId) return null;

    return { itemId, fromTier: 'unknown' };
};

export const getTierDragPayload = (dataTransfer: DataTransfer | null): TierDragPayload | null => {
    if (!dataTransfer) return null;

    const raw = dataTransfer.getData(TIER_DRAG_MIME_TYPE);
    if (raw) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isTierDragPayload(parsed)) {
                return parsed;
            }
        } catch {
            // Ignore malformed drag payloads
        }
    }
    return null;
};
