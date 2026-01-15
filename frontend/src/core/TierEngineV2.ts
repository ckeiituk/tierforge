import type { AppState, Game, Item, SheetConfig, Tier, TierList } from '@/types';
import { eventBus } from './EventBus';
import { stateManager } from './StateManager';
import * as api from '@/api/client';
import { Header, TierList as TierListComponent, Sidebar, Tooltip } from '@/components';

export interface TierEngineConfig {
    container: HTMLElement;
    gameId?: string;
    shareCode?: string;
}

interface ViewModel {
    game: Game | null;
    sheet: SheetConfig | null;
    tierList: TierList | null;
    items: Map<string, Item>;
    unrankedItems: string[];
    selectedItems: Set<string>;
    canUndo: boolean;
    canRedo: boolean;
}

const shallowEqual = (a: ViewModel, b: ViewModel): boolean => {
    const keysA = Object.keys(a) as Array<keyof ViewModel>;
    const keysB = Object.keys(b) as Array<keyof ViewModel>;

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => Object.is(a[key], b[key]));
};

/**
 * TierEngine v2 - Component-based architecture
 * Orchestrates components instead of rendering everything directly
 */
export class TierEngineV2 {
    private container: HTMLElement;
    private games: Game[] = [];
    private game: Game | null = null;
    private sheet: SheetConfig | null = null;

    private headerComponent: Header | null = null;
    private tierListComponent: TierListComponent | null = null;
    private sidebarComponent: Sidebar | null = null;
    private tooltipComponent: Tooltip | null = null;

    private eventUnsubscribes: Array<() => void> = [];
    private stateUnsubscribe: (() => void) | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private scrollHandler: (() => void) | null = null;

    private isLoading = true;
    private errorMessage: string | null = null;
    private layoutMounted = false;

    constructor(config: TierEngineConfig) {
        this.container = config.container;
        this.renderLoading();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.bindState();
        this.init(config);
    }

    private bindState(): void {
        if (this.stateUnsubscribe) return;

        this.stateUnsubscribe = stateManager.subscribe(
            (state: Readonly<AppState>): ViewModel => ({
                game: state.currentGame,
                sheet: state.currentSheet,
                tierList: state.tierList,
                items: state.items,
                unrankedItems: state.unrankedItems,
                selectedItems: state.selectedItems,
                canUndo: stateManager.canUndo(),
                canRedo: stateManager.canRedo(),
            }),
            (view) => this.renderFromState(view),
            { equals: shallowEqual }
        );
    }

    private async init(config: TierEngineConfig): Promise<void> {
        try {
            this.games = await api.getGames();

            if (config.shareCode) {
                const tierList = await api.getTierListByCode(config.shareCode);
                this.game = await api.getGame(tierList.game_id);
                this.sheet = this.game.sheets.find((s) => s.id === tierList.sheet_id) || this.game.sheets[0] || null;

                await this.emitInitialState(tierList);
            } else if (config.gameId) {
                this.game = await api.getGame(config.gameId);
                this.sheet = this.game.sheets[0] || null;

                const tierList = await this.createTierListForSheet();
                await this.emitInitialState(tierList);
            } else if (this.games.length > 0) {
                this.game = this.games[0];
                this.sheet = this.game.sheets[0] || null;

                const tierList = await this.createTierListForSheet();
                await this.emitInitialState(tierList);
            } else {
                this.isLoading = false;
                this.renderNoGames();
            }
        } catch (error) {
            console.error('Failed to initialize TierEngine:', error);
            this.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.isLoading = false;
            this.renderError(this.errorMessage);
        }
    }

    private async emitInitialState(tierList: TierList | null): Promise<void> {
        if (!this.game || !this.sheet) return;

        const items = await this.loadItems();

        eventBus.emit({ type: 'GAME_CHANGED', game: this.game });
        eventBus.emit({ type: 'SHEET_CHANGED', sheet: this.sheet });
        eventBus.emit({ type: 'ITEMS_LOADED', items });

        if (tierList) {
            eventBus.emit({ type: 'TIERLIST_LOADED', tierList });
        }

        this.isLoading = false;
        this.renderFromState(this.buildViewModel());
    }

