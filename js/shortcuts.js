(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const ShortcutManager = {
    canvas: null,

    init(canvas) {
      this.canvas = canvas;
      this.bindKeyboard();
      this.bindHelpModal();
    },

    isEditingText() {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable)
      ) {
        return true;
      }
      const activeObj = this.canvas && this.canvas.getActiveObject();
      if (activeObj && activeObj.isEditing) {
        return true;
      }
      return false;
    },

    bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        // Spacebar temporary hand pan
        if (e.code === 'Space' && !this.isEditingText()) {
          if (!window.Chalkboard.CanvasManager.spacePressed) {
            window.Chalkboard.CanvasManager.spacePressed = true;
            this.canvas.defaultCursor = 'grab';
            this.canvas.setCursor('grab');
          }
          e.preventDefault();
          return;
        }

        if (this.isEditingText()) {
          if (e.key === 'Escape') {
            const activeObj = this.canvas.getActiveObject();
            if (activeObj && activeObj.isEditing) {
              activeObj.exitEditing();
              this.canvas.requestRenderAll();
            } else if (document.activeElement) {
              document.activeElement.blur();
            }
          }
          return;
        }

        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const alt = e.altKey;
        const key = e.key.toLowerCase();

        // Ctrl/Cmd shortcuts
        if (ctrl) {
          if (key === 'z' && !shift) {
            e.preventDefault();
            window.Chalkboard.HistoryManager.undo();
            return;
          }
          if ((key === 'z' && shift) || key === 'y') {
            e.preventDefault();
            window.Chalkboard.HistoryManager.redo();
            return;
          }
          if (key === 'c' && !alt) {
            e.preventDefault();
            window.Chalkboard.ObjectActions.copySelection();
            return;
          }
          if (key === 'c' && alt) {
            e.preventDefault();
            window.Chalkboard.ExportManager.copyPNGToClipboard({ withBg: true });
            return;
          }
          if (key === 'v') {
            // Note: image paste is handled by window 'paste' listener; internal object paste fallback:
            if (window.Chalkboard.ObjectActions.clipboard) {
              window.Chalkboard.ObjectActions.pasteSelection();
            }
            return;
          }
          if (key === 'd') {
            e.preventDefault();
            window.Chalkboard.ObjectActions.duplicateSelection();
            return;
          }
          if (key === 'a') {
            e.preventDefault();
            window.Chalkboard.ObjectActions.selectAll();
            return;
          }
          if (key === 'g' && !shift) {
            e.preventDefault();
            window.Chalkboard.ObjectActions.groupSelection();
            return;
          }
          if (key === 'g' && shift) {
            e.preventDefault();
            window.Chalkboard.ObjectActions.ungroupSelection();
            return;
          }
          if (key === 's') {
            e.preventDefault();
            window.Chalkboard.ExportManager.saveProjectJSON();
            return;
          }
          if (key === 'o') {
            e.preventDefault();
            const fInput = document.getElementById('file-input-json');
            if (fInput) fInput.click();
            return;
          }
          if (key === 'e' && shift) {
            e.preventDefault();
            window.Chalkboard.ExportManager.exportPNG({ withBg: true, scale: 2 });
            return;
          }
          if (key === '=' || key === '+') {
            e.preventDefault();
            window.Chalkboard.CanvasManager.zoomBy(1.2);
            return;
          }
          if (key === '-') {
            e.preventDefault();
            window.Chalkboard.CanvasManager.zoomBy(1 / 1.2);
            return;
          }
          if (key === '0') {
            e.preventDefault();
            window.Chalkboard.CanvasManager.resetZoom();
            return;
          }
          return;
        }

        // Shift + 1 => Zoom to fit
        if (shift && (e.code === 'Digit1' || key === '!')) {
          e.preventDefault();
          window.Chalkboard.CanvasManager.zoomToFit();
          return;
        }

        // Delete / Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          window.Chalkboard.ObjectActions.deleteSelection();
          return;
        }

        // Escape => clear selection, close modals, return to select
        if (e.key === 'Escape') {
          document.getElementById('export-modal').classList.add('hidden');
          document.getElementById('help-modal').classList.add('hidden');
          document.getElementById('menu-dropdown').classList.add('hidden');
          this.canvas.discardActiveObject();
          window.Chalkboard.App.setTool('select');
          this.canvas.requestRenderAll();
          return;
        }

        // Layer ordering shortcuts
        if (e.key === ']' && !alt) {
          window.Chalkboard.ObjectActions.bringToFront();
          return;
        }
        if (e.key === '[' && !alt) {
          window.Chalkboard.ObjectActions.sendToBack();
          return;
        }
        if (e.key === ']' && alt) {
          window.Chalkboard.ObjectActions.bringForward();
          return;
        }
        if (e.key === '[' && alt) {
          window.Chalkboard.ObjectActions.sendBackward();
          return;
        }

        // Help modal (?)
        if (e.key === '?') {
          const modal = document.getElementById('help-modal');
          if (modal) modal.classList.toggle('hidden');
          return;
        }

        // Tool hotkeys
        const toolMap = {
          q: 'lock-toggle',
          h: 'pan',
          v: 'select',
          '1': 'select',
          c: 'chalk',
          p: 'chalk',
          '2': 'chalk',
          b: 'pen',
          '3': 'pen',
          s: 'spray',
          '4': 'spray',
          m: 'highlighter',
          '5': 'highlighter',
          e: 'eraser',
          '6': 'eraser',
          r: 'rect',
          '7': 'rect',
          d: 'diamond',
          '8': 'diamond',
          o: 'ellipse',
          '9': 'ellipse',
          a: 'arrow',
          '0': 'arrow',
          l: 'line',
          t: 'text',
          n: 'sticky',
          i: 'image',
          k: 'laser',
        };

        const mapped = toolMap[key];
        if (mapped === 'lock-toggle') {
          window.Chalkboard.App.toggleToolLock();
        } else if (mapped) {
          window.Chalkboard.App.setTool(mapped);
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          window.Chalkboard.CanvasManager.spacePressed = false;
          if (!window.Chalkboard.CanvasManager.isPanning) {
            window.Chalkboard.App.applyToolModeToObjects();
          }
        }
      });
    },

    bindHelpModal() {
      const helpBtn = document.getElementById('btn-help');
      const helpModal = document.getElementById('help-modal');
      const closeBtn = document.getElementById('close-help-modal');

      if (helpBtn && helpModal) {
        helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
      }
      if (closeBtn && helpModal) {
        closeBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
      }
      if (helpModal) {
        helpModal.addEventListener('click', (e) => {
          if (e.target === helpModal) helpModal.classList.add('hidden');
        });
      }
    },
  };

  window.Chalkboard.ShortcutManager = ShortcutManager;
})();
