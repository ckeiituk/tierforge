/**
 * Base Component class for all UI components
 * Provides lifecycle methods and state management integration
 */

import { eventBus } from '@/core/EventBus';
import type { AppEvent } from '@/core/EventBus';

export interface ComponentOptions<T = Record<string, never>> {
    initialState: T;
    className?: string;
}

export abstract class Component<TState = Record<string, never>, TProps = unknown> {
    protected element: HTMLElement;
    protected state: TState;
    protected props: TProps;
    private eventSubscriptions: Array<() => void> = [];

    constructor(props: TProps, options: ComponentOptions<TState>) {
        this.props = props;
        this.state = options.initialState;
        this.element = document.createElement('div');

        if (options.className) {
            this.element.className = options.className;
        }
    }

    /**
     * Render the component and return its DOM element
     * Must be implemented by subclasses
     */
    abstract render(): HTMLElement;

    /**
     * Update component state and trigger re-render
     */
    protected setState(newState: Partial<TState>): void {
        this.state = { ...this.state, ...newState };
        this.rerender();
    }

    /**
     * Update props and trigger re-render
     */
    updateProps(newProps: Partial<TProps>): void {
        this.props = { ...this.props, ...newProps };
        this.rerender();
    }

    /**
     * Re-render the component in place
     */
    protected rerender(): void {
        const parent = this.element.parentNode;

        // Clean up old element
        this.cleanup();

        // Render new element
        const newElement = this.render();

        // Replace in DOM if mounted
        if (parent) {
            parent.replaceChild(newElement, this.element);
        }

        this.element = newElement;
    }

    /**
     * Subscribe to EventBus events
     * Subscriptions are automatically cleaned up on destroy
     */
    protected on<K extends AppEvent['type']>(
        type: K,
        handler: (event: Extract<AppEvent, { type: K }>) => void
    ): void {
        const unsubscribe = eventBus.on(type, handler);
        this.eventSubscriptions.push(unsubscribe);
    }

    /**
     * Emit an event through the EventBus
     */
    protected emit(event: AppEvent): void {
        eventBus.emit(event);
    }

    /**
     * Mount component to a container
     */
    mount(container: HTMLElement): void {
        const newElement = this.render();
        this.element = newElement;
        container.appendChild(newElement);
    }

    /**
     * Cleanup before component is destroyed
     * Override in subclasses for custom cleanup
     */
    protected cleanup(): void {
        // Override in subclasses if needed
    }

    /**
     * Destroy the component
     */
    destroy(): void {
        // Unsubscribe from all events
        this.eventSubscriptions.forEach(unsub => unsub());
        this.eventSubscriptions = [];

        // Custom cleanup
        this.cleanup();

        // Remove from DOM
        this.element.remove();
    }

    /**
     * Get the DOM element
     */
    getElement(): HTMLElement {
        return this.element;
    }
}

/**
 * Simple functional component for static content
 */
export function createElement(
    tag: string,
    attrs: Record<string, string> = {},
    children: (string | HTMLElement)[] = []
): HTMLElement {
    const el = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            el.className = value;
        } else {
            el.setAttribute(key, value);
        }
    });

    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else {
            el.appendChild(child);
        }
    });

    return el;
}