    private async loadItems(): Promise<Item[]> {
        if (!this.game || !this.sheet) return [];

        const result = await api.getItems(this.game.id, this.sheet.id);
        return result.items || [];
    }

    private async createTierListForSheet(): Promise<TierList | null> {
        if (!this.game || !this.sheet) return null;

        return api.createTierList({
            game_id: this.game.id,
            sheet_id: this.sheet.id,
            name: 'My Tier List',
        });
    }

    private setupEventListeners(): void {
        this.eventUnsubscribes.push(
            eventBus.on('SHEET_CHANGE_REQUESTED', (event) => {
                void this.switchSheet(event.sheet);
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('TIER_ADD_REQUESTED', () => {
                this.addNewTier();
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('ITEM_HOVERED', (event) => {
                this.showTooltip(event.itemId, event.element);
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('ITEM_UNHOVERED', () => {
                this.hideTooltip();
            })
        );

        this.scrollHandler = () => this.hideTooltip();
        window.addEventListener('scroll', this.scrollHandler, true);
    }

    private setupKeyboardShortcuts(): void {
        this.keydownHandler = (e: KeyboardEvent) => {
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
        };

        document.addEventListener('keydown', this.keydownHandler);
    }

    private async switchSheet(sheet: SheetConfig): Promise<void> {
        if (!this.game) return;

        this.sheet = sheet;
        eventBus.emit({ type: 'SHEET_CHANGED', sheet });

        const items = await this.loadItems();
        eventBus.emit({ type: 'ITEMS_LOADED', items });

        const tierList = await this.createTierListForSheet();
        if (tierList) {
            eventBus.emit({ type: 'TIERLIST_LOADED', tierList });
        }
    }

    private addNewTier(): void {
        const state = stateManager.getState();
        const tierList = state.tierList;
        if (!tierList) return;

        const colors = ['#FF7F7F', '#FFBF7F', '#FFDF7F', '#FFFF7F', '#BFFF7F', '#7FFF7F'];
        const nextOrder = tierList.tiers.length;

        const tier: Tier = {
            id: `tier-${Date.now()}`,
            name: `Tier ${nextOrder + 1}`,
            color: colors[nextOrder % colors.length],
            order: nextOrder,
            items: [],
        };

        eventBus.emit({ type: 'TIER_ADDED', tier });
    }

    private renderFromState(view: ViewModel): void {
        if (this.errorMessage) {
            this.renderError(this.errorMessage);
            return;
        }

        if (this.isLoading) {
            this.renderLoading();
            return;
        }

        if (!view.game) {
            this.renderNoGames();
            return;
        }

        this.container.className = 'tierforge';
        this.container.classList.add(`theme-${view.game.id}`);

        if (!this.layoutMounted) {
            this.mountLayout(view);
            return;
        }

        this.updateComponents(view);
    }

    private mountLayout(view: ViewModel): void {
        this.resetLayout();
        this.container.innerHTML = '';

        const headerProps = this.getHeaderProps(view);
        this.headerComponent = new Header(headerProps);
        this.container.appendChild(this.headerComponent.render());

        const main = document.createElement('main');
        main.className = 'tierforge-main';
        this.container.appendChild(main);

        const tierListProps = this.getTierListProps(view);
        this.tierListComponent = new TierListComponent(tierListProps);
        main.appendChild(this.tierListComponent.render());

        const sidebarProps = this.getSidebarProps(view);
        this.sidebarComponent = new Sidebar(sidebarProps);
        this.container.appendChild(this.sidebarComponent.render());

        if (!this.tooltipComponent) {
            this.tooltipComponent = new Tooltip({
                item: null,
                anchorElement: null,
                gameId: null,
                isVisible: false,
            });
            document.body.appendChild(this.tooltipComponent.render());
        }

        this.layoutMounted = true;
    }

    private updateComponents(view: ViewModel): void {
        if (this.headerComponent) {
            this.headerComponent.updateProps(this.getHeaderProps(view));
        }

        if (this.tierListComponent) {
            this.tierListComponent.updateProps(this.getTierListProps(view));
        }

        if (this.sidebarComponent) {
            this.sidebarComponent.updateProps(this.getSidebarProps(view));
        }
    }

    private getHeaderProps(view: ViewModel): ConstructorParameters<typeof Header>[0] {
        return {
            game: view.game,
            games: this.games,
            currentSheet: view.sheet,
            canUndo: view.canUndo,
            canRedo: view.canRedo,
            shareCode: view.tierList?.share_code,
        };
    }

    private getTierListProps(view: ViewModel): ConstructorParameters<typeof TierListComponent>[0] {
        return {
            tierList: view.tierList,
            items: view.items,
            selectedItems: view.selectedItems,
        };
    }

    private getSidebarProps(view: ViewModel): ConstructorParameters<typeof Sidebar>[0] {
        return {
            items: this.getUnrankedItems(view),
            searchQuery: stateManager.getState().searchQuery,
            selectedItems: view.selectedItems,
        };
    }

    private getUnrankedItems(view: ViewModel): Item[] {
        const result: Item[] = [];
        view.unrankedItems.forEach((itemId) => {
            const item = view.items.get(itemId);
            if (item) result.push(item);
        });
        return result;
    }

    private showTooltip(itemId: string, anchorElement: HTMLElement): void {
        if (!this.tooltipComponent) return;

        const state = stateManager.getState();
        const item = state.items.get(itemId) || null;
        const gameId = state.currentGame?.id || null;

        if (!item || !gameId) return;

        this.tooltipComponent.updateProps({
            item,
            anchorElement,
            gameId,
            isVisible: true,
        });
    }

    private hideTooltip(): void {
        if (!this.tooltipComponent) return;

        this.tooltipComponent.updateProps({
            item: null,
            anchorElement: null,
            gameId: stateManager.getState().currentGame?.id || null,
            isVisible: false,
        });
    }

    private buildViewModel(): ViewModel {
        const state = stateManager.getState();
        return {
            game: state.currentGame,
            sheet: state.currentSheet,
            tierList: state.tierList,
            items: state.items,
            unrankedItems: state.unrankedItems,
            selectedItems: state.selectedItems,
            canUndo: stateManager.canUndo(),
            canRedo: stateManager.canRedo(),
        };
    }

    private resetLayout(): void {
        this.hideTooltip();
        this.headerComponent?.destroy();
        this.tierListComponent?.destroy();
        this.sidebarComponent?.destroy();

        this.headerComponent = null;
        this.tierListComponent = null;
        this.sidebarComponent = null;
        this.layoutMounted = false;
    }

    private renderLoading(): void {
        this.resetLayout();
        this.container.className = 'tierforge';
        this.container.innerHTML = '<div class="tierforge-loading"><div class="spinner"></div><p>Loading...</p></div>';
    }

    private renderNoGames(): void {
        this.resetLayout();
        this.container.className = 'tierforge';
        this.container.innerHTML = '<div class="tierforge-empty"><h2>No Games Available</h2><p>There are no games configured yet.</p></div>';
    }

    private renderError(message: string): void {
        this.resetLayout();
        this.container.className = 'tierforge';
        this.container.innerHTML = `<div class="tierforge-error"><h2>Error</h2><p>${message}</p></div>`;
    }

    destroy(): void {
        this.resetLayout();
        this.tooltipComponent?.destroy();
        this.tooltipComponent = null;

        this.eventUnsubscribes.forEach((unsubscribe) => unsubscribe());
        this.eventUnsubscribes = [];

        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }

        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }

        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler, true);
            this.scrollHandler = null;
        }
    }
}
