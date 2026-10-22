(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const SHAPE_TOOLS = new Set(['rect', 'diamond', 'ellipse', 'line', 'arrow']);

  const ShapeManager = {
    canvas: null,
    isDrawingShape: false,
    startX: 0,
    startY: 0,
    activeShape: null,
    activeTool: null,

    init(canvas) {
      this.canvas = canvas;
      this.bindEvents();
      this.bindDropAndPasteImages();
    },

    bindEvents() {
      const canvas = this.canvas;

      canvas.on('mouse:down', (opt) => {
        if (window.Chalkboard.CanvasManager.isPanning) return;
        const e = opt.e;
        if (e.button && e.button !== 0) return;

        const tool = window.Chalkboard.App ? window.Chalkboard.App.activeTool : 'select';
        const pointer = canvas.getPointer(e);

        if (tool === 'text') {
          if (opt.target && (opt.target.type === 'i-text' || opt.target.type === 'textbox')) {
            canvas.setActiveObject(opt.target);
            opt.target.enterEditing();
            return;
          }
          this.createTextAt(pointer.x, pointer.y);
          return;
        }

        if (tool === 'sticky') {
          this.createStickyNoteAt(pointer.x, pointer.y);
          return;
        }

        if (!SHAPE_TOOLS.has(tool)) return;

        this.isDrawingShape = true;
        this.activeTool = tool;
        this.startX = pointer.x;
        this.startY = pointer.y;

        const props = window.Chalkboard.Properties.state;
        const baseOpts = this.getBaseShapeOptions(props);

        if (tool === 'rect') {
          const radius = props.cornerMode === 'round' ? 10 : 0;
          this.activeShape = new fabric.Rect(
            Object.assign({}, baseOpts, {
              left: this.startX,
              top: this.startY,
              width: 1,
              height: 1,
              rx: radius,
              ry: radius,
              shapeKind: 'rect',
            })
          );
        } else if (tool === 'ellipse') {
          this.activeShape = new fabric.Ellipse(
            Object.assign({}, baseOpts, {
              left: this.startX,
              top: this.startY,
              rx: 1,
              ry: 1,
              shapeKind: 'ellipse',
            })
          );
        } else if (tool === 'diamond') {
          this.activeShape = new fabric.Polygon(
            this.getDiamondPoints(2, 2),
            Object.assign({}, baseOpts, {
              left: this.startX,
              top: this.startY,
              shapeKind: 'diamond',
            })
          );
        } else if (tool === 'line') {
          this.activeShape = new fabric.Line(
            [this.startX, this.startY, this.startX + 1, this.startY + 1],
            Object.assign({}, baseOpts, {
              fill: null,
              shapeKind: 'line',
            })
          );
        } else if (tool === 'arrow') {
          this.activeShape = new fabric.Path(
            this.buildArrowPathData(this.startX, this.startY, this.startX + 2, this.startY + 2, props.strokeWidth, props.arrowMode),
            Object.assign({}, baseOpts, {
              fill: null,
              shapeKind: 'arrow',
              arrowMode: props.arrowMode,
            })
          );
        }

        if (this.activeShape) {
          this.activeShape.isHelper = true;
          window.Chalkboard.Properties.applyEffectToObject(this.activeShape, props);
          canvas.add(this.activeShape);
          canvas.requestRenderAll();
        }
      });

      canvas.on('mouse:move', (opt) => {
        if (!this.isDrawingShape || !this.activeShape) return;
        const e = opt.e;
        const pointer = canvas.getPointer(e);
        const shift = e.shiftKey;

        let curX = pointer.x;
        let curY = pointer.y;

        if (this.activeTool === 'line' || this.activeTool === 'arrow') {
          if (shift) {
            const snapped = this.snapAngle(this.startX, this.startY, curX, curY);
            curX = snapped.x;
            curY = snapped.y;
          }

          if (this.activeTool === 'line') {
            this.activeShape.set({ x2: curX, y2: curY });
          } else {
            const props = window.Chalkboard.Properties.state;
            const d = this.buildArrowPathData(
              this.startX,
              this.startY,
              curX,
              curY,
              props.strokeWidth,
              props.arrowMode
            );
            canvas.remove(this.activeShape);
            const baseOpts = this.getBaseShapeOptions(props);
            this.activeShape = new fabric.Path(
              d,
              Object.assign({}, baseOpts, {
                fill: null,
                shapeKind: 'arrow',
                arrowMode: props.arrowMode,
                isHelper: true,
              })
            );
            window.Chalkboard.Properties.applyEffectToObject(this.activeShape, props);
            canvas.add(this.activeShape);
          }
          canvas.requestRenderAll();
          return;
        }

        let left = Math.min(this.startX, curX);
        let top = Math.min(this.startY, curY);
        let w = Math.abs(curX - this.startX);
        let h = Math.abs(curY - this.startY);

        if (shift) {
          const maxSide = Math.max(w, h);
          w = maxSide;
          h = maxSide;
          left = curX < this.startX ? this.startX - maxSide : this.startX;
          top = curY < this.startY ? this.startY - maxSide : this.startY;
        }

        if (this.activeTool === 'rect') {
          this.activeShape.set({
            left: left,
            top: top,
            width: Math.max(w, 2),
            height: Math.max(h, 2),
          });
        } else if (this.activeTool === 'ellipse') {
          this.activeShape.set({
            left: left,
            top: top,
            rx: Math.max(w / 2, 1),
            ry: Math.max(h / 2, 1),
          });
        } else if (this.activeTool === 'diamond') {
          const props = window.Chalkboard.Properties.state;
          const baseOpts = this.getBaseShapeOptions(props);
          canvas.remove(this.activeShape);
          this.activeShape = new fabric.Polygon(
            this.getDiamondPoints(Math.max(w, 4), Math.max(h, 4)),
            Object.assign({}, baseOpts, {
              left: left,
              top: top,
              shapeKind: 'diamond',
              isHelper: true,
            })
          );
          window.Chalkboard.Properties.applyEffectToObject(this.activeShape, props);
          canvas.add(this.activeShape);
        }

        canvas.requestRenderAll();
      });

      canvas.on('mouse:up', () => {
        if (!this.isDrawingShape || !this.activeShape) return;
        this.isDrawingShape = false;

        const shape = this.activeShape;
        this.activeShape = null;
        delete shape.isHelper;

        // Discard tiny accidental clicks (< 4px)
        const bound = shape.getBoundingRect(true, true);
        if (bound.width < 4 && bound.height < 4) {
          canvas.remove(shape);
          canvas.requestRenderAll();
          return;
        }

        shape.set({
          id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          selectable: true,
          evented: true,
        });
        shape.setCoords();

        window.Chalkboard.HistoryManager.scheduleSave();

        if (window.Chalkboard.App && !window.Chalkboard.App.toolLocked) {
          window.Chalkboard.App.setTool('select');
          canvas.setActiveObject(shape);
        }
        canvas.requestRenderAll();
      });

      // Double-click sticky note to edit its text
      canvas.on('mouse:dblclick', (opt) => {
        const target = opt.target;
        if (target && target.shapeKind === 'sticky') {
          this.promptEditSticky(target);
        } else if (!target && window.Chalkboard.App && window.Chalkboard.App.activeTool === 'select') {
          const pointer = canvas.getPointer(opt.e);
          this.createTextAt(pointer.x, pointer.y);
        }
      });
    },

    getBaseShapeOptions(props) {
      return {
        stroke: props.strokeColor,
        fill: props.fillColor === 'transparent' ? 'rgba(0,0,0,0)' : props.fillColor,
        strokeWidth: props.strokeWidth,
        strokeDashArray: window.Chalkboard.Properties.getDashArray(props.dashMode, props.strokeWidth),
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeUniform: true,
        opacity: props.opacity,
        dashMode: props.dashMode,
        chalkEffect: props.chalkEffect,
        cornerMode: props.cornerMode,
        selectable: false,
        evented: false,
      };
    },

    getDiamondPoints(w, h) {
      return [
        { x: w / 2, y: 0 },
        { x: w, y: h / 2 },
        { x: w / 2, y: h },
        { x: 0, y: h / 2 },
      ];
    },

    buildArrowPathData(x1, y1, x2, y2, strokeW, arrowMode) {
      const headLen = Math.max(strokeW * 3.5, 14);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const spread = Math.PI / 6.5;

      const ax1 = x2 - headLen * Math.cos(angle - spread);
      const ay1 = y2 - headLen * Math.sin(angle - spread);
      const ax2 = x2 - headLen * Math.cos(angle + spread);
      const ay2 = y2 - headLen * Math.sin(angle + spread);

      let d = `M ${x1} ${y1} L ${x2} ${y2} M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2}`;

      if (arrowMode === 'double') {
        const bx1 = x1 + headLen * Math.cos(angle - spread);
        const by1 = y1 + headLen * Math.sin(angle - spread);
        const bx2 = x1 + headLen * Math.cos(angle + spread);
        const by2 = y1 + headLen * Math.sin(angle + spread);
        d += ` M ${bx1} ${by1} L ${x1} ${y1} L ${bx2} ${by2}`;
      }
      return d;
    },

    snapAngle(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy);
      const step = Math.PI / 12; // 15 degree increments
      const angle = Math.round(Math.atan2(dy, dx) / step) * step;
      return {
        x: x1 + Math.cos(angle) * dist,
        y: y1 + Math.sin(angle) * dist,
      };
    },

    createTextAt(x, y, initialString) {
      const props = window.Chalkboard.Properties.state;
      const fontFamily = window.Chalkboard.Properties.getFontStack(props.fontMode);

      const textObj = new fabric.IText(initialString || 'Type here...', {
        id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        left: x,
        top: y,
        fontFamily: fontFamily,
        fontSize: props.fontSize || 24,
        fill: props.strokeColor,
        opacity: props.opacity,
        fontMode: props.fontMode,
        chalkEffect: props.chalkEffect,
        shapeKind: 'text',
      });

      window.Chalkboard.Properties.applyEffectToObject(textObj, props);
      this.canvas.add(textObj);
      this.canvas.setActiveObject(textObj);

      if (!initialString) {
        textObj.enterEditing();
        textObj.selectAll();
      }

      if (window.Chalkboard.App && !window.Chalkboard.App.toolLocked) {
        window.Chalkboard.App.setTool('select');
      }
      this.canvas.requestRenderAll();
      return textObj;
    },

    createStickyNoteAt(x, y, customText) {
      const props = window.Chalkboard.Properties.state;
      const noteFill =
        props.fillColor && props.fillColor !== 'transparent'
          ? props.fillColor
          : '#fef08a';

      const noteObj = new fabric.Textbox(
        customText || 'Sticky Note\nDouble-click to edit',
        {
          id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          left: x - 90,
          top: y - 60,
          width: 190,
          fontSize: 18,
          fontFamily: window.Chalkboard.Properties.getFontStack('chalk'),
          fontMode: 'chalk',
          fill: '#0f172a',
          backgroundColor: noteFill,
          padding: 14,
          textAlign: 'center',
          splitByGrapheme: false,
          shapeKind: 'sticky',
          shadow: new fabric.Shadow({
            color: 'rgba(0, 0, 0, 0.38)',
            blur: 14,
            offsetX: 0,
            offsetY: 6,
          }),
        }
      );

      this.canvas.add(noteObj);
      this.canvas.setActiveObject(noteObj);

      if (window.Chalkboard.App && !window.Chalkboard.App.toolLocked) {
        window.Chalkboard.App.setTool('select');
      }
      window.Chalkboard.HistoryManager.scheduleSave();
      this.canvas.requestRenderAll();
      return noteObj;
    },

    promptEditSticky(stickyObj) {
      if (stickyObj.type === 'textbox' || stickyObj.type === 'i-text') {
        stickyObj.enterEditing();
        return;
      }
    },

    insertImageFromDataURL(dataUrl, x, y) {
      fabric.Image.fromURL(
        dataUrl,
        (img) => {
          if (!img) return;
          const maxDim = 480;
          if (img.width > maxDim || img.height > maxDim) {
            const scale = maxDim / Math.max(img.width, img.height);
            img.scale(scale);
          }

          const vpt = this.canvas.viewportTransform;
          const zoom = this.canvas.getZoom();
          const cx = typeof x === 'number' ? x : (this.canvas.getWidth() / 2 - vpt[4]) / zoom;
          const cy = typeof y === 'number' ? y : (this.canvas.getHeight() / 2 - vpt[5]) / zoom;

          img.set({
            id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            left: cx - img.getScaledWidth() / 2,
            top: cy - img.getScaledHeight() / 2,
            shapeKind: 'image',
          });

          this.canvas.add(img);
          this.canvas.setActiveObject(img);
          if (window.Chalkboard.App) {
            window.Chalkboard.App.setTool('select');
          }
          window.Chalkboard.HistoryManager.scheduleSave();
          this.canvas.requestRenderAll();
        },
        { crossOrigin: 'anonymous' }
      );
    },

    bindDropAndPasteImages() {
      const fileInput = document.getElementById('file-input-image');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          this.readImageFile(file);
          fileInput.value = '';
        });
      }

      // Drag and drop images or .chalkboard JSON files onto canvas
      window.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      window.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (file.type.startsWith('image/')) {
          const pointer = this.canvas.getPointer(e);
          this.readImageFile(file, pointer.x, pointer.y);
        } else if (file.name.endsWith('.chalkboard') || file.name.endsWith('.json')) {
          window.Chalkboard.ExportManager.loadJsonFile(file);
        }
      });

      // Clipboard image paste
      window.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              this.readImageFile(file);
              e.preventDefault();
              return;
            }
          }
        }
      });
    },

    readImageFile(file, x, y) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target && ev.target.result) {
          this.insertImageFromDataURL(ev.target.result, x, y);
        }
      };
      reader.readAsDataURL(file);
    },
  };

  window.Chalkboard.ShapeManager = ShapeManager;
})();
