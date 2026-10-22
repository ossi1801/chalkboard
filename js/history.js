(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const STORAGE_KEY = 'chalkboard_saved_state_v1';
  const MAX_HISTORY = 60;

  const HistoryManager = {
    canvas: null,
    undoStack: [],
    redoStack: [],
    isRestoring: false,
    saveDebounceTimer: null,

    init(canvas) {
      this.canvas = canvas;

      // Capture initial blank state
      this.pushState(false);

      canvas.on('object:added', (e) => {
        if (this.isRestoring || (e.target && e.target.isHelper)) return;
        this.scheduleSave();
      });

      canvas.on('object:modified', (e) => {
        if (this.isRestoring || (e.target && e.target.isHelper)) return;
        this.scheduleSave();
      });

      canvas.on('object:removed', (e) => {
        if (this.isRestoring || (e.target && e.target.isHelper)) return;
        this.scheduleSave();
      });
    },

    scheduleSave() {
      if (this.isRestoring) return;
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(() => {
        this.pushState(true);
      }, 80);
    },

    serializeCanvas() {
      const json = this.canvas.toJSON();
      // Filter out temporary drawing helpers
      if (Array.isArray(json.objects)) {
        json.objects = json.objects.filter((o) => !o.isHelper);
      }
      json.boardMeta = {
        title: (document.getElementById('board-title') || {}).value || 'Untitled Chalkboard',
        theme: window.Chalkboard.CanvasManager.theme,
        gridMode: window.Chalkboard.CanvasManager.gridMode,
        updatedAt: new Date().toISOString(),
      };
      return JSON.stringify(json);
    },

    pushState(persistToStorage = true) {
      if (this.isRestoring) return;
      const snapshot = this.serializeCanvas();
      const top = this.undoStack[this.undoStack.length - 1];
      if (top === snapshot) return;

      this.undoStack.push(snapshot);
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.updateButtons();

      if (persistToStorage) {
        this.saveToLocalStorage(snapshot);
      }
    },

    undo() {
      if (this.undoStack.length <= 1 || this.isRestoring) return;
      const current = this.undoStack.pop();
      this.redoStack.push(current);
      const prev = this.undoStack[this.undoStack.length - 1];
      this.restoreSnapshot(prev);
    },

    redo() {
      if (this.redoStack.length === 0 || this.isRestoring) return;
      const next = this.redoStack.pop();
      this.undoStack.push(next);
      this.restoreSnapshot(next);
    },

    restoreSnapshot(snapshotStr, callback) {
      if (!snapshotStr) return;
      this.isRestoring = true;
      let parsed;
      try {
        parsed = typeof snapshotStr === 'string' ? JSON.parse(snapshotStr) : snapshotStr;
      } catch (err) {
        console.error('Failed to parse chalkboard snapshot:', err);
        this.isRestoring = false;
        return;
      }

      if (parsed.boardMeta) {
        const titleInput = document.getElementById('board-title');
        if (titleInput && parsed.boardMeta.title) {
          titleInput.value = parsed.boardMeta.title;
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

      this.canvas.loadFromJSON(parsed, () => {
        // Re-apply lock states and active tool cursor/selectability
        this.canvas.getObjects().forEach((obj) => {
          if (obj.locked) {
            obj.set({
              lockMovementX: true,
              lockMovementY: true,
              lockScalingX: true,
              lockScalingY: true,
              lockRotation: true,
              hasControls: false,
            });
          }
        });

        this.isRestoring = false;
        this.updateButtons();
        this.saveToLocalStorage(typeof snapshotStr === 'string' ? snapshotStr : JSON.stringify(parsed));

        if (window.Chalkboard.App) {
          window.Chalkboard.App.applyToolModeToObjects();
        }
        this.canvas.requestRenderAll();
        if (callback) callback();
      });
    },

    updateButtons() {
      const btnUndo = document.getElementById('btn-undo');
      const btnRedo = document.getElementById('btn-redo');
      if (btnUndo) btnUndo.disabled = this.undoStack.length <= 1;
      if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
    },

    saveToLocalStorage(snapshotStr) {
      try {
        localStorage.setItem(STORAGE_KEY, snapshotStr || this.serializeCanvas());
      } catch (e) {
        // Ignore quota errors
      }
    },

    loadFromLocalStorage() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.objects) && parsed.objects.length > 0) {
          this.undoStack = [saved];
          this.redoStack = [];
          this.restoreSnapshot(saved);
          return true;
        }
      } catch (e) {
        console.warn('Could not load saved chalkboard from localStorage', e);
      }
      return false;
    },
  };

  window.Chalkboard.HistoryManager = HistoryManager;
})();
