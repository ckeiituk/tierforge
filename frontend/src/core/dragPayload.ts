export interface DragPayload {
    itemId: string;
    fromTier: string;
}

const DRAG_MIME_TYPE = 'application/x-tierforge-item';

const isDragPayload = (value: unknown): value is DragPayload => {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Record<string, unknown>;
    return typeof payload.itemId === 'string' && typeof payload.fromTier === 'string';
};

export const setDragPayload = (dataTransfer: DataTransfer, payload: DragPayload): void => {
    dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify(payload));
    dataTransfer.setData('text/plain', payload.itemId);
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
