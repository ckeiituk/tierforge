/**
 * Tooltip Component - Renders item tooltips using game adapters
 */

import { Component, createElement } from './Component';
import { adapterRegistry } from '@/adapters/GameAdapter';
import type { Item } from '@/types';

export interface TooltipProps {
    item: Item | null;
    anchorElement: HTMLElement | null;
    gameId: string | null;
    isVisible: boolean;
}

export class Tooltip extends Component<Record<string, never>, TooltipProps> {
    constructor(props: TooltipProps) {
        super(props, {
            initialState: {},
            className: 'tooltip',
        });
    }

    render(): HTMLElement {
        const { item, anchorElement, gameId, isVisible } = this.props;

        const tooltip = createElement('div', {
            className: `tooltip ${isVisible ? 'tooltip--visible' : ''}`,
            id: 'tierforge-tooltip',
            role: 'tooltip',
            'aria-hidden': isVisible ? 'false' : 'true',
        });

        if (!isVisible || !item || !anchorElement || !gameId) {
            tooltip.style.display = 'none';
            this.element = tooltip;
            return tooltip;
        }

        tooltip.style.display = 'block';
        tooltip.style.position = 'fixed';
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        tooltip.style.visibility = 'hidden';

        const content = createElement('div', {
            className: 'tooltip__content',
        });

        const adapter = adapterRegistry.get(gameId);
        if (adapter) {
            content.appendChild(adapter.renderTooltip(item));
        } else {
            content.textContent = item.name;
        }

        tooltip.appendChild(content);
        this.element = tooltip;
        requestAnimationFrame(() => {
            if (!tooltip.isConnected) return;
            this.positionTooltip(tooltip, anchorElement);
            tooltip.style.visibility = 'visible';
        });
        return tooltip;
    }

    private positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        const offset = 12;
        const margin = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = rect.bottom + offset;
        if (top + tooltipRect.height + margin > viewportHeight) {
            top = rect.top - tooltipRect.height - offset;
        }
        top = Math.max(margin, Math.min(top, viewportHeight - tooltipRect.height - margin));

        let left = rect.left;
        if (left + tooltipRect.width + margin > viewportWidth) {
            left = rect.right - tooltipRect.width;
        }
        left = Math.max(margin, Math.min(left, viewportWidth - tooltipRect.width - margin));

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }
}
