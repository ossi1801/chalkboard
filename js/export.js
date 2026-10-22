(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const ExportManager = {
    canvas: null,
    exportScale: 2,

    init(canvas) {
      this.canvas = canvas;
      this.bindUI();
    },

    bindUI() {
      const modal = document.getElementById('export-modal');
      const openBtn = document.getElementById('btn-export-modal');
      const closeBtn = document.getElementById('close-export-modal');

      if (openBtn && modal) {
        openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
      }
      if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
      }
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.add('hidden');
        });
      }

      const scaleBtns = document.querySelectorAll('#export-scale-group .seg-btn');
      scaleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          this.exportScale = parseInt(btn.getAttribute('data-scale'), 10) || 2;
          scaleBtns.forEach((b) => b.classList.toggle('active', b === btn));
        });
      });

      const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn.bind(this));
      };

      bindClick('modal-btn-png', () => this.exportPNG(this.getModalOptions()));
      bindClick('modal-btn-svg', () => this.exportSVG(this.getModalOptions()));
      bindClick('modal-btn-copy', () => this.copyPNGToClipboard(this.getModalOptions()));
      bindClick('modal-btn-json', () => this.saveProjectJSON());

      // Top menu shortcuts
      bindClick('menu-open-json', () => {
        const input = document.getElementById('file-input-json');
        if (input) input.click();
      });
      bindClick('menu-save-json', () => this.saveProjectJSON());
      bindClick('menu-export-png', () => this.exportPNG({ withBg: true, onlySelection: false, scale: 2 }));
      bindClick('menu-export-svg', () => this.exportSVG({ withBg: true }));
      bindClick('menu-copy-png', () => this.copyPNGToClipboard({ withBg: true, onlySelection: false, scale: 2 }));

      const jsonInput = document.getElementById('file-input-json');
      if (jsonInput) {
        jsonInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) this.loadJsonFile(file);
          jsonInput.value = '';
        });
      }
    },

    getModalOptions() {
      const withBgEl = document.getElementById('export-with-bg');
      const selEl = document.getElementById('export-only-selection');
      return {
        withBg: withBgEl ? withBgEl.checked : true,
        onlySelection: selEl ? selEl.checked : false,
        scale: this.exportScale || 2,
      };
    },

    getSanitizedTitle() {
      const raw = (document.getElementById('board-title') || {}).value || 'chalkboard';
      return raw.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'chalkboard';
    },

    computeExportBounds(onlySelection) {
      const canvas = this.canvas;
      let targets = [];
      if (onlySelection) {
        targets = window.Chalkboard.Properties.getSelectedTargets();
      }
      if (targets.length === 0) {
        targets = canvas.getObjects().filter((o) => !o.isHelper);
      }

      if (targets.length === 0) {
        return { left: 0, top: 0, width: canvas.getWidth(), height: canvas.getHeight() };
      }

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

      targets.forEach((obj) => {
        const r = obj.getBoundingRect(true, true);
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.left + r.width);
        maxY = Math.max(maxY, r.top + r.height);
      });

      const pad = 40;
      return {
        left: minX - pad,
        top: minY - pad,
        width: Math.max(maxX - minX + pad * 2, 64),
        height: Math.max(maxY - minY + pad * 2, 64),
      };
    },

    generatePNGDataURL(opts = {}) {
      const canvas = this.canvas;
      const withBg = opts.withBg !== false;
      const scale = opts.scale || 2;
      const prevVpt = canvas.viewportTransform.slice();
      const prevGrid = window.Chalkboard.CanvasManager.gridMode;
      const prevBg = canvas.backgroundColor;

      // Temporarily reset viewport transform so world coordinates map 1:1
      canvas.discardActiveObject();
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      const bounds = this.computeExportBounds(opts.onlySelection);

      if (!withBg) {
        window.Chalkboard.CanvasManager.gridMode = 'none';
        canvas.backgroundColor = 'rgba(0,0,0,0)';
      }

      // If transparent background requested, temporarily bypass solid background fill in before:render
      const origTheme = window.Chalkboard.CanvasManager.getThemeConfig;
      if (!withBg) {
        window.Chalkboard.CanvasManager.getThemeConfig = () => ({
          bg: 'rgba(0,0,0,0)',
          grid: 'rgba(0,0,0,0)',
          gridMajor: 'rgba(0,0,0,0)',
        });
      }

      const dataUrl = canvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: scale,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });

      // Restore state
      window.Chalkboard.CanvasManager.getThemeConfig = origTheme;
      window.Chalkboard.CanvasManager.gridMode = prevGrid;
      canvas.backgroundColor = prevBg;
      canvas.setViewportTransform(prevVpt);
      canvas.requestRenderAll();

      return dataUrl;
    },

    exportPNG(opts = {}) {
      const dataUrl = this.generatePNGDataURL(opts);
      this.triggerDownload(dataUrl, `${this.getSanitizedTitle()}.png`);
      window.Chalkboard.App.showToast('Exported PNG image');
    },

    exportSVG(opts = {}) {
      const canvas = this.canvas;
      const bounds = this.computeExportBounds(opts.onlySelection);
      const svgStr = canvas.toSVG({
        viewBox: {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        },
        width: `${Math.round(bounds.width)}px`,
        height: `${Math.round(bounds.height)}px`,
      });

      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      this.triggerDownload(url, `${this.getSanitizedTitle()}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      window.Chalkboard.App.showToast('Exported SVG vector');
    },

    async copyPNGToClipboard(opts = {}) {
      try {
        const dataUrl = this.generatePNGDataURL(opts);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        window.Chalkboard.App.showToast('Copied PNG to clipboard!');
      } catch (err) {
        console.warn('Clipboard copy failed:', err);
        window.Chalkboard.App.showToast('Clipboard copy unsupported in this context — downloading PNG');
        this.exportPNG(opts);
      }
    },

    saveProjectJSON() {
      const jsonStr = window.Chalkboard.HistoryManager.serializeCanvas();
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      this.triggerDownload(url, `${this.getSanitizedTitle()}.chalkboard`);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      window.Chalkboard.App.showToast('Saved .chalkboard project');
    },

    loadJsonFile(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target || !e.target.result) return;
        window.Chalkboard.HistoryManager.restoreSnapshot(e.target.result, () => {
          window.Chalkboard.HistoryManager.pushState(true);
          window.Chalkboard.App.showToast(`Loaded ${file.name}`);
        });
      };
      reader.readAsText(file);
    },

    triggerDownload(href, filename) {
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  };

  window.Chalkboard.ExportManager = ExportManager;
})();
