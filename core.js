(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FocusCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LIMIT = 100;
  function cleanTitle(value) {
    return typeof value === 'string' ? value.trim().slice(0, 100) : '';
  }
  function validMinutes(value) {
    return Number.isInteger(value) && value > 0 && value <= 480;
  }
  function validTask(task) {
    return Boolean(task && typeof task === 'object' && !Array.isArray(task) &&
      typeof task.id === 'string' && task.id.trim().length > 0 && task.id.trim().length <= 100 &&
      typeof task.title === 'string' && task.title.trim().length > 0 && task.title.trim().length <= 100 &&
      validMinutes(task.minutes));
  }
  function sanitizeState(input) {
    var source = input && typeof input === 'object' ? input : {};
    var tasks = [], ids = Object.create(null);
    var incoming = Array.isArray(source.tasks) ? source.tasks : [];
    incoming.slice(0, LIMIT).forEach(function (task) {
      if (!task || typeof task !== 'object' || Array.isArray(task)) return;
      var id = typeof task.id === 'string' ? task.id.trim() : '';
      var title = cleanTitle(task.title);
      if (!id || id.length > 100 || ids[id] || !title || !validMinutes(task.minutes)) return;
      ids[id] = true;
      tasks.push({ id: id, title: title, minutes: task.minutes });
    });
    var selected = [];
    var selectedInput = Array.isArray(source.selectedIds) ? source.selectedIds : [];
    selectedInput.forEach(function (id) {
      if (typeof id === 'string' && ids[id] && selected.indexOf(id) < 0) selected.push(id);
    });
    var sprintMinutes = Number.isInteger(source.sprintMinutes) && source.sprintMinutes > 0 && source.sprintMinutes <= 480
      ? source.sprintMinutes : 25;
    return { tasks: tasks, selectedIds: selected, sprintMinutes: sprintMinutes };
  }
  function summarizeSprint(state) {
    var safe = sanitizeState(state), selected = Object.create(null), total = 0;
    safe.selectedIds.forEach(function (id) { selected[id] = true; });
    safe.tasks.forEach(function (task) { if (selected[task.id]) total += task.minutes; });
    return { total: total, sprintMinutes: safe.sprintMinutes, remaining: Math.max(0, safe.sprintMinutes - total), over: total > safe.sprintMinutes };
  }
  function loadState(storage, key) {
    var fallback = sanitizeState({});
    try {
      if (!storage || typeof storage.getItem !== 'function') return { state: fallback, warning: 'Saving is unavailable in this browser.' };
      var raw = storage.getItem(key);
      if (!raw) return { state: fallback, warning: '' };
      try { return { state: sanitizeState(JSON.parse(raw)), warning: '' }; }
      catch (error) { return { state: fallback, warning: 'Saved data was invalid and has been reset.' }; }
    } catch (error) {
      return { state: fallback, warning: 'Saved data could not be read; changes may not persist.' };
    }
  }
  function saveState(storage, key, state) {
    try {
      if (!storage || typeof storage.setItem !== 'function') return { ok: false, warning: 'Changes could not be saved because storage is unavailable.' };
      storage.setItem(key, JSON.stringify(sanitizeState(state)));
      return { ok: true, warning: '' };
    } catch (error) {
      return { ok: false, warning: 'Changes could not be saved; browser storage may be full or blocked.' };
    }
  }
  return { sanitizeState: sanitizeState, validTask: validTask, summarizeSprint: summarizeSprint, loadState: loadState, saveState: saveState };
}));
