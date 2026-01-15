import type { Game, Item, TierList, SheetConfig } from '@/types';
import { eventBus } from './EventBus';
import { stateManager } from './StateManager';
import { dragDropManager } from './DragDrop';
import * as api from '@/api/client';

export interface TierEngineConfig {
    container: HTMLElement;
    gameId?: string;
    shareCode?: string;
}

/**
 * Main tier list engine - orchestrates all components
 */
export class TierEngine {
    private container: HTMLElement;
    private game: Game | null = null;
    private sheet: SheetConfig | null = null;
    private items: Map<string, Item> = new Map();
    private tierList: TierList | null = null;

    constructor(config: TierEngineConfig) {
        this.container = config.container;
        this.setupKeyboardShortcuts();
        this.init(config);
    }

    private async init(config: TierEngineConfig): Promise<void> {
        this.renderLoading();

        try {
            if (config.shareCode) {
                // Load from share code
                this.tierList = await api.getTierListByCode(config.shareCode);
                this.game = await api.getGame(this.tierList.game_id);
                this.sheet = this.game.sheets.find((s) => s.id === this.tierList!.sheet_id) || null;
            } else if (config.gameId) {
                // Load game
                this.game = await api.getGame(config.gameId);
                this.sheet = this.game.sheets[0] || null;
            } else {
                // Load first available game
                const games = await api.getGames();
                if (games.length > 0) {
                    this.game = games[0];
                    this.sheet = this.game.sheets[0] || null;
                }
            }

            if (this.game) {
                await this.loadItems();
                eventBus.emit({ type: 'GAME_CHANGED', game: this.game });

                if (this.sheet) {
                    eventBus.emit({ type: 'SHEET_CHANGED', sheet: this.sheet });
                }

                if (this.tierList) {
                    eventBus.emit({ type: 'TIERLIST_LOADED', tierList: this.tierList });
                } else {
                    // Create new tier list
                    this.tierList = await api.createTierList({
                        game_id: this.game.id,
                        sheet_id: this.sheet?.id || 'default',
                        name: 'My Tier List',
                    });
                    eventBus.emit({ type: 'TIERLIST_LOADED', tierList: this.tierList });
                }

                this.render();
            } else {
                this.renderNoGames();
            }
        } catch (error) {
            console.error('Failed to initialize TierEngine:', error);
            this.renderError(error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private async loadItems(): Promise<void> {
        if (!this.game) return;

        const result = await api.getItems(this.game.id, this.sheet?.id);
        this.items.clear();

        const items = result.items || [];
        items.forEach((item) => {
            this.items.set(item.id, item);
        });

        eventBus.emit({ type: 'ITEMS_LOADED', items });
    }

    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                eventBus.emit({ type: 'UNDO' });
            }

            // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                eventBus.emit({ type: 'REDO' });
            }

            // Ctrl/Cmd + S = Save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                eventBus.emit({ type: 'SAVE_REQUESTED' });
            }

