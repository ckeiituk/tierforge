import type { AppEvent } from '@/types';

type EventHandler = (event: AppEvent) => void;

/**
 * Simple event bus for decoupled component communication
 */
class EventBus {
    private handlers: Map<string, Set<EventHandler>> = new Map();
    private globalHandlers: Set<EventHandler> = new Set();

    /**
     * Subscribe to a specific event type
     */
    on(eventType: AppEvent['type'], handler: EventHandler): () => void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Set());
        }
        this.handlers.get(eventType)!.add(handler);

        // Return unsubscribe function
        return () => {
            this.handlers.get(eventType)?.delete(handler);
        };
    }

    /**
     * Subscribe to all events
     */
    onAll(handler: EventHandler): () => void {
        this.globalHandlers.add(handler);
        return () => {
            this.globalHandlers.delete(handler);
        };
    }

    /**
     * Emit an event
     */
    emit(event: AppEvent): void {
        // Notify specific handlers
        const handlers = this.handlers.get(event.type);
        if (handlers) {
            handlers.forEach((handler) => handler(event));
        }

        // Notify global handlers
        this.globalHandlers.forEach((handler) => handler(event));
    }

    /**
     * Clear all handlers
     */
    clear(): void {
        this.handlers.clear();
        this.globalHandlers.clear();
    }
}

// Singleton instance
export const eventBus = new EventBus();
