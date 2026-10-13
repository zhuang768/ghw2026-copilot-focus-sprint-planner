(function () {
  'use strict';
  var Core = window.FocusCore, KEY = 'focus-sprint-planner-v1';
  var els = {
    form: document.getElementById('task-form'), title: document.getElementById('task-title'),
    minutes: document.getElementById('task-minutes'), editing: document.getElementById('editing-id'),
    cancel: document.getElementById('cancel-edit'), save: document.getElementById('save-task'),
    list: document.getElementById('task-list'), empty: document.getElementById('empty'),
    feedback: document.getElementById('feedback'), storageStatus: document.getElementById('storage-status'),
    summary: document.getElementById('summary'), sprint: document.getElementById('sprint-length'),
    clear: document.getElementById('clear-selection'), count: document.getElementById('task-count')
  };
  // A storage getter can throw before a helper receives it, such as a blocked file origin.
  var storage = null;
  try { storage = window.localStorage; } catch (error) { storage = null; }
  var loaded = Core.loadState(storage, KEY), state = loaded.state;
  if (loaded.warning) storageMessage(loaded.warning, true);
  els.sprint.value = String(state.sprintMinutes);

  function show(message, type) {
    els.feedback.textContent = message;
    els.feedback.className = 'feedback ' + (type || '');
  }
  function storageMessage(message, warning) {
    els.storageStatus.textContent = message;
    els.storageStatus.className = 'storage-status' + (warning ? ' notice' : '');
  }
  function persist() {
    var result = Core.saveState(storage, KEY, state);
    storageMessage(result.ok ? 'Saved on this device.' : 'Session only. ' + result.warning, !result.ok);
  }
  function focusTask(id) {
    var control = id && document.getElementById('select-' + id);
    (control || els.title).focus();
  }
  function renderSummary() {
    var summary = Core.summarizeSprint(state);
    els.summary.textContent = 'Selected: ' + summary.total + ' min · Remaining: ' + summary.remaining + ' min' +
      (summary.over ? ' · Over budget by ' + (summary.total - summary.sprintMinutes) + ' min' : '');
    els.summary.className = 'summary' + (summary.over ? ' over' : '');
  }
  function render() {
    state = Core.sanitizeState(state);
    renderSummary();
    els.count.textContent = state.tasks.length + '/100';
    els.list.textContent = '';
    els.empty.hidden = state.tasks.length > 0;
    state.tasks.forEach(function (task) {
      var item = document.createElement('li'); item.className = 'task';
      var check = document.createElement('input');
      check.type = 'checkbox'; check.id = 'select-' + task.id;
      check.checked = state.selectedIds.indexOf(task.id) >= 0;
      check.setAttribute('aria-label', 'Select ' + task.title);
      check.addEventListener('change', function () { toggle(task.id, check.checked); });
      var name = document.createElement('span'); name.className = 'task-title'; name.textContent = task.title;
      var time = document.createElement('span'); time.className = 'task-minutes'; time.textContent = task.minutes + ' min';
      var actions = document.createElement('span'); actions.className = 'task-actions';
      var edit = document.createElement('button'); edit.type = 'button'; edit.className = 'quiet'; edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + task.title);
      edit.addEventListener('click', function () { beginEdit(task); });
      var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'quiet'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove ' + task.title);
      remove.addEventListener('click', function () { removeTask(task.id); });
      actions.append(edit, remove); item.append(check, name, time, actions); els.list.append(item);
    });
  }
  function toggle(id, checked) {
    state.selectedIds = state.selectedIds.filter(function (value) { return value !== id; });
    if (checked) state.selectedIds.push(id);
    persist(); render(); focusTask(id);
  }
  function resetForm() {
    els.form.reset(); els.editing.value = ''; els.cancel.hidden = true; els.save.textContent = 'Add task';
    els.title.setAttribute('aria-invalid', 'false'); els.minutes.setAttribute('aria-invalid', 'false');
  }
  function beginEdit(task) {
    resetForm(); els.title.value = task.title; els.minutes.value = task.minutes;
    els.editing.value = task.id; els.cancel.hidden = false; els.save.textContent = 'Save task'; els.title.focus();
    show('Editing ' + task.title + '.');
  }
  function removeTask(id) {
    var index = state.tasks.findIndex(function (task) { return task.id === id; });
    state.tasks = state.tasks.filter(function (task) { return task.id !== id; });
    state.selectedIds = state.selectedIds.filter(function (value) { return value !== id; });
    if (els.editing.value === id) resetForm();
    persist(); render(); show('Task removed.');
    var next = state.tasks[Math.min(Math.max(index, 0), state.tasks.length - 1)];
    focusTask(next && next.id);
  }
  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var title = els.title.value.trim(), minutes = Number(els.minutes.value);
    var titleValid = title.length > 0 && title.length <= 100;
    var minutesValid = Number.isInteger(minutes) && minutes >= 1 && minutes <= 480;
    els.title.setAttribute('aria-invalid', String(!titleValid));
    els.minutes.setAttribute('aria-invalid', String(!minutesValid));
    if (!titleValid || !minutesValid) {
      show('Enter a title up to 100 characters and a whole number of minutes from 1 to 480.', 'error');
      (titleValid ? els.minutes : els.title).focus(); return;
    }
    var id = els.editing.value;
    if (id) {
      var task = state.tasks.find(function (item) { return item.id === id; });
      if (!task) { resetForm(); show('That task was removed. Add a new task.', 'error'); els.title.focus(); return; }
      task.title = title; task.minutes = minutes;
    } else {
      if (state.tasks.length >= 100) { show('You can have up to 100 tasks.', 'error'); return; }
      state.tasks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), title: title, minutes: minutes });
    }
    persist(); resetForm(); render(); show(id ? 'Task updated.' : 'Task added.'); els.title.focus();
  });
  els.cancel.addEventListener('click', function () { resetForm(); show('Edit cancelled.'); els.title.focus(); });
  els.sprint.addEventListener('change', function () {
    var minutes = Number(els.sprint.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
      els.sprint.value = String(state.sprintMinutes); els.sprint.setAttribute('aria-invalid', 'false');
      show('Sprint length must be a whole number from 1 to 480 minutes. Your previous length was kept.', 'error'); return;
    }
    els.sprint.setAttribute('aria-invalid', 'false'); state.sprintMinutes = minutes;
    persist(); renderSummary(); show('Sprint length updated.');
  });
  els.clear.addEventListener('click', function () {
    state.selectedIds = []; persist(); render(); show('Selection cleared.'); els.clear.focus();
  });
  render();
}());
