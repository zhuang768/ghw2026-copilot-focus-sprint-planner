const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./core.js');

const valid = { tasks: [{ id: 'a', title: '  Write outline  ', minutes: 20 }], selectedIds: ['a'], sprintMinutes: 25 };

test('sanitizes invalid, duplicate, unknown, and oversized state values', () => {
  const state = Core.sanitizeState({
    tasks: [valid.tasks[0], { id: 'a', title: 'duplicate', minutes: 2 }, { id: 'b', title: '', minutes: 3 }, { id: 'c', title: 'bad time', minutes: 481 }, { id: 'd', title: 'x'.repeat(120), minutes: 4 }],
    selectedIds: ['a', 'a', 'missing'], sprintMinutes: 0
  });
  assert.deepEqual(state.tasks, [{ id: 'a', title: 'Write outline', minutes: 20 }, { id: 'd', title: 'x'.repeat(100), minutes: 4 }]);
  assert.deepEqual(state.selectedIds, ['a']);
  assert.equal(state.sprintMinutes, 25);
});

test('summarizes selected work and over-budget status', () => {
  assert.deepEqual(Core.summarizeSprint({ ...valid, tasks: [{ id: 'a', title: 'one', minutes: 30 }], sprintMinutes: 25 }), { total: 30, sprintMinutes: 25, remaining: 0, over: true });
});

test('reports corrupt and inaccessible storage while returning safe state', () => {
  const corrupt = Core.loadState({ getItem: () => '{' }, 'key');
  assert.equal(corrupt.state.tasks.length, 0);
  assert.match(corrupt.warning, /invalid/);
  const blocked = Core.loadState({ getItem: () => { throw new Error('blocked'); } }, 'key');
  assert.match(blocked.warning, /could not be read/);
});

test('reports quota failure and sanitizes what it writes', () => {
  let written;
  const storage = { setItem: (key, value) => { written = JSON.parse(value); } };
  assert.equal(Core.saveState(storage, 'key', valid).ok, true);
  assert.equal(written.tasks[0].title, 'Write outline');
  const quota = Core.saveState({ setItem: () => { throw new Error('quota'); } }, 'key', valid);
  assert.equal(quota.ok, false);
  assert.match(quota.warning, /full or blocked/);
});

test('validates task shape and minute boundaries', () => {
  assert.equal(Core.validTask({ id: 'x', title: 'Task', minutes: 1 }), true);
  assert.equal(Core.validTask({ id: 'x', title: 'Task', minutes: 480 }), true);
  assert.equal(Core.validTask({ id: 'x', title: 'Task', minutes: 0 }), false);
  assert.equal(Core.validTask({ id: 'x', title: 'Task', minutes: 481 }), false);
});

test('rejects malformed entries without losing valid stored tasks', () => {
  const state = Core.sanitizeState({ tasks: [null, 7, false, [], 'bad', valid.tasks[0]], selectedIds: ['a'] });
  assert.deepEqual(state.tasks, [{ id: 'a', title: 'Write outline', minutes: 20 }]);
  for (const input of [undefined, null, [], '', 0, false]) assert.equal(Core.validTask(input), false);
  assert.equal(Core.validTask({ id: 'x', title: 'x'.repeat(101), minutes: 2 }), false);
});

test('handles prototype-like IDs, empty selection, exact budget and fractional minutes', () => {
  const state = Core.sanitizeState({ tasks: [{ id: '__proto__', title: '<img onerror=alert(1)>', minutes: 25 }], selectedIds: ['__proto__'], sprintMinutes: 25 });
  assert.equal(state.tasks.length, 1);
  assert.deepEqual(Core.summarizeSprint(state), { total: 25, sprintMinutes: 25, remaining: 0, over: false });
  assert.deepEqual(Core.summarizeSprint(null), { total: 0, sprintMinutes: 25, remaining: 25, over: false });
  assert.equal(Core.validTask({ id: 'x', title: 'Task', minutes: 1.5 }), false);
});

test('bounds task counts and persisted IDs', () => {
  const tasks = Array.from({ length: 101 }, (_, i) => ({ id: String(i), title: 'Task', minutes: 1 }));
  const state = Core.sanitizeState({ tasks, selectedIds: ['100', '0', '0'], sprintMinutes: 480 });
  assert.equal(state.tasks.length, 100);
  assert.deepEqual(state.selectedIds, ['0']);
  assert.equal(Core.sanitizeState({ tasks: [{ id: 'x'.repeat(101), title: 'Task', minutes: 1 }] }).tasks.length, 0);
});

