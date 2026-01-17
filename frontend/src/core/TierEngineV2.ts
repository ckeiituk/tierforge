import type {
    AppState,
    AppEvent,
    FilterConfig,
    Game,
    Item,
    SheetConfig,
    Tier,
    TierList,
    TierListPreset,
    TierListPresetState,
} from '@/types';
import { eventBus } from './EventBus';
import { stateManager } from './StateManager';
import * as api from '@/api/client';
import { Header, TierList as TierListComponent, Sidebar, Tooltip } from '@/components';
import { autoSave } from './AutoSave';
import { createEmptyPresetState, loadPresetState, savePresetState } from './presetStorage';
import { extractTierLevel, matchesActiveFilters } from './itemFilters';

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
    presets: TierListPreset[];
    activePresetId: string | null;
    filters: Record<string, string[]>;
    searchQuery: string;
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
    private presetState: TierListPresetState = createEmptyPresetState();
    private isDragging = false;

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
                presets: this.presetState.presets,
                activePresetId: this.presetState.activeId,
                filters: state.filters,
                searchQuery: state.searchQuery,
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

                this.loadPresetStateForCurrentContext();
                this.updatePresetStateFromTierList(tierList, true);
                await this.emitInitialState(tierList);
            } else if (config.gameId) {
                this.game = await api.getGame(config.gameId);
                this.sheet = this.game.sheets[0] || null;

                const tierList = await this.loadPresetTierList();
                await this.emitInitialState(tierList);
            } else if (this.games.length > 0) {
                this.game = this.games[0];
                this.sheet = this.game.sheets[0] || null;

                const tierList = await this.loadPresetTierList();
                await this.emitInitialState(tierList);
            } else {
                this.isLoading = false;
                this.renderNoGames();
            }

            // Start autosave
            autoSave.start();
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

    private async createTierListForSheet(name?: string): Promise<TierList | null> {
        if (!this.game || !this.sheet) return null;

        return api.createTierList({
            game_id: this.game.id,
            sheet_id: this.sheet.id,
            name: name ?? 'My Tier List',
        });
    }

    private getPresetContext(): { gameId: string; sheetId: string } | null {
        if (!this.game || !this.sheet) return null;
        return { gameId: this.game.id, sheetId: this.sheet.id };
    }

    private loadPresetStateForCurrentContext(): void {
        const context = this.getPresetContext();
        if (!context) {
            this.presetState = createEmptyPresetState();
            return;
        }
        this.presetState = loadPresetState(context.gameId, context.sheetId);
    }

    private refreshPresetUi(): void {
        if (!this.layoutMounted) return;
        this.updateComponents(this.buildViewModel());
    }

    private updatePresetStateFromTierList(tierList: TierList, makeActive: boolean): void {
        const context = this.getPresetContext();
        if (!context) return;

        const presets = this.presetState.presets;
        const existingIndex = presets.findIndex((preset) => preset.id === tierList.id);
        let nextPresets = presets;

        if (existingIndex === -1) {
            nextPresets = [...presets, { id: tierList.id, name: tierList.name }];
        } else if (presets[existingIndex].name !== tierList.name) {
            nextPresets = presets.map((preset) =>
                preset.id === tierList.id ? { ...preset, name: tierList.name } : preset
            );
        }

        const nextState: TierListPresetState = {
            activeId: makeActive ? tierList.id : this.presetState.activeId,
            presets: nextPresets,
        };
        this.presetState = nextState;
        savePresetState(context.gameId, context.sheetId, nextState);
        this.refreshPresetUi();
    }

    private removePreset(presetId: string): void {
        const context = this.getPresetContext();
        if (!context) return;

        const presets = this.presetState.presets.filter((preset) => preset.id !== presetId);
        const activeId = this.presetState.activeId === presetId
            ? presets[0]?.id ?? null
            : this.presetState.activeId;

        const nextState: TierListPresetState = { activeId, presets };
        this.presetState = nextState;
        savePresetState(context.gameId, context.sheetId, nextState);
        this.refreshPresetUi();
    }

    private getPresetName(presetId: string): string {
        const preset = this.presetState.presets.find((entry) => entry.id === presetId);
        return preset?.name ?? 'this preset';
    }

    private getNextPresetName(): string {
        const used = new Set<number>();
        this.presetState.presets.forEach((preset) => {
            const match = /^Preset\s+(\d+)$/i.exec(preset.name);
            if (!match) return;
            const value = Number.parseInt(match[1], 10);
            if (Number.isFinite(value)) {
                used.add(value);
            }
        });

        let next = 1;
        while (used.has(next)) {
            next += 1;
        }
        return `Preset ${next}`;
    }

    private async tryLoadPresetById(presetId: string | null): Promise<TierList | null> {
        if (!presetId) return null;
        try {
            const tierList = await api.getTierList(presetId);
            if (!this.game || !this.sheet) return null;
            if (tierList.game_id !== this.game.id || tierList.sheet_id !== this.sheet.id) {
                this.removePreset(presetId);
                return null;
            }
            return tierList;
        } catch (error) {
            console.warn('Failed to load preset tier list', error);
            this.removePreset(presetId);
            return null;
        }
    }

    private async loadPresetTierList(): Promise<TierList | null> {
        this.loadPresetStateForCurrentContext();

        const preferredIds: string[] = [];
        if (this.presetState.activeId) {
            preferredIds.push(this.presetState.activeId);
        }
        this.presetState.presets.forEach((preset) => {
            if (preset.id !== this.presetState.activeId) {
                preferredIds.push(preset.id);
            }
        });

        for (const presetId of preferredIds) {
            const tierList = await this.tryLoadPresetById(presetId);
            if (tierList) {
                this.updatePresetStateFromTierList(tierList, true);
                return tierList;
            }
        }

        const created = await this.createTierListForSheet(this.getNextPresetName());
        if (!created) return null;

        this.updatePresetStateFromTierList(created, true);
        return created;
    }

    private async switchPreset(presetId: string): Promise<void> {
        const currentId = stateManager.getState().tierList?.id;
        if (currentId === presetId) return;

        const tierList = await this.tryLoadPresetById(presetId);
        if (!tierList) return;

        this.updatePresetStateFromTierList(tierList, true);
        eventBus.emit({ type: 'TIERLIST_LOADED', tierList });
    }

    private async createPreset(): Promise<void> {
        this.loadPresetStateForCurrentContext();

        const tierList = await this.createTierListForSheet(this.getNextPresetName());
        if (!tierList) return;

        this.updatePresetStateFromTierList(tierList, true);
        eventBus.emit({ type: 'TIERLIST_LOADED', tierList });
    }

    private async renamePreset(presetId: string, name: string): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) return;

        const preset = this.presetState.presets.find((entry) => entry.id === presetId);
        if (preset && preset.name === trimmed) return;

        try {
            const updated = await api.updateTierList(presetId, { name: trimmed });
            const makeActive = this.presetState.activeId === presetId;
            this.updatePresetStateFromTierList(updated, makeActive);
            eventBus.emit({ type: 'TIERLIST_RENAMED', tierListId: updated.id, name: updated.name });
        } catch (error) {
            console.error('Failed to rename preset', error);
        }
    }

    private async deletePreset(presetId: string): Promise<void> {
        const presetName = this.getPresetName(presetId);
        if (!window.confirm(`Delete preset "${presetName}"? This will permanently remove it.`)) {
            return;
        }

        const currentId = stateManager.getState().tierList?.id;
        const isActive = currentId === presetId;

        try {
            await api.deleteTierList(presetId);
        } catch (error) {
            console.error('Failed to delete preset', error);
            return;
        }

        const remaining = this.presetState.presets.filter((preset) => preset.id !== presetId);
        const nextPresetId = isActive ? remaining[0]?.id ?? null : null;
        this.removePreset(presetId);

        if (!isActive) {
            return;
        }

        if (nextPresetId) {
            const tierList = await this.tryLoadPresetById(nextPresetId);
            if (tierList) {
                this.updatePresetStateFromTierList(tierList, true);
                eventBus.emit({ type: 'TIERLIST_LOADED', tierList });
                return;
            }
        }

        const created = await this.createTierListForSheet(this.getNextPresetName());
        if (!created) return;

        this.updatePresetStateFromTierList(created, true);
        eventBus.emit({ type: 'TIERLIST_LOADED', tierList: created });
    }

    private setupEventListeners(): void {
        this.eventUnsubscribes.push(
            eventBus.on('SHEET_CHANGE_REQUESTED', (event) => {
                void this.switchSheet(event.sheet);
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('PRESET_SWITCH_REQUESTED', (event) => {
                void this.switchPreset(event.presetId);
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('PRESET_CREATE_REQUESTED', () => {
                void this.createPreset();
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('PRESET_DELETE_REQUESTED', (event) => {
                void this.deletePreset(event.presetId);
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('PRESET_RENAME_REQUESTED', (event) => {
                void this.renamePreset(event.presetId, event.name);
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

        this.eventUnsubscribes.push(
            eventBus.on('DRAG_START', (event: Extract<AppEvent, { type: 'DRAG_START' }>) => {
                void event;
                this.isDragging = true;
                this.hideTooltip();
            })
        );

        this.eventUnsubscribes.push(
            eventBus.on('DRAG_END', (event: Extract<AppEvent, { type: 'DRAG_END' }>) => {
                this.isDragging = false;
                this.maybeShowTooltipAtPoint(event.clientX, event.clientY);
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

        const tierList = await this.loadPresetTierList();
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

        const availableFilters = this.getAvailableFilters(view);
        const headerProps = this.getHeaderProps(view, availableFilters);
        this.headerComponent = new Header(headerProps);
        this.container.appendChild(this.headerComponent.render());

        const main = document.createElement('main');
        main.className = 'tierforge-main';
        this.container.appendChild(main);

        const tierListProps = this.getTierListProps(view, availableFilters);
        this.tierListComponent = new TierListComponent(tierListProps);
        main.appendChild(this.tierListComponent.render());

        const sidebarProps = this.getSidebarProps(view, availableFilters);
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

        this.scheduleHeaderHeightSync();
        this.layoutMounted = true;
    }

    private updateComponents(view: ViewModel): void {
        const availableFilters = this.getAvailableFilters(view);
        if (this.headerComponent) {
            this.headerComponent.updateProps(this.getHeaderProps(view, availableFilters));
        }

        if (this.tierListComponent) {
            this.tierListComponent.updateProps(this.getTierListProps(view, availableFilters));
        }

        if (this.sidebarComponent) {
            this.sidebarComponent.updateProps(this.getSidebarProps(view, availableFilters));
        }
        this.scheduleHeaderHeightSync();
    }

    private getHeaderProps(
        view: ViewModel,
        availableFilters: FilterConfig[]
    ): ConstructorParameters<typeof Header>[0] {
        return {
            game: view.game,
            games: this.games,
            currentSheet: view.sheet,
            canUndo: view.canUndo,
            canRedo: view.canRedo,
            shareCode: view.tierList?.share_code,
            presets: view.presets,
            activePresetId: view.activePresetId,
            activeFilters: view.filters,
            filters: availableFilters,
        };
    }

    private getTierListProps(
        view: ViewModel,
        availableFilters: FilterConfig[]
    ): ConstructorParameters<typeof TierListComponent>[0] {
        return {
            tierList: view.tierList,
            items: view.items,
            selectedItems: view.selectedItems,
            searchQuery: view.searchQuery,
            filters: availableFilters,
            activeFilters: view.filters,
        };
    }

    private getSidebarProps(
        view: ViewModel,
        availableFilters: FilterConfig[]
    ): ConstructorParameters<typeof Sidebar>[0] {
        return {
            items: this.getUnrankedItems(view, availableFilters),
            searchQuery: stateManager.getState().searchQuery,
            selectedItems: view.selectedItems,
            isOpen: true,
        };
    }

    private getAvailableFilters(view: ViewModel): FilterConfig[] {
        const baseFilters = view.game?.filters ?? [];
        if (baseFilters.length === 0) return [];

        const items = Array.from(view.items.values());
        const hasItems = items.length > 0;
        const suppressedFilterIds = new Set<string>(['ap']);
        const gameId = view.game?.id;
        const sheetId = view.sheet?.id;

        if (gameId === 'dos2' && sheetId && sheetId !== 'skills') {
            suppressedFilterIds.add('school');
        }

        const available = baseFilters.filter((filter: FilterConfig) => {
            if (suppressedFilterIds.has(filter.id)) return false;
            if (!hasItems) return true;
            return this.hasFilterData(filter, items);
        });

        const hasLevelFilter = available.some((filter: FilterConfig) => filter.id === 'level');
        if (!hasLevelFilter) {
            const levelValues =
                gameId === 'dos2' && sheetId === 'skills'
                    ? this.collectTierLevelValues(items)
                    : this.collectFilterValues(items, 'level');
            if (levelValues.length > 0) {
                available.push({
                    id: 'level',
                    name: 'Spell Level',
                    field: gameId === 'dos2' && sheetId === 'skills' ? 'tier' : 'level',
                    type: 'multiselect',
                    options: this.sortLevelOptions(levelValues),
                });
            }
        }

        return available;
    }

    private hasFilterData(filter: FilterConfig, items: Item[]): boolean {
        const values = this.collectFilterValues(items, filter.field);
        if (values.length === 0) return false;
        if (filter.type === 'toggle') {
            return values.includes('true');
        }
        return true;
    }

    private collectFilterValues(items: Item[], field: string): string[] {
        const result = new Set<string>();
        items.forEach((item: Item) => {
            const values = this.normalizeFilterValue(item.data[field]);
            values.forEach((value: string) => result.add(value));
        });
        return Array.from(result);
    }

    private collectTierLevelValues(items: Item[]): string[] {
        const result = new Set<string>();
        items.forEach((item: Item) => {
            const values = this.normalizeFilterValue(item.data.tier);
            values.forEach((value: string) => {
                const level = extractTierLevel(value);
                if (level) result.add(level);
            });
        });
        return Array.from(result);
    }

    private normalizeFilterValue(value: unknown): string[] {
        if (typeof value === 'string') return [value];
        if (typeof value === 'number') return [String(value)];
        if (typeof value === 'boolean') return [value ? 'true' : 'false'];
        if (Array.isArray(value)) {
            return value.filter((entry): entry is string => typeof entry === 'string');
        }
        return [];
    }

    private sortLevelOptions(options: string[]): string[] {
        return options
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                const aIsCantrip = aLower === 'cantrip';
                const bIsCantrip = bLower === 'cantrip';
                if (aIsCantrip && !bIsCantrip) return -1;
                if (bIsCantrip && !aIsCantrip) return 1;

                const aNum = Number.parseFloat(a);
                const bNum = Number.parseFloat(b);
                const aIsNumber = Number.isFinite(aNum);
                const bIsNumber = Number.isFinite(bNum);
                if (aIsNumber && bIsNumber) return aNum - bNum;
                if (aIsNumber) return -1;
                if (bIsNumber) return 1;
                return a.localeCompare(b);
            });
    }

    private getUnrankedItems(view: ViewModel, availableFilters: FilterConfig[]): Item[] {
        const result: Item[] = [];
        view.unrankedItems.forEach((itemId) => {
            const item = view.items.get(itemId);
            if (!item) return;
            if (!matchesActiveFilters(item, availableFilters, view.filters)) return;
            result.push(item);
        });
        return result;
    }

    private maybeShowTooltipAtPoint(clientX: number, clientY: number): void {
        if (!this.tooltipComponent) return;
        if (clientX === 0 && clientY === 0) return;

        const element = document.elementFromPoint(clientX, clientY);
        if (!(element instanceof HTMLElement)) return;

        const card = element.closest<HTMLElement>('.item-card');
        if (!card) return;

        const itemId = card.dataset.itemId;
        if (!itemId) return;

        this.showTooltip(itemId, card);
    }

    private showTooltip(itemId: string, anchorElement: HTMLElement): void {
        if (!this.tooltipComponent) return;
        if (this.isDragging || document.body.classList.contains('is-dragging')) {
            this.hideTooltip();
            return;
        }

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
            presets: this.presetState.presets,
            activePresetId: this.presetState.activeId,
            filters: state.filters,
            searchQuery: state.searchQuery,
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
        this.container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'tierforge-loading';
        wrapper.setAttribute('role', 'status');
        wrapper.setAttribute('aria-live', 'polite');
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const text = document.createElement('p');
        text.textContent = 'Loading...';
        wrapper.appendChild(spinner);
        wrapper.appendChild(text);
        this.container.appendChild(wrapper);
    }

    private renderNoGames(): void {
        this.resetLayout();
        this.container.className = 'tierforge';
        this.container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'tierforge-empty';
        const title = document.createElement('h2');
        title.textContent = 'No Games Available';
        const text = document.createElement('p');
        text.textContent = 'There are no games configured yet.';
        wrapper.appendChild(title);
        wrapper.appendChild(text);
        this.container.appendChild(wrapper);
    }

    private renderError(message: string): void {
        this.resetLayout();
        this.container.className = 'tierforge';
        this.container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'tierforge-error';
        const title = document.createElement('h2');
        title.textContent = 'Error';
        const text = document.createElement('p');
        text.textContent = message;
        wrapper.appendChild(title);
        wrapper.appendChild(text);
        this.container.appendChild(wrapper);
    }

    destroy(): void {
        this.resetLayout();
        this.tooltipComponent?.destroy();
        this.tooltipComponent = null;

        this.eventUnsubscribes.forEach((unsubscribe) => unsubscribe());
        this.eventUnsubscribes = [];

        autoSave.stop();

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

    private scheduleHeaderHeightSync(): void {
        requestAnimationFrame(() => {
            const header = this.container.querySelector<HTMLElement>('.header');
            if (!header) return;
            const height = Math.ceil(header.getBoundingClientRect().height);
            if (!Number.isFinite(height) || height <= 0) return;
            this.container.style.setProperty('--header-height', `${height}px`);
        });
    }
}
