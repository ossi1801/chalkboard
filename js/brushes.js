(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  // 1. Custom Fabric.js ChalkBrush extending fabric.PencilBrush
  fabric.ChalkBrush = fabric.util.createClass(fabric.PencilBrush, {
    type: 'ChalkBrush',
    chalkIntensity: 'chalk',

    initialize: function (canvas) {
      this.callSuper('initialize', canvas);
      this.decimate = 1.2;
      this.strokeLineCap = 'round';
      this.strokeLineJoin = 'round';
    },

    onMouseMove: function (pointer, options) {
      // Subtle chalk surface micro-grain while drawing
      const jitterAmount = this.chalkIntensity === 'heavy' ? 0.85 : 0.35;
      const jittered = new fabric.Point(
        pointer.x + (Math.random() - 0.5) * jitterAmount,
        pointer.y + (Math.random() - 0.5) * jitterAmount
      );
      this.callSuper('onMouseMove', jittered, options);
    },

    createPath: function (pathData) {
      const path = this.callSuper('createPath', pathData);
      const blur = this.chalkIntensity === 'heavy' ? Math.max(this.width * 1.4, 6) : Math.max(this.width * 0.75, 3);
      path.set({
        strokeUniform: true,
        chalkEffect: this.chalkIntensity,
        shadow: new fabric.Shadow({
          color: this.color,
          blur: blur,
          offsetX: 0,
          offsetY: 0,
        }),
      });
      if (this.dashArray && this.dashArray.length) {
        path.set('strokeDashArray', this.dashArray);
      }
      return path;
    },
  });

  // 2. Custom Fabric.js PressurePenBrush (KDE Drawy tablet pressure support)
  fabric.PressurePenBrush = fabric.util.createClass(fabric.PencilBrush, {
    type: 'PressurePenBrush',
    pressures: null,

    initialize: function (canvas) {
      this.callSuper('initialize', canvas);
      this.decimate = 2.0;
      this.pressures = [];
    },

    onMouseDown: function (pointer, options) {
      this.pressures = [];
      const p = window.Chalkboard.CanvasManager.currentPressure || 0.5;
      this.pressures.push(p);
      this.callSuper('onMouseDown', pointer, options);
    },

    onMouseMove: function (pointer, options) {
      const p = window.Chalkboard.CanvasManager.currentPressure || 0.5;
      this.pressures.push(p);
      // Dynamically adjust live brush width based on stylus pressure
      const baseW = (window.Chalkboard.Properties && window.Chalkboard.Properties.state.strokeWidth) || 4;
      const factor = 0.4 + p * 1.3;
      this.width = Math.max(1, baseW * factor);
      this.callSuper('onMouseMove', pointer, options);
    },

    createPath: function (pathData) {
      const path = this.callSuper('createPath', pathData);
      const baseW = (window.Chalkboard.Properties && window.Chalkboard.Properties.state.strokeWidth) || 4;
      let avgPressure = 0.5;
      if (this.pressures && this.pressures.length > 0) {
        const sum = this.pressures.reduce((a, b) => a + b, 0);
        avgPressure = sum / this.pressures.length;
      }
      const computedWidth = Math.max(1, Math.round(baseW * (0.45 + avgPressure * 1.2) * 10) / 10);
      path.set({
        strokeWidth: computedWidth,
        strokeUniform: true,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      });
      if (this.dashArray && this.dashArray.length) {
        path.set('strokeDashArray', this.dashArray);
      }
      return path;
    },
  });

  // 3. Custom Fabric.js HighlighterBrush extending fabric.PencilBrush
  fabric.HighlighterBrush = fabric.util.createClass(fabric.PencilBrush, {
    type: 'HighlighterBrush',

    initialize: function (canvas) {
      this.callSuper('initialize', canvas);
      this.decimate = 2.5;
      this.strokeLineCap = 'square';
      this.strokeLineJoin = 'bevel';
    },

    createPath: function (pathData) {
      const path = this.callSuper('createPath', pathData);
      path.set({
        strokeLineCap: 'square',
        strokeLineJoin: 'bevel',
        opacity: 0.38,
        strokeUniform: true,
      });
      return path;
    },
  });

  const BrushManager = {
    canvas: null,
    activeBrushType: null,
    isErasing: false,
    erasedTargets: null,
    laserPoints: [],
    isLasering: false,
    laserAnimId: null,

    init(canvas) {
      this.canvas = canvas;
      this.erasedTargets = new Set();

      // Ensure newly drawn paths get metadata and trigger auto-unlock if tool not locked
      canvas.on('path:created', (opt) => {
        const path = opt.path;
        if (!path) return;
        const props = window.Chalkboard.Properties.state;
        path.set({
          id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          opacity: this.activeBrushType === 'highlighter' ? 0.38 : props.opacity,
          dashMode: props.dashMode,
          chalkEffect: props.chalkEffect,
        });
        window.Chalkboard.Properties.applyEffectToObject(path, props);
        canvas.requestRenderAll();
      });

      this.bindEraserAndLaser();
    },

    activateBrush(toolName) {
      const canvas = this.canvas;
      const props = window.Chalkboard.Properties.state;
      this.activeBrushType = toolName;

      if (toolName === 'chalk') {
        canvas.isDrawingMode = true;
        const brush = new fabric.ChalkBrush(canvas);
        brush.color = props.strokeColor;
        brush.width = props.strokeWidth;
        brush.chalkIntensity = props.chalkEffect === 'clean' ? 'chalk' : props.chalkEffect;
        brush.dashArray = window.Chalkboard.Properties.getDashArray(props.dashMode, props.strokeWidth);
        brush.shadow = new fabric.Shadow({
          color: props.strokeColor,
          blur: props.chalkEffect === 'heavy' ? Math.max(props.strokeWidth * 1.4, 6) : Math.max(props.strokeWidth * 0.75, 3),
          offsetX: 0,
          offsetY: 0,
        });
        canvas.freeDrawingBrush = brush;
      } else if (toolName === 'pen') {
        canvas.isDrawingMode = true;
        const brush = new fabric.PressurePenBrush(canvas);
        brush.color = props.strokeColor;
        brush.width = props.strokeWidth;
        brush.dashArray = window.Chalkboard.Properties.getDashArray(props.dashMode, props.strokeWidth);
        if (props.chalkEffect !== 'clean') {
          brush.shadow = new fabric.Shadow({
            color: props.strokeColor,
            blur: Math.max(props.strokeWidth * 0.6, 2),
          });
        }
        canvas.freeDrawingBrush = brush;
      } else if (toolName === 'spray') {
        canvas.isDrawingMode = true;
        const brush = new fabric.SprayBrush(canvas);
        brush.color = props.strokeColor;
        brush.width = Math.max(props.strokeWidth * 4, 18);
        brush.density = 22;
        brush.dotWidth = Math.max(Math.round(props.strokeWidth * 0.45), 2);
        brush.dotWidthVariance = 2;
        brush.randomOpacity = true;
        brush.optimizeOverlapping = true;
        canvas.freeDrawingBrush = brush;
      } else if (toolName === 'highlighter') {
        canvas.isDrawingMode = true;
        const brush = new fabric.HighlighterBrush(canvas);
        brush.color = this.toTranslucentColor(props.strokeColor, 0.42);
        brush.width = Math.max(props.strokeWidth * 3.5, 18);
        canvas.freeDrawingBrush = brush;
      } else {
        canvas.isDrawingMode = false;
      }
    },

    syncActiveBrush() {
      if (this.canvas && this.canvas.isDrawingMode && this.activeBrushType) {
        this.activateBrush(this.activeBrushType);
      }
    },

    toTranslucentColor(colorStr, alpha) {
      try {
        const c = new fabric.Color(colorStr);
        const src = c.getSource();
        return `rgba(${src[0]}, ${src[1]}, ${src[2]}, ${alpha})`;
      } catch (e) {
        return colorStr;
      }
    },

    bindEraserAndLaser() {
      const canvas = this.canvas;

      canvas.on('mouse:down', (opt) => {
        if (window.Chalkboard.CanvasManager.isPanning) return;
        const tool = window.Chalkboard.App ? window.Chalkboard.App.activeTool : 'select';

        if (tool === 'eraser') {
          this.isErasing = true;
          this.erasedTargets.clear();
          this.eraseAtPointer(opt.e);
        } else if (tool === 'laser') {
          this.isLasering = true;
          this.addLaserPoint(opt.e);
          this.startLaserLoop();
        }
      });

      canvas.on('mouse:move', (opt) => {
        if (this.isErasing) {
          this.eraseAtPointer(opt.e);
        } else if (this.isLasering) {
          this.addLaserPoint(opt.e);
        }
      });

      canvas.on('mouse:up', () => {
        if (this.isErasing) {
          this.isErasing = false;
          if (this.erasedTargets.size > 0) {
            this.erasedTargets.forEach((obj) => {
              canvas.remove(obj);
            });
            this.erasedTargets.clear();
            canvas.requestRenderAll();
            window.Chalkboard.HistoryManager.scheduleSave();
          }
        }
        if (this.isLasering) {
          this.isLasering = false;
        }
      });
    },

    eraseAtPointer(e) {
      const canvas = this.canvas;
      const pointer = canvas.getPointer(e);
      const radius = 14 / canvas.getZoom();

      const objs = canvas.getObjects();
      for (let i = objs.length - 1; i >= 0; i--) {
        const obj = objs[i];
        if (obj.isHelper || obj.locked || this.erasedTargets.has(obj)) continue;

        const bound = obj.getBoundingRect(true, true);
        if (
          pointer.x + radius >= bound.left &&
          pointer.x - radius <= bound.left + bound.width &&
          pointer.y + radius >= bound.top &&
          pointer.y - radius <= bound.top + bound.height
        ) {
          if (obj.containsPoint(new fabric.Point(pointer.x, pointer.y), null, true) || this.pointNearObject(pointer, obj, radius)) {
            obj.set('opacity', 0.2);
            this.erasedTargets.add(obj);
            canvas.requestRenderAll();
          }
        }
      }
    },

    pointNearObject(pointer, obj, radius) {
      const center = obj.getCenterPoint();
      const dx = pointer.x - center.x;
      const dy = pointer.y - center.y;
      const bound = obj.getBoundingRect(true, true);
      const maxDim = Math.max(bound.width, bound.height) / 2 + radius;
      return Math.hypot(dx, dy) <= maxDim;
    },

    addLaserPoint(e) {
      this.laserPoints.push({
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      });
    },

    startLaserLoop() {
      if (this.laserAnimId) return;
      const hudCtx = window.Chalkboard.CanvasManager.hudCtx;
      const hudCanvas = window.Chalkboard.CanvasManager.hudCanvas;
      const trailDuration = 850;

      const renderTrail = (now) => {
        hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
        this.laserPoints = this.laserPoints.filter((pt) => now - pt.time < trailDuration);

        if (this.laserPoints.length > 1) {
          hudCtx.save();
          hudCtx.lineCap = 'round';
          hudCtx.lineJoin = 'round';

          for (let i = 1; i < this.laserPoints.length; i++) {
            const p0 = this.laserPoints[i - 1];
            const p1 = this.laserPoints[i];
            const age = (now - p1.time) / trailDuration;
            const alpha = Math.max(0, 1 - age);

            hudCtx.beginPath();
            hudCtx.moveTo(p0.x, p0.y);
            hudCtx.lineTo(p1.x, p1.y);
            hudCtx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.9})`;
            hudCtx.shadowColor = '#ef4444';
            hudCtx.shadowBlur = 12;
            hudCtx.lineWidth = 5 * (1 - age * 0.65);
            hudCtx.stroke();
          }

          // Bright laser tip
          const tip = this.laserPoints[this.laserPoints.length - 1];
          hudCtx.beginPath();
          hudCtx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
          hudCtx.fillStyle = '#ffffff';
          hudCtx.shadowColor = '#ef4444';
          hudCtx.shadowBlur = 16;
          hudCtx.fill();
          hudCtx.restore();
        }

        if (this.laserPoints.length > 0 || this.isLasering) {
          this.laserAnimId = requestAnimationFrame(renderTrail);
        } else {
          hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
          this.laserAnimId = null;
        }
      };

      this.laserAnimId = requestAnimationFrame(renderTrail);
    },
  };

  window.Chalkboard.BrushManager = BrushManager;
})();
