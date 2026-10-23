(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const FREEHAND_TOOLS = new Set(['chalk', 'pen', 'spray', 'highlighter']);

  const App = {
    canvas: null,
    activeTool: 'select',
    toolLocked: false,
    toastTimer: null,

    init() {
      const canvas = window.Chalkboard.CanvasManager.init();
      this.canvas = canvas;

      window.Chalkboard.Properties.init(canvas);
      window.Chalkboard.HistoryManager.init(canvas);
      if (window.Chalkboard.TabManager) {
        window.Chalkboard.TabManager.init(canvas);
      }
      window.Chalkboard.BrushManager.init(canvas);
      window.Chalkboard.ShapeManager.init(canvas);
      window.Chalkboard.ObjectActions.init(canvas);
      window.Chalkboard.ExportManager.init(canvas);
      window.Chalkboard.ShortcutManager.init(canvas);

      this.bindToolbar();
      this.bindTopMenu();
      this.bindBottomBar();
      this.initResponsiveLayout();

      // Load saved board from localStorage, or populate welcome sample on first visit
      const restored = window.Chalkboard.HistoryManager.loadFromLocalStorage();
      if (!restored) {
        this.loadWelcomeSample();
        if (window.Chalkboard.TabManager) {
          window.Chalkboard.TabManager.initDefaultSheet();
        }
      }

      this.setTool('select');
    },

    isMobileViewport() {
      return window.innerWidth <= 768;
    },

    initResponsiveLayout() {
      const inspector = document.getElementById('inspector-panel');
      const toggleInspectorBtn = document.getElementById('btn-toggle-inspector');

      if (inspector && toggleInspectorBtn) {
        if (this.isMobileViewport()) {
          inspector.classList.add('hidden');
          toggleInspectorBtn.classList.remove('active');
        } else {
          toggleInspectorBtn.classList.toggle('active', !inspector.classList.contains('hidden'));
        }
      }
    },

    onCanvasInteract() {
      const dropdown = document.getElementById('menu-dropdown');
      if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
      }
      if (window.Chalkboard.TabManager) {
        window.Chalkboard.TabManager.closeContextMenu();
      }
      if (this.isMobileViewport()) {
        const inspector = document.getElementById('inspector-panel');
        const toggleInspectorBtn = document.getElementById('btn-toggle-inspector');
        if (inspector && !inspector.classList.contains('hidden')) {
          inspector.classList.add('hidden');
          if (toggleInspectorBtn) toggleInspectorBtn.classList.remove('active');
        }
      }
    },

    bindToolbar() {
      const toolBtns = document.querySelectorAll('.tool-dock .tool-btn[data-tool]');
      toolBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tool = btn.getAttribute('data-tool');
          this.setTool(tool);
        });
      });

      const lockBtn = document.getElementById('btn-lock-tool');
      if (lockBtn) {
        lockBtn.addEventListener('click', () => this.toggleToolLock());
      }

      const toggleToolsBtn = document.getElementById('btn-toggle-tools');
      const toolDock = document.getElementById('main-tool-dock');
      if (toggleToolsBtn && toolDock) {
        toggleToolsBtn.addEventListener('click', () => {
          const collapsed = toolDock.classList.toggle('mobile-collapsed');
          toggleToolsBtn.classList.toggle('active', !collapsed);
          toggleToolsBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
      }

      const toggleInspectorBtn = document.getElementById('btn-toggle-inspector');
      const closeInspectorBtn = document.getElementById('close-inspector-btn');
      const inspector = document.getElementById('inspector-panel');
      if (toggleInspectorBtn && inspector) {
        toggleInspectorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          inspector.classList.toggle('hidden');
          const isOpen = !inspector.classList.contains('hidden');
          toggleInspectorBtn.classList.toggle('active', isOpen);
          if (isOpen) {
            const dropdown = document.getElementById('menu-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
          }
        });
      }
      if (closeInspectorBtn && inspector) {
        closeInspectorBtn.addEventListener('click', () => {
          inspector.classList.add('hidden');
          if (toggleInspectorBtn) toggleInspectorBtn.classList.remove('active');
        });
      }
    },

    toggleToolLock() {
      this.toolLocked = !this.toolLocked;
      const lockBtn = document.getElementById('btn-lock-tool');
      if (lockBtn) {
        lockBtn.classList.toggle('active', this.toolLocked);
      }
      this.showToast(
        this.toolLocked
          ? 'Tool Lock ON — active tool stays selected'
          : 'Tool Lock OFF'
      );
    },

    setTool(toolName) {
      if (toolName === 'image') {
        const fileInput = document.getElementById('file-input-image');
        if (fileInput) fileInput.click();
        return;
      }

      this.activeTool = toolName;

      // Update active button state
      document.querySelectorAll('.tool-dock .tool-btn[data-tool]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
      });

      // Configure Fabric freeDrawingMode or interactive mode
      if (FREEHAND_TOOLS.has(toolName)) {
        this.canvas.discardActiveObject();
        window.Chalkboard.BrushManager.activateBrush(toolName);
      } else {
        window.Chalkboard.BrushManager.activateBrush(null);
      }

      this.applyToolModeToObjects();
      this.canvas.requestRenderAll();
    },

    applyToolModeToObjects() {
      const tool = this.activeTool;
      const isSelect = tool === 'select';
      const isPan = tool === 'pan';

      this.canvas.selection = isSelect;

      if (isPan) {
        this.canvas.defaultCursor = 'grab';
        this.canvas.hoverCursor = 'grab';
      } else if (tool === 'eraser') {
        this.canvas.defaultCursor = 'crosshair';
        this.canvas.hoverCursor = 'crosshair';
      } else if (tool === 'laser') {
        this.canvas.defaultCursor = 'crosshair';
        this.canvas.hoverCursor = 'crosshair';
      } else if (isSelect) {
        this.canvas.defaultCursor = 'default';
        this.canvas.hoverCursor = 'move';
      } else {
        this.canvas.defaultCursor = 'crosshair';
        this.canvas.hoverCursor = 'crosshair';
      }

      this.canvas.getObjects().forEach((obj) => {
        if (obj.isHelper) return;
        obj.selectable = isSelect;
        obj.evented = isSelect || tool === 'eraser' || tool === 'text';
      });
    },

    setBoardTitle(val) {
      const titleInput = document.getElementById('board-title');
      const mobileTitleInput = document.getElementById('mobile-board-title');
      if (titleInput) titleInput.value = val;
      if (mobileTitleInput) mobileTitleInput.value = val;
    },

    bindTopMenu() {
      const menuBtn = document.getElementById('btn-menu');
      const dropdown = document.getElementById('menu-dropdown');

      if (menuBtn && dropdown) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const willOpen = dropdown.classList.contains('hidden');
          dropdown.classList.toggle('hidden');
          if (willOpen && this.isMobileViewport()) {
            const inspector = document.getElementById('inspector-panel');
            const toggleInspectorBtn = document.getElementById('btn-toggle-inspector');
            if (inspector) inspector.classList.add('hidden');
            if (toggleInspectorBtn) toggleInspectorBtn.classList.remove('active');
          }
        });
        window.addEventListener('click', (e) => {
          if (!dropdown.contains(e.target) && e.target !== menuBtn) {
            dropdown.classList.add('hidden');
          }
        });
      }

      // Theme selector pills
      const themeBtns = document.querySelectorAll('#theme-selector .theme-pill');
      themeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-theme-val');
          window.Chalkboard.CanvasManager.setTheme(val);
          this.syncThemeUI(val);
          window.Chalkboard.HistoryManager.scheduleSave();
        });
      });

      // Grid selector pills
      const gridBtns = document.querySelectorAll('#grid-selector .theme-pill');
      gridBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-grid-val');
          window.Chalkboard.CanvasManager.setGridMode(val);
          this.syncGridUI(val);
          window.Chalkboard.HistoryManager.scheduleSave();
        });
      });

      const demoBtn = document.getElementById('menu-load-demo');
      if (demoBtn) {
        demoBtn.addEventListener('click', () => {
          dropdown.classList.add('hidden');
          this.loadWelcomeSample();
          this.showToast('Loaded welcome chalkboard sample');
        });
      }

      const clearBtn = document.getElementById('menu-clear-canvas');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          dropdown.classList.add('hidden');
          this.clearBoard();
        });
      }

      const menuExportModalBtn = document.getElementById('menu-open-export-modal');
      if (menuExportModalBtn) {
        menuExportModalBtn.addEventListener('click', () => {
          dropdown.classList.add('hidden');
          const modal = document.getElementById('export-modal');
          if (modal) modal.classList.remove('hidden');
        });
      }

      const menuHelpBtn = document.getElementById('menu-open-help');
      if (menuHelpBtn) {
        menuHelpBtn.addEventListener('click', () => {
          dropdown.classList.add('hidden');
          const modal = document.getElementById('help-modal');
          if (modal) modal.classList.remove('hidden');
        });
      }

      const titleInput = document.getElementById('board-title');
      const mobileTitleInput = document.getElementById('mobile-board-title');
      if (titleInput) {
        titleInput.addEventListener('input', () => {
          if (mobileTitleInput) mobileTitleInput.value = titleInput.value;
        });
        titleInput.addEventListener('change', () => {
          window.Chalkboard.HistoryManager.scheduleSave();
        });
      }
      if (mobileTitleInput) {
        mobileTitleInput.addEventListener('input', () => {
          if (titleInput) titleInput.value = mobileTitleInput.value;
        });
        mobileTitleInput.addEventListener('change', () => {
          window.Chalkboard.HistoryManager.scheduleSave();
        });
      }
    },

    syncThemeUI(themeVal) {
      document.querySelectorAll('#theme-selector .theme-pill').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-theme-val') === themeVal);
      });
    },

    syncGridUI(gridVal) {
      document.querySelectorAll('#grid-selector .theme-pill').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-grid-val') === gridVal);
      });
    },

    bindBottomBar() {
      const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
      };

      bindClick('btn-zoom-in', () => window.Chalkboard.CanvasManager.zoomBy(1.2));
      bindClick('btn-zoom-out', () => window.Chalkboard.CanvasManager.zoomBy(1 / 1.2));
      bindClick('btn-zoom-reset', () => window.Chalkboard.CanvasManager.resetZoom());
      bindClick('btn-zoom-fit', () => window.Chalkboard.CanvasManager.zoomToFit());

      bindClick('btn-undo', () => window.Chalkboard.HistoryManager.undo());
      bindClick('btn-redo', () => window.Chalkboard.HistoryManager.redo());
    },

    clearBoard() {
      this.canvas.discardActiveObject();
      this.canvas.getObjects().slice().forEach((obj) => {
        this.canvas.remove(obj);
      });
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.pushState(true);
      this.showToast('Cleared current sheet');
    },

    loadWelcomeSample() {
      const canvas = this.canvas;
      window.Chalkboard.HistoryManager.isRestoring = true;
      canvas.discardActiveObject();
      canvas.getObjects().slice().forEach((o) => canvas.remove(o));

      const cx = Math.max(window.innerWidth / 2, 540);
      const cy = Math.max(window.innerHeight / 2, 360);
      const fontStack = window.Chalkboard.Properties.getFontStack('chalk');

      // Title banner
      const heading = new fabric.IText('Chalkboard — Infinite Blackboard & Diagramming', {
        id: 'sample_title',
        left: cx - 280,
        top: cy - 210,
        fontFamily: fontStack,
        fontMode: 'chalk',
        fontSize: 28,
        fontWeight: 'bold',
        fill: '#f8fafc',
        chalkEffect: 'chalk',
        shapeKind: 'text',
        shadow: new fabric.Shadow({ color: '#f8fafc', blur: 6 }),
      });

      const subtitle = new fabric.IText(
        'Inspired by KDE Drawy & Excalidraw • Powered 100% by Fabric.js',
        {
          id: 'sample_subtitle',
          left: cx - 235,
          top: cy - 168,
          fontFamily: window.Chalkboard.Properties.getFontStack('sans'),
          fontMode: 'sans',
          fontSize: 15,
          fill: '#94a3b8',
          shapeKind: 'text',
        }
      );

      // Left node: Freehand & Chalk Brushes
      const rect1 = new fabric.Rect({
        id: 'sample_box1',
        left: cx - 310,
        top: cy - 90,
        width: 190,
        height: 110,
        rx: 12,
        ry: 12,
        stroke: '#7dd3fc',
        fill: 'rgba(125, 211, 252, 0.14)',
        strokeWidth: 3.5,
        strokeUniform: true,
        chalkEffect: 'chalk',
        shapeKind: 'rect',
        shadow: new fabric.Shadow({ color: '#7dd3fc', blur: 5 }),
      });

      const label1 = new fabric.IText('Fabric.js Brushes\n• Chalk & Dust Spray\n• Tablet Pressure Pen\n• Highlighter & Laser', {
        id: 'sample_label1',
        left: cx - 292,
        top: cy - 72,
        fontFamily: fontStack,
        fontMode: 'chalk',
        fontSize: 15,
        lineHeight: 1.3,
        fill: '#f8fafc',
        shapeKind: 'text',
      });

      // Center diamond: Infinite Canvas
      const diamond = new fabric.Polygon(
        window.Chalkboard.ShapeManager.getDiamondPoints(170, 120),
        {
          id: 'sample_diamond',
          left: cx - 55,
          top: cy - 95,
          stroke: '#fde047',
          fill: 'rgba(253, 224, 71, 0.14)',
          strokeWidth: 3.5,
          strokeUniform: true,
          chalkEffect: 'chalk',
          shapeKind: 'diamond',
          shadow: new fabric.Shadow({ color: '#fde047', blur: 5 }),
        }
      );

      const label2 = new fabric.IText('Infinite\nBoard', {
        id: 'sample_label2',
        left: cx + 2,
        top: cy - 55,
        fontFamily: fontStack,
        fontMode: 'chalk',
        fontSize: 16,
        textAlign: 'center',
        fill: '#fde047',
        shapeKind: 'text',
      });

      // Arrows connecting nodes
      const arrow1Data = window.Chalkboard.ShapeManager.buildArrowPathData(
        cx - 112,
        cy - 35,
        cx - 60,
        cy - 35,
        3.5,
        'single'
      );
      const arrow1 = new fabric.Path(arrow1Data, {
        id: 'sample_arrow1',
        stroke: '#f8fafc',
        fill: null,
        strokeWidth: 3.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeUniform: true,
        shapeKind: 'arrow',
        shadow: new fabric.Shadow({ color: '#f8fafc', blur: 4 }),
      });

      const arrow2Data = window.Chalkboard.ShapeManager.buildArrowPathData(
        cx + 122,
        cy - 35,
        cx + 178,
        cy - 35,
        3.5,
        'single'
      );
      const arrow2 = new fabric.Path(arrow2Data, {
        id: 'sample_arrow2',
        stroke: '#86efac',
        fill: null,
        strokeWidth: 3.5,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeUniform: true,
        shapeKind: 'arrow',
        shadow: new fabric.Shadow({ color: '#86efac', blur: 4 }),
      });

      // Right Sticky Note
      const sticky = new fabric.Textbox(
        'Quick Tips:\n• Hold Space + Drag to Pan\n• Ctrl + Wheel to Zoom\n• Press C for Chalk, B for Pen\n• Double-click anywhere to type!',
        {
          id: 'sample_sticky',
          left: cx + 188,
          top: cy - 102,
          width: 215,
          fontSize: 15,
          fontFamily: fontStack,
          fontMode: 'chalk',
          fill: '#0f172a',
          backgroundColor: '#fef08a',
          padding: 14,
          textAlign: 'left',
          shapeKind: 'sticky',
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.4)',
            blur: 14,
            offsetX: 0,
            offsetY: 6,
          }),
        }
      );

      // Decorative hand-drawn chalk wave at bottom
      const wave = new fabric.Path(
        `M ${cx - 260} ${cy + 85} Q ${cx - 140} ${cy + 40} ${cx - 20} ${cy + 85} T ${cx + 220} ${cy + 75}`,
        {
          id: 'sample_wave',
          stroke: '#fda4af',
          fill: null,
          strokeWidth: 5,
          strokeLineCap: 'round',
          strokeDashArray: [14, 10],
          strokeUniform: true,
          chalkEffect: 'heavy',
          shadow: new fabric.Shadow({ color: '#fda4af', blur: 9 }),
        }
      );

      canvas.add(heading, subtitle, rect1, label1, diamond, label2, arrow1, arrow2, sticky, wave);

      window.Chalkboard.HistoryManager.isRestoring = false;
      this.applyToolModeToObjects();
      canvas.requestRenderAll();
      window.Chalkboard.Properties.ensureFontsLoaded();
      window.Chalkboard.HistoryManager.pushState(true);
    },

    showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.remove('hidden');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
      }, 2200);
    },
  };

  window.Chalkboard.App = App;

  window.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
})();
