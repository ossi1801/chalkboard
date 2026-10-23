(function () {
  'use strict';

  window.Chalkboard = window.Chalkboard || {};

  const ObjectActions = {
    canvas: null,
    clipboard: null,

    init(canvas) {
      this.canvas = canvas;
      this.bindUI();
      this.bindSelectionEvents();
    },

    bindUI() {
      const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn.bind(this));
      };

      bindClick('act-send-back', this.sendToBack);
      bindClick('act-send-backward', this.sendBackward);
      bindClick('act-bring-forward', this.bringForward);
      bindClick('act-bring-front', this.bringToFront);

      bindClick('align-left', () => this.alignSelection('left'));
      bindClick('align-center', () => this.alignSelection('center'));
      bindClick('align-right', () => this.alignSelection('right'));
      bindClick('align-top', () => this.alignSelection('top'));
      bindClick('align-middle', () => this.alignSelection('middle'));
      bindClick('align-bottom', () => this.alignSelection('bottom'));

      bindClick('act-group', this.groupSelection);
      bindClick('act-ungroup', this.ungroupSelection);
      bindClick('act-duplicate', this.duplicateSelection);
      bindClick('act-lock', this.toggleLockSelection);
      bindClick('act-delete', this.deleteSelection);
      bindClick('btn-delete-selected', this.deleteSelection);
    },

    bindSelectionEvents() {
      const sync = () => this.syncSelectionRibbon();
      this.canvas.on('selection:created', sync);
      this.canvas.on('selection:updated', sync);
      this.canvas.on('selection:cleared', sync);
      this.canvas.on('object:removed', sync);
    },

    syncSelectionRibbon() {
      const deleteBtn = document.getElementById('btn-delete-selected');
      if (!deleteBtn) return;
      const active = this.canvas && this.canvas.getActiveObject();
      deleteBtn.classList.toggle('hidden', !active);
    },

    sendToBack() {
      const active = this.canvas.getActiveObject();
      if (!active) return;
      this.canvas.sendToBack(active);
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
    },

    sendBackward() {
      const active = this.canvas.getActiveObject();
      if (!active) return;
      this.canvas.sendBackwards(active);
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
    },

    bringForward() {
      const active = this.canvas.getActiveObject();
      if (!active) return;
      this.canvas.bringForward(active);
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
    },

    bringToFront() {
      const active = this.canvas.getActiveObject();
      if (!active) return;
      this.canvas.bringToFront(active);
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
    },

    groupSelection() {
      const active = this.canvas.getActiveObject();
      if (!active || active.type !== 'activeSelection') {
        window.Chalkboard.App.showToast('Select 2 or more elements to group');
        return;
      }
      const group = active.toGroup();
      group.set({
        id: 'group_' + Date.now(),
        shapeKind: 'group',
      });
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
      window.Chalkboard.App.showToast('Grouped selection');
    },

    ungroupSelection() {
      const active = this.canvas.getActiveObject();
      if (!active || active.type !== 'group' || active.shapeKind === 'sticky') {
        window.Chalkboard.App.showToast('Select a group to ungroup');
        return;
      }
      active.toActiveSelection();
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
      window.Chalkboard.App.showToast('Ungrouped elements');
    },

    alignSelection(mode) {
      const active = this.canvas.getActiveObject();
      if (!active) return;

      if (active.type === 'activeSelection') {
        const objs = active.getObjects();
        const boxW = active.width;
        const boxH = active.height;

        objs.forEach((obj) => {
          const bound = obj.getBoundingRect(false, true);
          const objW = obj.getScaledWidth();
          const objH = obj.getScaledHeight();

          if (mode === 'left') {
            obj.set('left', -boxW / 2);
          } else if (mode === 'center') {
            obj.set('left', -objW / 2);
          } else if (mode === 'right') {
            obj.set('left', boxW / 2 - objW);
          } else if (mode === 'top') {
            obj.set('top', -boxH / 2);
          } else if (mode === 'middle') {
            obj.set('top', -objH / 2);
          } else if (mode === 'bottom') {
            obj.set('top', boxH / 2 - objH);
          }
          obj.setCoords();
          void bound;
        });

        active.addWithUpdate();
        this.canvas.requestRenderAll();
        window.Chalkboard.HistoryManager.scheduleSave();
      } else {
        // Align single object relative to current viewport center
        const vpt = this.canvas.viewportTransform;
        const zoom = this.canvas.getZoom();
        const viewLeft = -vpt[4] / zoom;
        const viewTop = -vpt[5] / zoom;
        const viewW = this.canvas.getWidth() / zoom;
        const viewH = this.canvas.getHeight() / zoom;
        const objW = active.getScaledWidth();
        const objH = active.getScaledHeight();

        if (mode === 'center') {
          active.set('left', viewLeft + (viewW - objW) / 2);
        } else if (mode === 'middle') {
          active.set('top', viewTop + (viewH - objH) / 2);
        }
        active.setCoords();
        this.canvas.requestRenderAll();
        window.Chalkboard.HistoryManager.scheduleSave();
      }
    },

    copySelection() {
      const active = this.canvas.getActiveObject();
      if (!active) return;
      active.clone((cloned) => {
        this.clipboard = cloned;
        window.Chalkboard.App.showToast('Copied to clipboard');
      });
    },

    pasteSelection() {
      if (!this.clipboard) return;
      this.clipboard.clone((clonedObj) => {
        this.canvas.discardActiveObject();
        clonedObj.set({
          left: clonedObj.left + 24,
          top: clonedObj.top + 24,
          evented: true,
        });

        if (clonedObj.type === 'activeSelection') {
          clonedObj.canvas = this.canvas;
          clonedObj.forEachObject((obj) => {
            obj.set('id', 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
            this.canvas.add(obj);
          });
          clonedObj.setCoords();
        } else {
          clonedObj.set('id', 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
          this.canvas.add(clonedObj);
        }

        this.clipboard.top += 24;
        this.clipboard.left += 24;
        this.canvas.setActiveObject(clonedObj);
        this.canvas.requestRenderAll();
        window.Chalkboard.HistoryManager.scheduleSave();
      });
    },

    duplicateSelection() {
      const active = this.canvas.getActiveObject();
      if (!active) return;
      active.clone((clonedObj) => {
        this.canvas.discardActiveObject();
        clonedObj.set({
          left: active.left + 24,
          top: active.top + 24,
          evented: true,
        });

        if (clonedObj.type === 'activeSelection') {
          clonedObj.canvas = this.canvas;
          clonedObj.forEachObject((obj) => {
            obj.set('id', 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
            this.canvas.add(obj);
          });
          clonedObj.setCoords();
        } else {
          clonedObj.set('id', 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
          this.canvas.add(clonedObj);
        }

        this.canvas.setActiveObject(clonedObj);
        this.canvas.requestRenderAll();
        window.Chalkboard.HistoryManager.scheduleSave();
      });
    },

    toggleLockSelection() {
      const targets = window.Chalkboard.Properties.getSelectedTargets();
      if (targets.length === 0) return;

      const shouldLock = !targets[0].locked;
      targets.forEach((obj) => {
        obj.set({
          locked: shouldLock,
          lockMovementX: shouldLock,
          lockMovementY: shouldLock,
          lockScalingX: shouldLock,
          lockScalingY: shouldLock,
          lockRotation: shouldLock,
          hasControls: !shouldLock,
        });
      });

      const lockBtn = document.getElementById('act-lock');
      if (lockBtn) {
        lockBtn.textContent = shouldLock ? 'Unlock' : 'Lock';
        lockBtn.classList.toggle('active', shouldLock);
      }

      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
      window.Chalkboard.App.showToast(shouldLock ? 'Locked selection' : 'Unlocked selection');
    },

    selectAll() {
      this.canvas.discardActiveObject();
      const objs = this.canvas.getObjects().filter((o) => !o.isHelper && !o.locked);
      if (objs.length === 0) return;
      const sel = new fabric.ActiveSelection(objs, { canvas: this.canvas });
      this.canvas.setActiveObject(sel);
      this.canvas.requestRenderAll();
    },

    deleteSelection() {
      const active = this.canvas.getActiveObject();
      if (!active) return;

      if (active.isEditing) return;

      if (active.type === 'activeSelection') {
        active.getObjects().forEach((obj) => {
          if (!obj.locked) this.canvas.remove(obj);
        });
        this.canvas.discardActiveObject();
      } else {
        if (active.locked) {
          window.Chalkboard.App.showToast('Object is locked — unlock before deleting');
          return;
        }
        this.canvas.remove(active);
        this.canvas.discardActiveObject();
      }

      this.syncSelectionRibbon();
      this.canvas.requestRenderAll();
      window.Chalkboard.HistoryManager.scheduleSave();
    },
  };

  window.Chalkboard.ObjectActions = ObjectActions;
})();
