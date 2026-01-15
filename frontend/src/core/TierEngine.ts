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

        // Global click to close tier menus
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.tier-label')) {
                document.querySelectorAll('.tier-menu').forEach(m => {
                    (m as HTMLElement).hidden = true;
                });
            }
        });
    }

    private renderHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'tierforge-header';

        header.innerHTML = `
      <div class="header-content">
        <div class="header-left">
          <div class="game-switcher">
            <button class="game-switcher-btn" id="gameSwitcherBtn">
              <span class="game-name">${this.game?.name || 'Select Game'}</span>
              <span class="game-switcher-arrow">▼</span>
            </button>
            <div class="game-switcher-dropdown" id="gameSwitcherDropdown" hidden></div>
          </div>
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

        // Setup game switcher
        this.setupGameSwitcher(header);

        // Setup action buttons
        this.setupActionButtons(header);

        return header;
    }

    private async setupGameSwitcher(header: HTMLElement): Promise<void> {
        const btn = header.querySelector('#gameSwitcherBtn')!;
        const dropdown = header.querySelector('#gameSwitcherDropdown')!;

        // Load all games
        const games = await api.getGames();

        games.forEach((game) => {
            const item = document.createElement('button');
            item.className = `game-switcher-item ${game.id === this.game?.id ? 'active' : ''}`;
            item.textContent = game.name;
            item.onclick = () => {
                window.location.href = `?game=${game.id}`;
            };
            dropdown.appendChild(item);
        });

        // Toggle dropdown
        btn.addEventListener('click', () => {
            const isOpen = !dropdown.hasAttribute('hidden');
            if (isOpen) {
                dropdown.setAttribute('hidden', '');
            } else {
                dropdown.removeAttribute('hidden');
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                dropdown.setAttribute('hidden', '');
            }
        });
    }

    private setupActionButtons(header: HTMLElement): void {
        // Undo
        header.querySelector('#undoBtn')?.addEventListener('click', () => {
            eventBus.emit({ type: 'UNDO' });
            this.render();
        });

        // Redo
        header.querySelector('#redoBtn')?.addEventListener('click', () => {
            eventBus.emit({ type: 'REDO' });
            this.render();
        });

        // Share
        header.querySelector('#shareBtn')?.addEventListener('click', async () => {
            if (this.tierList?.share_code) {
                const url = `${window.location.origin}?s=${this.tierList.share_code}`;
                await navigator.clipboard.writeText(url);
                alert('Link copied to clipboard!');
            }
        });
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

        // Create new tier list for this sheet
        this.tierList = await api.createTierList({
            game_id: this.game!.id,
            sheet_id: sheet.id,
            name: 'My Tier List',
        });
        eventBus.emit({ type: 'TIERLIST_LOADED', tierList: this.tierList });

        this.render();
    }

    private renderTierList(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tier-list';

        if (!this.tierList) return container;

        this.tierList.tiers.forEach((tier, index) => {
            const tierRow = this.renderTierRow(tier, index);
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

    private renderTierRow(tier: { id: string; name: string; color: string; order: number; items: string[] }, index: number): HTMLElement {
        const row = document.createElement('div');
        row.className = 'tier-row';
        row.dataset.tierId = tier.id;

        // Tier label with menu
        const label = document.createElement('div');
        label.className = 'tier-label';
        label.style.backgroundColor = tier.color;

        const tierName = document.createElement('span');
        tierName.className = 'tier-name';
        tierName.contentEditable = 'true';
        tierName.textContent = tier.name;
        tierName.addEventListener('blur', () => {
            const newName = tierName.textContent?.trim() || tier.name;
            if (newName !== tier.name) {
                this.renameTier(tier.id, newName);
            }
        });
        tierName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                tierName.blur();
            }
        });

        const menuBtn = document.createElement('button');
        menuBtn.className = 'tier-menu-btn';
        menuBtn.title = 'Tier options';
        menuBtn.textContent = '⋮';

        const menu = document.createElement('div');
        menu.className = 'tier-menu';
        menu.hidden = true;

        const isFirst = index === 0;
        const isLast = index === (this.tierList?.tiers.length || 1) - 1;

        menu.innerHTML = `
          <button class="tier-menu-item" data-action="moveUp" ${isFirst ? 'disabled' : ''}>↑ Move Up</button>
          <button class="tier-menu-item" data-action="moveDown" ${isLast ? 'disabled' : ''}>↓ Move Down</button>
          <button class="tier-menu-item tier-menu-item--danger" data-action="delete">🗑 Delete</button>
        `;

        menu.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const action = target.dataset.action;
            menu.hidden = true;

            if (action === 'moveUp') this.moveTier(tier.id, -1);
            if (action === 'moveDown') this.moveTier(tier.id, 1);
            if (action === 'delete') this.deleteTier(tier.id);
        });

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all other tier menus first
            document.querySelectorAll('.tier-menu').forEach(m => {
                if (m !== menu) m.hidden = true;
            });
            menu.hidden = !menu.hidden;
        });

        // Close menu on outside click (using capture phase)
        menu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        label.appendChild(tierName);
        label.appendChild(menuBtn);
        label.appendChild(menu);

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

    private renameTier(tierId: string, newName: string): void {
        if (!this.tierList) return;
        const tier = this.tierList.tiers.find(t => t.id === tierId);
        if (tier) {
            eventBus.emit({ type: 'TIER_UPDATED', tier: { ...tier, name: newName } });
        }
    }

    private moveTier(tierId: string, direction: number): void {
        if (!this.tierList) return;

        const index = this.tierList.tiers.findIndex(t => t.id === tierId);
        const newIndex = index + direction;

        if (newIndex < 0 || newIndex >= this.tierList.tiers.length) return;

        const tierIds = this.tierList.tiers.map(t => t.id);
        [tierIds[index], tierIds[newIndex]] = [tierIds[newIndex], tierIds[index]];

        eventBus.emit({ type: 'TIERS_REORDERED', tierIds });
        this.render();
    }

    private deleteTier(tierId: string): void {
        if (!this.tierList) return;
        eventBus.emit({ type: 'TIER_REMOVED', tierId });
        this.render();
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