            // 1-9 = Quick tier assign
            if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
                const state = stateManager.getState();
                if (state.selectedItems.size > 0 && state.tierList) {
                    const tierIndex = parseInt(e.key) - 1;
                    const tier = state.tierList.tiers[tierIndex];
                    if (tier) {
                        state.selectedItems.forEach((itemId) => {
                            eventBus.emit({
                                type: 'ITEM_MOVED',
                                itemId,
                                fromTier: 'unranked',
                                toTier: tier.id,
                                position: tier.items.length,
                            });
                        });
                    }
                }
            }

            // Escape = Clear selection
            if (e.key === 'Escape') {
                eventBus.emit({ type: 'SELECTION_CHANGED', itemIds: new Set() });
            }
        });
    }

    private render(): void {
        this.container.innerHTML = '';
        this.container.className = 'tierforge';

        // Add game theme class
        if (this.game) {
            this.container.classList.add(`theme-${this.game.id}`);
        }

        // Header
        const header = this.renderHeader();
        this.container.appendChild(header);

        // Main content
        const main = document.createElement('main');
        main.className = 'tierforge-main';

        // Tier list
        const tierListEl = this.renderTierList();
        main.appendChild(tierListEl);

        this.container.appendChild(main);

        // Sidebar (unranked)
        const sidebar = this.renderSidebar();
        this.container.appendChild(sidebar);
    }

    private renderHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'tierforge-header';

        header.innerHTML = `
      <div class="header-content">
        <div class="header-left">
          <h1 class="header-title">${this.game?.name || 'TierForge'}</h1>
          <div class="sheet-tabs" id="sheetTabs"></div>
        </div>
        <div class="header-right">
          <div class="header-actions">
            <button class="btn btn-ghost" id="undoBtn" title="Undo (Ctrl+Z)">↶</button>
            <button class="btn btn-ghost" id="redoBtn" title="Redo (Ctrl+Y)">↷</button>
            <button class="btn btn-primary" id="shareBtn">Share</button>
          </div>
        </div>
      </div>
    `;

        // Render sheet tabs
        this.renderSheetTabs(header.querySelector('#sheetTabs')!);

        return header;
    }

    private renderSheetTabs(container: HTMLElement): void {
        if (!this.game?.sheets.length) return;

        this.game.sheets.forEach((sheet) => {
            const tab = document.createElement('button');
            tab.className = `sheet-tab ${sheet.id === this.sheet?.id ? 'active' : ''}`;
            tab.textContent = sheet.name;
            tab.onclick = () => this.switchSheet(sheet);
            container.appendChild(tab);
        });
    }

    private async switchSheet(sheet: SheetConfig): Promise<void> {
        this.sheet = sheet;
        eventBus.emit({ type: 'SHEET_CHANGED', sheet });
        await this.loadItems();
        this.render();
    }

    private renderTierList(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tier-list';

        if (!this.tierList) return container;

        this.tierList.tiers.forEach((tier) => {
            const tierRow = this.renderTierRow(tier);
            container.appendChild(tierRow);
        });

        // Add tier button
        const addTierBtn = document.createElement('button');
        addTierBtn.className = 'add-tier-btn';
        addTierBtn.innerHTML = '+ Add Tier';
        addTierBtn.onclick = () => this.addNewTier();
        container.appendChild(addTierBtn);

        return container;
    }

    private renderTierRow(tier: { id: string; name: string; color: string; items: string[] }): HTMLElement {
        const row = document.createElement('div');
        row.className = 'tier-row';
        row.dataset.tierId = tier.id;

        // Tier label
        const label = document.createElement('div');
        label.className = 'tier-label';
        label.style.backgroundColor = tier.color;
        label.innerHTML = `
      <span class="tier-name" contenteditable="true">${tier.name}</span>
      <button class="tier-menu-btn" title="Tier options">⋮</button>
    `;

        // Tier items container
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'tier-items';

        // Register as drop zone
        dragDropManager.registerDropZone(tier.id, itemsContainer);

        // Render items
        tier.items.forEach((itemId) => {
            const item = this.items.get(itemId);
            if (item) {
                const itemEl = this.renderItemCard(item, tier.id);
                itemsContainer.appendChild(itemEl);
            }
        });

        row.appendChild(label);
        row.appendChild(itemsContainer);

        return row;
    }

    private renderItemCard(item: Item, containerId: string): HTMLElement {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;

        card.innerHTML = `
      <img src="${item.icon}" alt="${item.name}" class="item-icon" loading="lazy" />
      <span class="item-name">${item.name}</span>
    `;

        // Register as draggable
        dragDropManager.registerDraggable(item.id, card, containerId);

        // Tooltip on hover
        card.addEventListener('mouseenter', (e) => this.showTooltip(item, e));
        card.addEventListener('mouseleave', () => this.hideTooltip());

        return card;
    }

    private renderSidebar(): HTMLElement {
        const sidebar = document.createElement('aside');
        sidebar.className = 'tierforge-sidebar';

        const state = stateManager.getState();

        sidebar.innerHTML = `
      <div class="sidebar-header">
        <h2>Unranked</h2>
        <span class="sidebar-count">${state.unrankedItems.length}</span>
      </div>
      <div class="sidebar-search">
        <input type="search" placeholder="Search..." id="sidebarSearch" />
      </div>
      <div class="sidebar-items" id="unrankedList"></div>
    `;

        const unrankedList = sidebar.querySelector('#unrankedList')!;

        // Register as drop zone
        dragDropManager.registerDropZone('unranked', unrankedList as HTMLElement);

        // Render unranked items
        state.unrankedItems.forEach((itemId) => {
            const item = this.items.get(itemId);
            if (item) {
                const itemEl = this.renderItemCard(item, 'unranked');
                unrankedList.appendChild(itemEl);
            }
        });

        return sidebar;
    }

    private addNewTier(): void {
        if (!this.tierList) return;

        const colors = ['#ff7f7f', '#ffbf7f', '#ffff7f', '#7fff7f', '#7fbfff', '#ff7fff'];
        const nextOrder = this.tierList.tiers.length;
        const color = colors[nextOrder % colors.length];

        const tier = {
            id: `tier-${Date.now()}`,
            name: `Tier ${nextOrder + 1}`,
            color,
            order: nextOrder,
            items: [],
        };

        eventBus.emit({ type: 'TIER_ADDED', tier });
        this.render();
    }

    private showTooltip(item: Item, e: MouseEvent): void {
        // TODO: Implement tooltip rendering based on game adapter
    }

    private hideTooltip(): void {
        // TODO: Hide tooltip
    }

    // --- Render states ---

    private renderLoading(): void {
        this.container.innerHTML = `
      <div class="tierforge-loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
    }

    private renderError(message: string): void {
        this.container.innerHTML = `
      <div class="tierforge-error">
        <h2>Error</h2>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
    }

    private renderNoGames(): void {
        this.container.innerHTML = `
      <div class="tierforge-empty">
        <h2>No Games Available</h2>
        <p>There are no games configured yet.</p>
      </div>
    `;
    }
}

// Export for use
export { TierEngine as default };
