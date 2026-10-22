(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const FONT_STACKS = {
    chalk: '"Comic Sans MS", "Bradley Hand", "Chalkboard SE", "Segoe Print", cursive, sans-serif',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, monospace',
  };

  const Properties = {
    canvas: null,
    state: {
      strokeColor: '#f8fafc',
      fillColor: 'transparent',
      strokeWidth: 4,
      dashMode: 'solid',
      chalkEffect: 'chalk',
      cornerMode: 'round',
      arrowMode: 'single',
      fontMode: 'chalk',
      fontSize: 24,
      opacity: 1,
    },

    init(canvas) {
      this.canvas = canvas;
      this.bindUI();
      this.bindSelectionSync();
    },

    getFontStack(mode) {
      return FONT_STACKS[mode] || FONT_STACKS.chalk;
    },

    getDashArray(dashMode, width) {
      const w = Math.max(width || 4, 2);
      if (dashMode === 'dashed') {
        return [w * 3, w * 2];
      }
      if (dashMode === 'dotted') {
        return [w * 0.6, w * 2.2];
      }
      return null;
    },

    applyEffectToObject(obj, props) {
      if (!obj) return;
      const effect = props.chalkEffect || 'chalk';
      const strokeCol = obj.stroke || obj.fill || props.strokeColor || '#f8fafc';
      const w = obj.strokeWidth || 4;

      if (effect === 'clean') {
        if (obj.shapeKind !== 'sticky') {
          obj.set('shadow', null);
        }
      } else if (effect === 'chalk') {
        obj.set(
          'shadow',
          new fabric.Shadow({
            color: strokeCol,
            blur: Math.max(w * 0.7, 3),
            offsetX: 0,
            offsetY: 0,
          })
        );
      } else if (effect === 'heavy') {
        obj.set(
          'shadow',
          new fabric.Shadow({
            color: strokeCol,
            blur: Math.max(w * 1.6, 8),
            offsetX: 0,
            offsetY: 0,
          })
        );
      }
    },

    getSelectedTargets() {
      const active = this.canvas.getActiveObject();
      if (!active) return [];
      if (active.type === 'activeSelection') {
        return active.getObjects();
      }
      return [active];
    },

    applyToSelection(updater) {
      const targets = this.getSelectedTargets();
      if (targets.length === 0) return;

      targets.forEach((obj) => {
        updater(obj);
      });

      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
    },

    bindUI() {
      // Stroke Swatches & Color Picker
      const strokeSwatches = document.querySelectorAll('#stroke-swatches .swatch');
      const strokeInput = document.getElementById('input-stroke-color');

      const setStrokeColor = (color) => {
        this.state.strokeColor = color;
        strokeSwatches.forEach((b) =>
          b.classList.toggle('active', b.getAttribute('data-color') === color)
        );
        if (strokeInput && color.startsWith('#')) {
          strokeInput.value = color;
        }
        window.Chalkboard.BrushManager.syncActiveBrush();

        this.applyToSelection((obj) => {
          if (obj.type === 'i-text' || obj.type === 'textbox' || obj.shapeKind === 'text') {
            if (obj.shapeKind === 'sticky') {
              obj.set('fill', color);
            } else {
              obj.set('fill', color);
            }
          } else {
            obj.set('stroke', color);
          }
          if (obj.chalkEffect && obj.chalkEffect !== 'clean') {
            this.applyEffectToObject(obj, {
              chalkEffect: obj.chalkEffect,
              strokeColor: color,
            });
          }
        });
      };

      strokeSwatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          setStrokeColor(btn.getAttribute('data-color'));
        });
      });

      if (strokeInput) {
        strokeInput.addEventListener('input', (e) => {
          setStrokeColor(e.target.value);
        });
      }

      // Fill Swatches & Color Picker
      const fillSwatches = document.querySelectorAll('#fill-swatches .swatch');
      const fillInput = document.getElementById('input-fill-color');

      const setFillColor = (fill) => {
        this.state.fillColor = fill;
        fillSwatches.forEach((b) =>
          b.classList.toggle('active', b.getAttribute('data-fill') === fill)
        );
        this.applyToSelection((obj) => {
          if (obj.shapeKind === 'sticky') {
            obj.set('backgroundColor', fill === 'transparent' ? '#fef08a' : fill);
          } else if (
            obj.type !== 'line' &&
            obj.shapeKind !== 'arrow' &&
            obj.type !== 'path' &&
            obj.type !== 'i-text'
          ) {
            obj.set('fill', fill === 'transparent' ? 'rgba(0,0,0,0)' : fill);
          }
        });
      };

      fillSwatches.forEach((btn) => {
        btn.addEventListener('click', () => {
          setFillColor(btn.getAttribute('data-fill'));
        });
      });

      if (fillInput) {
        fillInput.addEventListener('input', (e) => {
          setFillColor(e.target.value);
        });
      }

      // Stroke Width Presets & Slider
      const widthBtns = document.querySelectorAll('#stroke-width-presets .seg-btn');
      const widthSlider = document.getElementById('input-stroke-width');
      const widthLabel = document.getElementById('label-stroke-width');

      const setStrokeWidth = (w) => {
        const width = Math.max(1, parseInt(w, 10) || 4);
        this.state.strokeWidth = width;
        if (widthSlider) widthSlider.value = width;
        if (widthLabel) widthLabel.textContent = `${width}px`;
        widthBtns.forEach((b) =>
          b.classList.toggle('active', parseInt(b.getAttribute('data-width'), 10) === width)
        );

        window.Chalkboard.BrushManager.syncActiveBrush();

        this.applyToSelection((obj) => {
          if (obj.type !== 'i-text' && obj.type !== 'textbox') {
            obj.set('strokeWidth', width);
            if (obj.dashMode) {
              obj.set('strokeDashArray', this.getDashArray(obj.dashMode, width));
            }
          }
        });
      };

      widthBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          setStrokeWidth(btn.getAttribute('data-width'));
        });
      });

      if (widthSlider) {
        widthSlider.addEventListener('input', (e) => {
          setStrokeWidth(e.target.value);
        });
      }

      // Dash Mode
      const dashBtns = document.querySelectorAll('#stroke-style-group .seg-btn');
      dashBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const dash = btn.getAttribute('data-dash');
          this.state.dashMode = dash;
          dashBtns.forEach((b) => b.classList.toggle('active', b === btn));
          window.Chalkboard.BrushManager.syncActiveBrush();

          this.applyToSelection((obj) => {
            obj.set({
              dashMode: dash,
              strokeDashArray: this.getDashArray(dash, obj.strokeWidth || this.state.strokeWidth),
            });
          });
        });
      });

      // Chalk Texture Effect
      const chalkBtns = document.querySelectorAll('#chalk-effect-group .seg-btn');
      chalkBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const effect = btn.getAttribute('data-chalk');
          this.state.chalkEffect = effect;
          chalkBtns.forEach((b) => b.classList.toggle('active', b === btn));
          window.Chalkboard.BrushManager.syncActiveBrush();

          this.applyToSelection((obj) => {
            obj.set('chalkEffect', effect);
            this.applyEffectToObject(obj, {
              chalkEffect: effect,
              strokeColor: obj.stroke || obj.fill || this.state.strokeColor,
            });
          });
        });
      });

      // Corners & Arrowheads
      const cornerBtns = document.querySelectorAll('#corner-style-group .seg-btn[data-corners]');
      cornerBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-corners');
          this.state.cornerMode = mode;
          cornerBtns.forEach((b) => b.classList.toggle('active', b === btn));

          this.applyToSelection((obj) => {
            if (obj.type === 'rect') {
              const r = mode === 'round' ? 10 : 0;
              obj.set({ rx: r, ry: r, cornerMode: mode });
            }
          });
        });
      });

      const arrowBtn = document.getElementById('btn-arrow-mode');
      if (arrowBtn) {
        arrowBtn.addEventListener('click', () => {
          const next = this.state.arrowMode === 'single' ? 'double' : 'single';
          this.state.arrowMode = next;
          arrowBtn.setAttribute('data-arrow-mode', next);
          arrowBtn.textContent = next === 'double' ? '2-Way' : '1-Way';
          arrowBtn.classList.toggle('active', next === 'double');
        });
      }

      // Typography
      const fontBtns = document.querySelectorAll('#font-family-group .seg-btn');
      const fontSizeSlider = document.getElementById('input-font-size');
      const fontSizeLabel = document.getElementById('label-font-size');

      fontBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const fMode = btn.getAttribute('data-font');
          this.state.fontMode = fMode;
          fontBtns.forEach((b) => b.classList.toggle('active', b === btn));

          this.applyToSelection((obj) => {
            if (obj.type === 'i-text' || obj.type === 'textbox') {
              obj.set({
                fontMode: fMode,
                fontFamily: this.getFontStack(fMode),
              });
            }
          });
        });
      });

      if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
          const sz = parseInt(e.target.value, 10) || 24;
          this.state.fontSize = sz;
          if (fontSizeLabel) fontSizeLabel.textContent = `${sz}px`;

          this.applyToSelection((obj) => {
            if (obj.type === 'i-text' || obj.type === 'textbox') {
              obj.set('fontSize', sz);
            }
          });
        });
      }

      // Opacity
      const opacitySlider = document.getElementById('input-opacity');
      const opacityLabel = document.getElementById('label-opacity');
      if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
          const pct = parseInt(e.target.value, 10) || 100;
          this.state.opacity = pct / 100;
          if (opacityLabel) opacityLabel.textContent = `${pct}%`;

          this.applyToSelection((obj) => {
            obj.set('opacity', pct / 100);
          });
        });
      }
    },

    bindSelectionSync() {
      const syncFromObject = () => {
        const targets = this.getSelectedTargets();
        if (targets.length === 0) return;
        const obj = targets[0];

        // Update lock button label
        const lockBtn = document.getElementById('act-lock');
        if (lockBtn) {
          lockBtn.textContent = obj.locked ? 'Unlock' : 'Lock';
          lockBtn.classList.toggle('active', !!obj.locked);
        }

        if (typeof obj.opacity === 'number') {
          const pct = Math.round(obj.opacity * 100);
          const opSlider = document.getElementById('input-opacity');
          const opLabel = document.getElementById('label-opacity');
          if (opSlider) opSlider.value = pct;
          if (opLabel) opLabel.textContent = `${pct}%`;
        }

        if (obj.strokeWidth && obj.type !== 'i-text') {
          const w = Math.round(obj.strokeWidth);
          const wSlider = document.getElementById('input-stroke-width');
          const wLabel = document.getElementById('label-stroke-width');
          if (wSlider) wSlider.value = w;
          if (wLabel) wLabel.textContent = `${w}px`;
        }

        if (obj.fontSize && (obj.type === 'i-text' || obj.type === 'textbox')) {
          const sz = Math.round(obj.fontSize);
          const fSlider = document.getElementById('input-font-size');
          const fLabel = document.getElementById('label-font-size');
          if (fSlider) fSlider.value = sz;
          if (fLabel) fLabel.textContent = `${sz}px`;
        }
      };

      this.canvas.on('selection:created', syncFromObject);
      this.canvas.on('selection:updated', syncFromObject);
      this.canvas.on('selection:cleared', () => {
        const lockBtn = document.getElementById('act-lock');
        if (lockBtn) {
          lockBtn.textContent = 'Lock';
          lockBtn.classList.remove('active');
        }
      });
    },
  };

  window.Chalkboard.Properties = Properties;
})();
