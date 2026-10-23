(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const THEMES = {
    slate: {
      bg: '#181c20',
      grid: 'rgba(255, 255, 255, 0.10)',
      gridMajor: 'rgba(255, 255, 255, 0.16)',
      selectionBorder: '#38bdf8',
      selectionFill: 'rgba(56, 189, 248, 0.12)',
    },
    greenboard: {
      bg: '#193024',
      grid: 'rgba(255, 255, 255, 0.10)',
      gridMajor: 'rgba(255, 255, 255, 0.18)',
      selectionBorder: '#fde047',
      selectionFill: 'rgba(253, 224, 71, 0.12)',
    },
    obsidian: {
      bg: '#0f1115',
      grid: 'rgba(255, 255, 255, 0.08)',
      gridMajor: 'rgba(255, 255, 255, 0.14)',
      selectionBorder: '#a78bfa',
      selectionFill: 'rgba(167, 139, 250, 0.14)',
    },
    whiteboard: {
      bg: '#f8fafc',
      grid: 'rgba(15, 23, 42, 0.10)',
      gridMajor: 'rgba(15, 23, 42, 0.16)',
      selectionBorder: '#4f46e5',
      selectionFill: 'rgba(79, 70, 229, 0.10)',
    },
  };

  // Global custom properties to serialize in Fabric.js objects
  fabric.Object.NUM_FRACTION_DIGITS = 4;
  const CUSTOM_PROPS = [
    'id',
    'chalkEffect',
    'dashMode',
    'cornerMode',
    'arrowMode',
    'shapeKind',
    'locked',
    'stickyText',
    'fontMode',
  ];
  fabric.Object.prototype.toObject = (function (toObject) {
    return function (propertiesToInclude) {
      return toObject.call(
        this,
        (propertiesToInclude || []).concat(CUSTOM_PROPS)
      );
    };
  })(fabric.Object.prototype.toObject);

  // Customize default Fabric control handles (Excalidraw/Drawy style)
  fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#38bdf8',
    borderColor: '#38bdf8',
    cornerSize: 9,
    cornerStyle: 'circle',
    padding: 5,
    borderScaleFactor: 1.5,
  });

  const CanvasManager = {
    canvas: null,
    hudCanvas: null,
    hudCtx: null,
    theme: 'slate',
    gridMode: 'dots',
    isPanning: false,
    spacePressed: false,
    lastPanX: 0,
    lastPanY: 0,
    currentPressure: 0.5,
    pointerWorld: { x: 0, y: 0 },

    init() {
      const el = document.getElementById('chalkboard-canvas');
      this.hudCanvas = document.getElementById('hud-canvas');
      this.hudCtx = this.hudCanvas.getContext('2d');

      this.canvas = new fabric.Canvas(el, {
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: THEMES[this.theme].bg,
        preserveObjectStacking: true,
        stopContextMenu: true,
        fireRightClick: true,
         fireMiddleClick: true,
        enableRetinaScaling: true,
        selectionColor: THEMES[this.theme].selectionFill,
        selectionBorderColor: THEMES[this.theme].selectionBorder,
        selectionLineWidth: 1.5,
      });

      this.resizeHud();
      this.bindViewportEvents();
      this.bindTouchGestures();
      this.bindGridRender();
      this.bindPointerTracking();

      window.addEventListener('resize', () => {
        this.canvas.setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
        this.resizeHud();
        this.canvas.requestRenderAll();
      });

      return this.canvas;
    },

    resizeHud() {
      const dpr = window.devicePixelRatio || 1;
      this.hudCanvas.width = window.innerWidth * dpr;
      this.hudCanvas.height = window.innerHeight * dpr;
      this.hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    getThemeConfig() {
      return THEMES[this.theme] || THEMES.slate;
    },

    setTheme(themeName) {
      if (!THEMES[themeName]) return;
      this.theme = themeName;
      document.documentElement.setAttribute('data-theme', themeName);
      const cfg = THEMES[themeName];
      this.canvas.setBackgroundColor(cfg.bg, () => {
        this.canvas.selectionColor = cfg.selectionFill;
        this.canvas.selectionBorderColor = cfg.selectionBorder;
        fabric.Object.prototype.cornerStrokeColor = cfg.selectionBorder;
        fabric.Object.prototype.borderColor = cfg.selectionBorder;
        this.canvas.requestRenderAll();
      });
    },

    setGridMode(mode) {
      this.gridMode = mode;
      this.canvas.requestRenderAll();
    },

    bindGridRender() {
      // Draw infinite grid directly onto the lower canvas after background clear
      this.canvas.on('before:render', () => {
        const ctx = this.canvas.getContext();
        const cfg = this.getThemeConfig();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = this.canvas.getRetinaScaling ? this.canvas.getRetinaScaling() : 1;
        ctx.fillStyle = cfg.bg;
        ctx.fillRect(0, 0, this.canvas.width * dpr, this.canvas.height * dpr);
        ctx.restore();

        if (this.gridMode === 'none') return;
        this.drawInfiniteGrid(ctx, cfg);
      });
    },

    drawInfiniteGrid(ctx, cfg) {
      const vpt = this.canvas.viewportTransform;
      const zoom = this.canvas.getZoom();
      const width = this.canvas.getWidth();
      const height = this.canvas.getHeight();
      const dpr = this.canvas.getRetinaScaling ? this.canvas.getRetinaScaling() : 1;

      let step = 32;
      if (zoom < 0.35) step = 128;
      else if (zoom < 0.7) step = 64;
      else if (zoom > 2.5) step = 16;

      const offsetX = vpt[4];
      const offsetY = vpt[5];
      const startX = -offsetX / zoom;
      const startY = -offsetY / zoom;
      const endX = startX + width / zoom;
      const endY = startY + height / zoom;

      const firstX = Math.floor(startX / step) * step;
      const firstY = Math.floor(startY / step) * step;

      ctx.save();
      ctx.setTransform(
        vpt[0] * dpr,
        vpt[1] * dpr,
        vpt[2] * dpr,
        vpt[3] * dpr,
        vpt[4] * dpr,
        vpt[5] * dpr
      );

      if (this.gridMode === 'dots') {
        ctx.fillStyle = cfg.gridMajor;
        const dotSize = Math.max(1.2 / zoom, 0.6);
        for (let x = firstX; x <= endX; x += step) {
          for (let y = firstY; y <= endY; y += step) {
            ctx.beginPath();
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (this.gridMode === 'lines') {
        ctx.strokeStyle = cfg.grid;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        for (let x = firstX; x <= endX; x += step) {
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
        }
        for (let y = firstY; y <= endY; y += step) {
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
        }
        ctx.stroke();
      } else if (this.gridMode === 'ruled') {
        ctx.strokeStyle = cfg.gridMajor;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        for (let y = firstY; y <= endY; y += step) {
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
        }
        ctx.stroke();
      }

      ctx.restore();
    },

    bindViewportEvents() {
      const canvas = this.canvas;

      // Wheel zoom (Ctrl/Meta + Wheel) and two-finger pan (Wheel without Ctrl)
      canvas.on('mouse:wheel', (opt) => {
        const e = opt.e;
        e.preventDefault();
        e.stopPropagation();

        if (e.ctrlKey || e.metaKey) {
          const delta = e.deltaY;
          let zoom = canvas.getZoom();
          zoom *= Math.pow(0.997, delta);
          zoom = Math.min(Math.max(zoom, 0.1), 10);
          canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, zoom);
          this.updateZoomUI();
        } else {
          const vpt = canvas.viewportTransform;
          vpt[4] -= e.deltaX;
          vpt[5] -= e.deltaY;
          canvas.setViewportTransform(vpt);
          canvas.requestRenderAll();
        }
      });

      // Panning via Hand tool, Spacebar + Drag, or Middle-mouse click
      canvas.on('mouse:down', (opt) => {
        const e = opt.e;

        // Auto-dismiss mobile floating drawers when touching the canvas
        if (window.Chalkboard.App && window.Chalkboard.App.onCanvasInteract) {
          window.Chalkboard.App.onCanvasInteract();
        }

        const activeTool = window.Chalkboard.App ? window.Chalkboard.App.activeTool : 'select';
        if (activeTool === 'pan' || this.spacePressed || e.button === 1) {
          this.isPanning = true;
          canvas.selection = false;
          canvas.defaultCursor = 'grabbing';
          canvas.setCursor('grabbing');
          const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
          this.lastPanX = clientX;
          this.lastPanY = clientY;
        }
      });

      canvas.on('mouse:move', (opt) => {
        const e = opt.e;
        const pointer = canvas.getPointer(e);
        this.pointerWorld = {
          x: Math.round(pointer.x),
          y: Math.round(pointer.y),
        };
        this.updateStatusUI();

        if (this.isPanning) {
          const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
          if (typeof clientX === 'number' && typeof clientY === 'number') {
            const vpt = canvas.viewportTransform;
            vpt[4] += clientX - this.lastPanX;
            vpt[5] += clientY - this.lastPanY;
            this.lastPanX = clientX;
            this.lastPanY = clientY;
            canvas.setViewportTransform(vpt);
            canvas.requestRenderAll();
          }
        }
      });

      canvas.on('mouse:up', () => {
        if (this.isPanning) {
          this.isPanning = false;
          const activeTool = window.Chalkboard.App ? window.Chalkboard.App.activeTool : 'select';
          if (activeTool === 'pan' || this.spacePressed) {
            canvas.defaultCursor = 'grab';
            canvas.setCursor('grab');
          } else if (activeTool === 'select') {
            canvas.selection = true;
            canvas.defaultCursor = 'default';
          }
          canvas.requestRenderAll();
        }
      });
    },

    bindTouchGestures() {
      const container = document.getElementById('canvas-container');
      if (!container) return;

      let isTouchGesture = false;
      let lastDist = 0;
      let lastMidX = 0;
      let lastMidY = 0;
      let savedDrawingMode = false;

      const getTouchMetrics = (touches) => {
        const t0 = touches[0];
        const t1 = touches[1];
        const dx = t1.clientX - t0.clientX;
        const dy = t1.clientY - t0.clientY;
        return {
          dist: Math.hypot(dx, dy),
          midX: (t0.clientX + t1.clientX) / 2,
          midY: (t0.clientY + t1.clientY) / 2,
        };
      };

      container.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length === 2) {
            isTouchGesture = true;
            this.isPanning = false;

            // Cancel any in-progress single-finger shape or freehand stroke
            if (window.Chalkboard.ShapeManager && window.Chalkboard.ShapeManager.isDrawingShape) {
              if (window.Chalkboard.ShapeManager.activeShape) {
                this.canvas.remove(window.Chalkboard.ShapeManager.activeShape);
                window.Chalkboard.ShapeManager.activeShape = null;
              }
              window.Chalkboard.ShapeManager.isDrawingShape = false;
            }
            savedDrawingMode = this.canvas.isDrawingMode;
            if (this.canvas.isDrawingMode) {
              this.canvas.isDrawingMode = false;
            }

            const metrics = getTouchMetrics(e.touches);
            lastDist = metrics.dist;
            lastMidX = metrics.midX;
            lastMidY = metrics.midY;
          }
        },
        { passive: true }
      );

      container.addEventListener(
        'touchmove',
        (e) => {
          if (!isTouchGesture || e.touches.length !== 2) return;
          e.preventDefault();

          const metrics = getTouchMetrics(e.touches);
          const vpt = this.canvas.viewportTransform;

          // Pan by midpoint delta
          vpt[4] += metrics.midX - lastMidX;
          vpt[5] += metrics.midY - lastMidY;
          this.canvas.setViewportTransform(vpt);

          // Pinch zoom around midpoint
          if (lastDist > 10 && metrics.dist > 10) {
            const scaleFactor = metrics.dist / lastDist;
            let zoom = this.canvas.getZoom() * scaleFactor;
            zoom = Math.min(Math.max(zoom, 0.1), 10);
            this.canvas.zoomToPoint({ x: metrics.midX, y: metrics.midY }, zoom);
            this.updateZoomUI();
          }

          lastDist = metrics.dist;
          lastMidX = metrics.midX;
          lastMidY = metrics.midY;
          this.canvas.requestRenderAll();
        },
        { passive: false }
      );

      const endTouchGesture = (e) => {
        if (isTouchGesture && (!e.touches || e.touches.length < 2)) {
          isTouchGesture = false;
          if (savedDrawingMode) {
            const tool = window.Chalkboard.App && window.Chalkboard.App.activeTool;
            if (tool && ['chalk', 'pen', 'spray', 'highlighter'].includes(tool)) {
              this.canvas.isDrawingMode = true;
            }
            savedDrawingMode = false;
          }
        }
      };

      container.addEventListener('touchend', endTouchGesture, { passive: true });
      container.addEventListener('touchcancel', endTouchGesture, { passive: true });
    },

    bindPointerTracking() {
      // Native PointerEvent tracking for tablet/stylus pressure (KDE Drawy style)
      const upper = this.canvas.upperCanvasEl;
      if (!upper) return;

      const updatePressure = (e) => {
        if (typeof e.pressure === 'number' && e.pressure > 0) {
          this.currentPressure = e.pressure;
        } else if (e.pointerType === 'mouse') {
          this.currentPressure = 0.5;
        }
        this.updateStatusUI();
      };

      upper.addEventListener('pointerdown', updatePressure, { passive: true });
      upper.addEventListener('pointermove', updatePressure, { passive: true });
    },

    updateStatusUI() {
      const coordsEl = document.getElementById('coords-readout');
      const pressEl = document.getElementById('pressure-readout');
      if (coordsEl) {
        coordsEl.textContent = `${this.pointerWorld.x}, ${this.pointerWorld.y}`;
      }
      if (pressEl) {
        const pct = Math.round((this.currentPressure || 0.5) * 100);
        pressEl.textContent = `Pressure: ${pct}%`;
      }
    },

    updateZoomUI() {
      const readout = document.getElementById('btn-zoom-reset');
      if (readout) {
        readout.textContent = `${Math.round(this.canvas.getZoom() * 100)}%`;
      }
    },

    zoomBy(factor) {
      let zoom = this.canvas.getZoom() * factor;
      zoom = Math.min(Math.max(zoom, 0.1), 10);
      const center = {
        x: this.canvas.getWidth() / 2,
        y: this.canvas.getHeight() / 2,
      };
      this.canvas.zoomToPoint(center, zoom);
      this.updateZoomUI();
      this.canvas.requestRenderAll();
    },

    resetZoom() {
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      this.updateZoomUI();
      this.canvas.requestRenderAll();
    },

    zoomToFit() {
      const objs = this.canvas.getObjects().filter((o) => !o.isHelper);
      if (objs.length === 0) {
        this.resetZoom();
        return;
      }

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      objs.forEach((obj) => {
        const rect = obj.getBoundingRect(true, true);
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.left + rect.width);
        maxY = Math.max(maxY, rect.top + rect.height);
      });

      const contentW = Math.max(maxX - minX, 100);
      const contentH = Math.max(maxY - minY, 100);
      const pad = 120;
      const viewW = this.canvas.getWidth() - pad * 2;
      const viewH = this.canvas.getHeight() - pad * 2;

      let zoom = Math.min(viewW / contentW, viewH / contentH);
      zoom = Math.min(Math.max(zoom, 0.15), 2.5);

      const centerX = minX + contentW / 2;
      const centerY = minY + contentH / 2;
      const panX = this.canvas.getWidth() / 2 - centerX * zoom;
      const panY = this.canvas.getHeight() / 2 - centerY * zoom;

      this.canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
      this.updateZoomUI();
      this.canvas.requestRenderAll();
    },
  };

  window.Chalkboard.CanvasManager = CanvasManager;
})();
