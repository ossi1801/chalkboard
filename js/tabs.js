(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const WORKBOOK_STORAGE_KEY = 'chalkboard_workbook_v2';
  const LEGACY_STORAGE_KEY = 'chalkboard_saved_state_v1';

  const TabManager = {
    canvas: null,
    tabs: [],
    activeTabId: null,
    contextMenuTabId: null,
    isSwitching: false,

    init(canvas) {
      this.canvas = canvas;
      this.bindUI();
    },

    generateId() {
      return 'sheet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    },

    getEmptyCanvasJSON() {
      return JSON.stringify({
        version: fabric.version || '5.3.0',
        objects: [],
      });
    },

    createTabObject(name, canvasJSON, viewportTransform) {
      const initialJSON = canvasJSON || this.getEmptyCanvasJSON();
      return {
        id: this.generateId(),
        name: name || `Sheet ${this.tabs.length + 1}`,
        canvasJSON: initialJSON,
        undoStack: [initialJSON],
        redoStack: [],
        viewportTransform: viewportTransform ? viewportTransform.slice() : [1, 0, 0, 1, 0, 0],
      };
    },

    getActiveTab() {
      return this.tabs.find((t) => t.id === this.activeTabId) || this.tabs[0] || null;
    },

    syncCurrentTabFromCanvas(snapshotStr) {
      if (this.isSwitching) return;
      const active = this.getActiveTab();
      if (!active || !this.canvas) return;

      const serialized = snapshotStr || window.Chalkboard.HistoryManager.serializeCanvasOnly();
      active.canvasJSON = serialized;
      active.undoStack = window.Chalkboard.HistoryManager.undoStack.slice();
      active.redoStack = window.Chalkboard.HistoryManager.redoStack.slice();
      if (this.canvas.viewportTransform) {
        active.viewportTransform = this.canvas.viewportTransform.slice();
      }
    },

    addTab(customName, switchImmediately = true) {
      this.syncCurrentTabFromCanvas();

      // Find next available Sheet N name
      let sheetNum = this.tabs.length + 1;
      const existingNames = new Set(this.tabs.map((t) => t.name.toLowerCase()));
      while (existingNames.has(`sheet ${sheetNum}`)) {
        sheetNum++;
      }

      const name = customName || `Sheet ${sheetNum}`;
      const newTab = this.createTabObject(name);
      this.tabs.push(newTab);

      if (switchImmediately) {
        this.switchToTab(newTab.id);
      } else {
        this.renderTabs();
        this.saveWorkbookToStorage();
      }

      if (window.Chalkboard.App) {
        window.Chalkboard.App.showToast(`Added ${newTab.name}`);
      }
      return newTab;
    },

    duplicateTab(tabId) {
      const source = this.tabs.find((t) => t.id === (tabId || this.activeTabId));
      if (!source) return;

      this.syncCurrentTabFromCanvas();

      const copyName = `${source.name} (Copy)`;
      const copyTab = this.createTabObject(
        copyName,
        source.canvasJSON,
        source.viewportTransform
      );

      const idx = this.tabs.findIndex((t) => t.id === source.id);
      this.tabs.splice(idx + 1, 0, copyTab);
      this.switchToTab(copyTab.id);

      if (window.Chalkboard.App) {
        window.Chalkboard.App.showToast(`Duplicated as ${copyName}`);
      }
    },

    deleteTab(tabId) {
      const targetId = tabId || this.activeTabId;
      if (this.tabs.length <= 1) {
        if (window.Chalkboard.App) {
          window.Chalkboard.App.showToast('Cannot delete the only sheet');
        }
        return;
      }

      const idx = this.tabs.findIndex((t) => t.id === targetId);
      if (idx === -1) return;

      const removed = this.tabs[idx];
      this.tabs.splice(idx, 1);

      if (this.activeTabId === targetId) {
        const nextTab = this.tabs[Math.max(0, idx - 1)] || this.tabs[0];
        this.activeTabId = null; // Prevent overwriting with deleted tab
        this.switchToTab(nextTab.id);
      } else {
        this.renderTabs();
        this.saveWorkbookToStorage();
      }

      if (window.Chalkboard.App) {
        window.Chalkboard.App.showToast(`Deleted ${removed.name}`);
      }
    },

    moveTab(tabId, direction) {
      const idx = this.tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= this.tabs.length) return;

      const [item] = this.tabs.splice(idx, 1);
      this.tabs.splice(newIdx, 0, item);
      this.renderTabs();
      this.saveWorkbookToStorage();
    },

    renameTab(tabId, newName) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const trimmed = (newName || '').trim();
      if (trimmed) {
        tab.name = trimmed.slice(0, 40);
      }
      this.renderTabs();
      this.saveWorkbookToStorage();
    },

    switchToTab(tabId, callback) {
      const target = this.tabs.find((t) => t.id === tabId);
      if (!target) return;

      if (this.activeTabId && this.activeTabId !== tabId) {
        this.syncCurrentTabFromCanvas();
      }

      this.isSwitching = true;
      this.activeTabId = target.id;
      this.renderTabs();

      const hm = window.Chalkboard.HistoryManager;
      hm.undoStack =
        Array.isArray(target.undoStack) && target.undoStack.length > 0
          ? target.undoStack.slice()
          : [target.canvasJSON];
      hm.redoStack = Array.isArray(target.redoStack) ? target.redoStack.slice() : [];

      hm.restoreSnapshot(target.canvasJSON, () => {
        const vpt =
          Array.isArray(target.viewportTransform) && target.viewportTransform.length === 6
            ? target.viewportTransform.slice()
            : [1, 0, 0, 1, 0, 0];
        this.canvas.setViewportTransform(vpt);
        window.Chalkboard.CanvasManager.updateZoomUI();
        this.canvas.requestRenderAll();

        this.isSwitching = false;
        hm.updateButtons();
        this.saveWorkbookToStorage();
        if (callback) callback();
      });
    },

    startInlineRename(tabId) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      const tabEl = document.querySelector(`.sheet-tab[data-tab-id="${tabId}"]`);
      if (!tabEl) return;

      const labelEl = tabEl.querySelector('.sheet-tab-label');
      if (!labelEl) return;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'sheet-tab-rename-input';
      input.value = tab.name;
      input.maxLength = 40;

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        this.renameTab(tabId, input.value);
      };

      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          committed = true;
          this.renderTabs();
        }
      });

      input.addEventListener('blur', commit);
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('dblclick', (e) => e.stopPropagation());

      labelEl.replaceWith(input);
      input.focus();
      input.select();
    },

    renderTabs() {
      const listEl = document.getElementById('sheet-tabs-list');
      if (!listEl) return;

      listEl.innerHTML = '';

      this.tabs.forEach((tab) => {
        const isActive = tab.id === this.activeTabId;
        const tabBtn = document.createElement('div');
        tabBtn.className = 'sheet-tab' + (isActive ? ' active' : '');
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tabBtn.setAttribute('data-tab-id', tab.id);
        tabBtn.title = `${tab.name} (Double-click to rename, Right-click for options)`;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'sheet-tab-label';
        labelSpan.textContent = tab.name;
        tabBtn.appendChild(labelSpan);

        const menuTrigger = document.createElement('button');
        menuTrigger.type = 'button';
        menuTrigger.className = 'sheet-tab-menu-btn';
        menuTrigger.setAttribute('aria-label', `Sheet options for ${tab.name}`);
        menuTrigger.title = 'Sheet options';
        menuTrigger.innerHTML =
          '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        menuTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openContextMenu(tab.id, menuTrigger.getBoundingClientRect());
        });
        tabBtn.appendChild(menuTrigger);

        tabBtn.addEventListener('click', () => {
          if (this.activeTabId !== tab.id) {
            this.switchToTab(tab.id);
          }
        });

        tabBtn.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.startInlineRename(tab.id);
        });

        tabBtn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openContextMenu(tab.id, {
            left: e.clientX,
            top: e.clientY,
            bottom: e.clientY,
            width: 0,
          });
        });

        listEl.appendChild(tabBtn);
      });

      // Ensure active tab is scrolled into view
      const activeEl = listEl.querySelector('.sheet-tab.active');
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },

    openContextMenu(tabId, anchorRect) {
      const menu = document.getElementById('tab-context-menu');
      if (!menu) return;

      this.contextMenuTabId = tabId;
      const idx = this.tabs.findIndex((t) => t.id === tabId);

      const deleteBtn = document.getElementById('tab-ctx-delete');
      const leftBtn = document.getElementById('tab-ctx-move-left');
      const rightBtn = document.getElementById('tab-ctx-move-right');

      if (deleteBtn) deleteBtn.disabled = this.tabs.length <= 1;
      if (leftBtn) leftBtn.disabled = idx <= 0;
      if (rightBtn) rightBtn.disabled = idx === -1 || idx >= this.tabs.length - 1;

      menu.classList.remove('hidden');

      const menuW = 168;
      const left = Math.min(
        Math.max(8, anchorRect.left),
        window.innerWidth - menuW - 8
      );
      menu.style.left = `${left}px`;
      menu.style.bottom = `${Math.max(54, window.innerHeight - anchorRect.top + 6)}px`;
    },

    closeContextMenu() {
      const menu = document.getElementById('tab-context-menu');
      if (menu) menu.classList.add('hidden');
      this.contextMenuTabId = null;
    },

    bindUI() {
      const addBtn = document.getElementById('btn-add-tab');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          this.closeContextMenu();
          this.addTab();
        });
      }

      const bindCtx = (id, fn) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = this.contextMenuTabId || this.activeTabId;
            this.closeContextMenu();
            if (targetId) fn(targetId);
          });
        }
      };

      bindCtx('tab-ctx-rename', (id) => this.startInlineRename(id));
      bindCtx('tab-ctx-duplicate', (id) => this.duplicateTab(id));
      bindCtx('tab-ctx-move-left', (id) => this.moveTab(id, -1));
      bindCtx('tab-ctx-move-right', (id) => this.moveTab(id, 1));
      bindCtx('tab-ctx-delete', (id) => this.deleteTab(id));

      window.addEventListener('click', (e) => {
        const menu = document.getElementById('tab-context-menu');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
          this.closeContextMenu();
        }
      });

      // Horizontal mouse wheel scroll on tab strip
      const listEl = document.getElementById('sheet-tabs-list');
      if (listEl) {
        listEl.addEventListener(
          'wheel',
          (e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              listEl.scrollLeft += e.deltaY;
              e.preventDefault();
            }
          },
          { passive: false }
        );
      }
    },

    serializeWorkbook() {
      this.syncCurrentTabFromCanvas();
      const active = this.getActiveTab();
      let activeParsed = {};
      try {
        activeParsed = active && active.canvasJSON ? JSON.parse(active.canvasJSON) : {};
      } catch (e) {
        activeParsed = { objects: [] };
      }

      const titleEl = document.getElementById('board-title');
      activeParsed.boardMeta = {
        title: (titleEl && titleEl.value) || 'Untitled Chalkboard',
        theme: window.Chalkboard.CanvasManager.theme,
        gridMode: window.Chalkboard.CanvasManager.gridMode,
        updatedAt: new Date().toISOString(),
      };

      activeParsed.workbook = {
        version: 2,
        activeTabId: this.activeTabId,
        tabs: this.tabs.map((t) => ({
          id: t.id,
          name: t.name,
          canvasJSON: t.canvasJSON,
          viewportTransform: t.viewportTransform || [1, 0, 0, 1, 0, 0],
        })),
      };

      return JSON.stringify(activeParsed);
    },

    saveWorkbookToStorage() {
      if (this.isSwitching) return;
      try {
        const serialized = this.serializeWorkbook();
        localStorage.setItem(WORKBOOK_STORAGE_KEY, serialized);
        localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
      } catch (e) {
        // Ignore quota errors
      }
    },

    loadWorkbookFromJSON(rawStrOrObj, callback) {
      let parsed;
      try {
        parsed = typeof rawStrOrObj === 'string' ? JSON.parse(rawStrOrObj) : rawStrOrObj;
      } catch (e) {
        console.error('Failed to parse workbook JSON:', e);
        return false;
      }

      if (!parsed || typeof parsed !== 'object') return false;

      // Apply board-level meta (title, theme, gridMode)
      if (parsed.boardMeta) {
        if (parsed.boardMeta.title && window.Chalkboard.App) {
          window.Chalkboard.App.setBoardTitle(parsed.boardMeta.title);
        }
        if (parsed.boardMeta.theme) {
          window.Chalkboard.CanvasManager.setTheme(parsed.boardMeta.theme);
          if (window.Chalkboard.App && window.Chalkboard.App.syncThemeUI) {
            window.Chalkboard.App.syncThemeUI(parsed.boardMeta.theme);
          }
        }
        if (parsed.boardMeta.gridMode) {
          window.Chalkboard.CanvasManager.setGridMode(parsed.boardMeta.gridMode);
          if (window.Chalkboard.App && window.Chalkboard.App.syncGridUI) {
            window.Chalkboard.App.syncGridUI(parsed.boardMeta.gridMode);
          }
        }
      }

      if (parsed.workbook && Array.isArray(parsed.workbook.tabs) && parsed.workbook.tabs.length > 0) {
        this.tabs = parsed.workbook.tabs.map((t, idx) => {
          const cJson =
            typeof t.canvasJSON === 'string'
              ? t.canvasJSON
              : JSON.stringify(t.canvasJSON || { objects: [] });
          return {
            id: t.id || this.generateId(),
            name: t.name || `Sheet ${idx + 1}`,
            canvasJSON: cJson,
            undoStack: [cJson],
            redoStack: [],
            viewportTransform:
              Array.isArray(t.viewportTransform) && t.viewportTransform.length === 6
                ? t.viewportTransform
                : [1, 0, 0, 1, 0, 0],
          };
        });

        const targetId =
          parsed.workbook.activeTabId &&
          this.tabs.some((t) => t.id === parsed.workbook.activeTabId)
            ? parsed.workbook.activeTabId
            : this.tabs[0].id;

        this.activeTabId = null;
        this.switchToTab(targetId, callback);
        return true;
      }

      // Fallback for legacy single-sheet JSON
      if (Array.isArray(parsed.objects)) {
        const singleJSON = JSON.stringify({
          version: parsed.version || fabric.version || '5.3.0',
          objects: parsed.objects,
        });
        const firstTab = this.createTabObject('Sheet 1', singleJSON, [1, 0, 0, 1, 0, 0]);
        this.tabs = [firstTab];
        this.activeTabId = null;
        this.switchToTab(firstTab.id, callback);
        return true;
      }

      return false;
    },

    loadFromLocalStorage() {
      try {
        const savedWorkbook =
          localStorage.getItem(WORKBOOK_STORAGE_KEY) ||
          localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!savedWorkbook) return false;

        const parsed = JSON.parse(savedWorkbook);
        const hasWorkbookTabs =
          parsed &&
          parsed.workbook &&
          Array.isArray(parsed.workbook.tabs) &&
          parsed.workbook.tabs.length > 0;
        const hasLegacyObjects =
          parsed && Array.isArray(parsed.objects) && parsed.objects.length > 0;

        if (hasWorkbookTabs || hasLegacyObjects) {
          return this.loadWorkbookFromJSON(parsed);
        }
      } catch (e) {
        console.warn('Could not load workbook from localStorage', e);
      }
      return false;
    },

    initDefaultSheet() {
      const snapshot = window.Chalkboard.HistoryManager.serializeCanvasOnly();
      const firstTab = this.createTabObject('Sheet 1', snapshot, [1, 0, 0, 1, 0, 0]);
      this.tabs = [firstTab];
      this.activeTabId = firstTab.id;
      this.renderTabs();
      this.saveWorkbookToStorage();
    },
  };

  window.Chalkboard.TabManager = TabManager;
})();