test('catches unavailable stores and throwing method getters', () => {
  assert.equal(Core.saveState(null, 'key', valid).ok, false);
  assert.match(Core.loadState(null, 'key').warning, /unavailable/);
  const read = Object.defineProperty({}, 'getItem', { get() { throw new Error('blocked'); } });
  const write = Object.defineProperty({}, 'setItem', { get() { throw new Error('blocked'); } });
  assert.match(Core.loadState(read, 'key').warning, /could not be read/);
  assert.equal(Core.saveState(write, 'key', valid).ok, false);
});

// Execute the real UI script against a minimal DOM to exercise startup and state transitions.
// Safari validation remains necessary for layout, native controls and visual accessibility.
function uiFixture(storage, getterThrows = false) {
  const fs = require('node:fs');
  const vm = require('node:vm');
  let document;
  class Element {
    constructor(id = '') { this.id = id; this.value = ''; this.children = []; this.listeners = {}; this.attributes = {}; this.hidden = false; this._text = ''; }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() { document.activeElement = this; }
    emit(name) { this.listeners[name]({ preventDefault() {} }); }
  }
  const ids = [...fs.readFileSync(require.resolve('./index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  function descendants(element) { return element.children.flatMap(child => [child, ...descendants(child)]); }
  document = {
    activeElement: null,
    getElementById: id => elements[id] || descendants(elements['task-list']).find(el => el.id === id),
    createElement: () => new Element()
  };
  elements['task-form'].reset = () => { for (const id of ['task-title', 'task-minutes', 'editing-id']) elements[id].value = ''; };
  const window = { FocusCore: Core };
  Object.defineProperty(window, 'localStorage', { get() { if (getterThrows) throw new Error('blocked origin'); return storage; } });
  vm.runInNewContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), { window, document });
  return {
    elements, document,
    control: label => descendants(elements['task-list']).find(el => el.attributes['aria-label'] === label),
    add(title = 'Read chapter', minutes = '30') {
      elements['task-title'].value = title; elements['task-minutes'].value = minutes; elements['task-form'].emit('submit');
    }
  };
}

test('UI survives a blocked localStorage getter and keeps its warning after adding', () => {
  const ui = uiFixture(null, true);
  assert.match(ui.elements['storage-status'].textContent, /unavailable/);
  ui.add();
  assert.equal(ui.elements['task-count'].textContent, '1/100');
  assert.equal(ui.elements.feedback.textContent, 'Task added.');
  assert.match(ui.elements['storage-status'].textContent, /Session only.*unavailable/);
});

test('UI reports quota failure separately from successful in-memory edits', () => {
  const ui = uiFixture({ getItem: () => null, setItem() { throw new Error('quota'); } });
  ui.add();
  assert.match(ui.elements['storage-status'].textContent, /full or blocked/);
  ui.control('Edit Read chapter').emit('click');
  ui.elements['task-title'].value = 'Revised chapter'; ui.elements['task-form'].emit('submit');
  assert.equal(ui.elements.feedback.textContent, 'Task updated.');
  assert.ok(ui.control('Edit Revised chapter'));
  assert.match(ui.elements['storage-status'].textContent, /full or blocked/);
});

test('UI preserves checkbox focus and resets editing when the edited task is removed', () => {
  const ui = uiFixture({ getItem: () => null, setItem() {} });
  ui.add();
  const selected = ui.control('Select Read chapter'); selected.focus(); selected.checked = true; selected.emit('change');
  assert.equal(ui.document.activeElement, ui.control('Select Read chapter'));
  assert.match(ui.elements.summary.textContent, /Over budget by 5 min/);
  ui.control('Edit Read chapter').emit('click');
  ui.control('Remove Read chapter').emit('click');
  assert.equal(ui.elements['editing-id'].value, '');
  assert.equal(ui.elements['cancel-edit'].hidden, true);
  assert.equal(ui.document.activeElement, ui.elements['task-title']);
  ui.add('New task', '5');
  assert.equal(ui.elements['task-count'].textContent, '1/100');
  assert.ok(ui.control('Select New task'));
});

test('UI displays stored custom sprint minutes and keeps them after invalid input', () => {
  const ui = uiFixture({ getItem: () => JSON.stringify({ ...valid, sprintMinutes: 40 }), setItem() {} });
  assert.equal(ui.elements['sprint-length'].value, '40');
  ui.elements['sprint-length'].value = '2.5'; ui.elements['sprint-length'].emit('change');
  assert.equal(ui.elements['sprint-length'].value, '40');
  assert.match(ui.elements.feedback.textContent, /previous length was kept/);
  assert.match(ui.elements.summary.textContent, /Selected: 20 min · Remaining: 20 min/);
});
