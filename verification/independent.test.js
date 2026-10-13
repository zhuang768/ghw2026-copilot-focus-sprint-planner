const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const Core = require(path.join(root, 'core.js'));
const key = 'focus-sprint-planner-v1';
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const appSource = () => process.env.FOCUS_APP_PATH
  ? fs.readFileSync(process.env.FOCUS_APP_PATH, 'utf8') : source('app.js');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Executes the unchanged UI source. This deliberately has no browser, layout engine,
// native validity checking, accessibility tree, or network; Safari remains a separate check.
function fixture(store = new Map()) {
  let document;
  const defaults = {};
  class Element {
    constructor(tag = '', id = '') {
      this.tagName = tag.toUpperCase(); this.id = id; this.value = '';
      this.children = []; this.listeners = {}; this.attributes = {};
      this.hidden = false; this.checked = false; this._text = '';
    }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text; }
    set innerHTML(_) { throw new Error('Unexpected HTML insertion'); }
    append(...children) { this.children.push(...children); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() { document.activeElement = this; }
    emit(name) {
      assert.equal(typeof this.listeners[name], 'function', `Missing ${name} listener on ${this.id || this.tagName}`);
      this.listeners[name]({ preventDefault() {} });
    }
  }
  const elements = {};
  for (const match of source('index.html').matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const [, tag, attrs, id] = match;
    const el = elements[id] = new Element(tag, id);
    el.value = (attrs.match(/\bvalue="([^"]*)"/) || [])[1] || '';
    el.hidden = /\bhidden\b/.test(attrs);
    defaults[id] = el.value;
  }
  const descendants = el => el.children.flatMap(child => [child, ...descendants(child)]);
  document = {
    activeElement: null,
    getElementById: id => elements[id] || descendants(elements['task-list']).find(el => el.id === id) || null,
    createElement: tag => new Element(tag),
  };
  elements['task-form'].reset = () => {
    for (const id of ['task-title', 'task-minutes', 'editing-id']) elements[id].value = defaults[id];
  };
  const storage = {
    getItem: name => store.has(name) ? store.get(name) : null,
    setItem: (name, value) => store.set(name, value),
  };
  const window = { FocusCore: Core, localStorage: storage };
  vm.runInNewContext(appSource(), { window, document }, { filename: 'app.js', timeout: 1000 });
  return {
    elements, document, store,
    saved: () => JSON.parse(store.get(key)),
    control: label => descendants(elements['task-list']).find(el => el.attributes['aria-label'] === label),
    add(title, minutes) {
      elements['task-title'].value = title; elements['task-minutes'].value = String(minutes);
      elements['task-form'].emit('submit');
    },
    sprint(minutes) { elements['sprint-length'].value = String(minutes); elements['sprint-length'].emit('change'); },
  };
}

test('complete plan persists and reloads after create/select/edit/sprint/remove/clear', () => {
  const ui = fixture();
  ui.add('Write outline', 10); ui.add('Review pull request', 20);
  const select = ui.control('Select Write outline'); select.checked = true; select.emit('change');
  ui.sprint(40);
  ui.control('Edit Write outline').emit('click'); ui.add('Draft outline', 15);
  assert.match(ui.elements.summary.textContent, /Selected: 15 min · Remaining: 25 min/);
  const reloaded = fixture(ui.store);
  assert.equal(reloaded.elements['task-count'].textContent, '2/100');
  assert.equal(reloaded.elements['sprint-length'].value, '40');
  assert.equal(reloaded.control('Select Draft outline').checked, true);
  assert.equal(reloaded.control('Select Review pull request').checked, false);
  reloaded.control('Remove Review pull request').emit('click');
  assert.equal(reloaded.document.activeElement, reloaded.control('Select Draft outline'));
  reloaded.elements['clear-selection'].emit('click');
  assert.deepEqual(reloaded.saved().selectedIds, []);
  assert.equal(reloaded.saved().tasks.length, 1);
  assert.match(fixture(ui.store).elements.summary.textContent, /Selected: 0 min · Remaining: 40 min/);
});

test('cancel edit retains stored values and returns form to create mode', () => {
  const ui = fixture(); ui.add('Original', 5);
  const before = ui.store.get(key);
  ui.control('Edit Original').emit('click');
  ui.elements['task-title'].value = 'Unsaved'; ui.elements['task-minutes'].value = '480';
  ui.elements['cancel-edit'].emit('click');
  assert.equal(ui.store.get(key), before);
  assert.equal(ui.elements['editing-id'].value, '');
  assert.equal(ui.elements['cancel-edit'].hidden, true);
  assert.equal(ui.elements['save-task'].textContent, 'Add task');
  assert.equal(ui.document.activeElement, ui.elements['task-title']);
});

test('100-task limit rejects a new task, permits edit, and recovers after removal', () => {
  const store = new Map([[key, JSON.stringify({
    tasks: Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}`, title: `Task ${i}`, minutes: 1 })),
    selectedIds: [], sprintMinutes: 25,
  })]]);
  const ui = fixture(store); ui.add('Too many', 1);
  assert.match(ui.elements.feedback.textContent, /up to 100 tasks/);
  assert.equal(ui.saved().tasks.length, 100);
  ui.control('Edit Task 50').emit('click'); ui.add('Edited at capacity', 480);
  assert.equal(ui.saved().tasks.find(task => task.id === 'id-50').minutes, 480);
  ui.control('Remove Task 0').emit('click'); ui.add('Replacement', 1);
  assert.equal(ui.saved().tasks.length, 100);
  assert.ok(ui.control('Select Replacement'));
});

test('invalid form inputs leave valid persisted data intact and identify the input', () => {
  const ui = fixture(); ui.add('Retained', 1);
  const before = ui.store.get(key);
  for (const [title, minutes, invalid] of [
    ['   ', '10', 'task-title'], ['x'.repeat(101), '10', 'task-title'],
    ['bad time', '', 'task-minutes'], ['bad time', '0', 'task-minutes'],
    ['bad time', '-1', 'task-minutes'], ['bad time', '481', 'task-minutes'],
    ['bad time', '1.5', 'task-minutes'], ['bad time', 'NaN', 'task-minutes'],
  ]) {
    ui.add(title, minutes);
    assert.equal(ui.store.get(key), before);
    assert.equal(ui.elements[invalid].attributes['aria-invalid'], 'true');
    assert.equal(ui.document.activeElement, ui.elements[invalid]);
  }
});

test('sprint boundaries and invalid-change recovery preserve selected work', () => {
  const ui = fixture(); ui.add('Long task', 480);
  const select = ui.control('Select Long task'); select.checked = true; select.emit('change');
  ui.sprint(1);
  assert.match(ui.elements.summary.textContent, /Over budget by 479 min/);
  for (const input of ['', '0', '-1', '481', '2.5']) {
    ui.sprint(input);
    assert.equal(ui.elements['sprint-length'].value, '1');
    assert.equal(ui.saved().sprintMinutes, 1);
    assert.equal(ui.saved().selectedIds.length, 1);
  }
  ui.sprint(480);
  assert.equal(ui.elements['sprint-length'].attributes['aria-invalid'], 'false');
  assert.match(ui.elements.summary.textContent, /Selected: 480 min · Remaining: 0 min$/);
  assert.equal(ui.elements.summary.className, 'summary');
});

test('stored markup stays literal and selected prototype-like IDs remain usable', () => {
  const title = '<img src=x onerror=alert(1)>';
  const store = new Map([[key, JSON.stringify({
    tasks: [null, { id: '__proto__', title, minutes: 25 }, { id: 'constructor', title: 'Constructor', minutes: 10 }],
    selectedIds: ['__proto__', '__proto__', 'missing'], sprintMinutes: 25,
  })]]);
  const ui = fixture(store);
  assert.equal(ui.elements['task-count'].textContent, '2/100');
  assert.equal(ui.elements['task-list'].children[0].children[1].textContent, title);
  assert.equal(ui.control('Select ' + title).checked, true);
  ui.control('Remove ' + title).emit('click');
  assert.deepEqual(ui.saved().selectedIds, []);
  assert.equal(ui.document.activeElement, ui.control('Select Constructor'));
});

test('removing the task being edited clears edit state without changing a surviving task', () => {
  const ui = fixture(); ui.add('First', 2); ui.add('Second', 3); ui.add('Third', 4);
  ui.control('Edit Second').emit('click'); ui.control('Remove Second').emit('click');
  assert.equal(ui.elements['editing-id'].value, '');
  assert.equal(ui.document.activeElement, ui.control('Select Third'));
  ui.add('Fourth', 5);
  assert.deepEqual(ui.saved().tasks.map(task => [task.title, task.minutes]), [['First', 2], ['Third', 4], ['Fourth', 5]]);
});

test('sanitizer and summary maintain invariants across deterministic malformed-state samples', () => {
  let seed = 0xabcdef;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const junk = [null, false, 0, [], {}, '', 'bad'];
  for (let sample = 0; sample < 500; sample++) {
    const tasks = Array.from({ length: random(130) }, (_, i) => random(3) === 0 ? junk[random(junk.length)] : {
      id: ['', '__proto__', 'constructor', `id-${random(35)}`, 'x'.repeat(101)][random(5)],
      title: ['', '   ', 'Title', 'x'.repeat(101)][random(4)],
      minutes: [0, 1, 25, 480, 481, 1.5, '25', null][random(8)],
    });
    const state = Core.sanitizeState({ tasks, selectedIds: tasks.map(task => task && task.id), sprintMinutes: random(550) - 20 });
    assert.ok(state.tasks.length <= 100);
    assert.equal(new Set(state.tasks.map(task => task.id)).size, state.tasks.length);
    assert.ok(state.tasks.every(Core.validTask));
    assert.ok(state.selectedIds.every(id => state.tasks.some(task => task.id === id)));
    assert.equal(new Set(state.selectedIds).size, state.selectedIds.length);
    assert.deepEqual(Core.sanitizeState(state), state);
    const expected = state.tasks.filter(task => state.selectedIds.includes(task.id)).reduce((sum, task) => sum + task.minutes, 0);
    assert.deepEqual(Core.summarizeSprint(state), {
      total: expected, sprintMinutes: state.sprintMinutes,
      remaining: Math.max(0, state.sprintMinutes - expected), over: expected > state.sprintMinutes,
    });
  }
});

test('captured files match reviewed manifest and Copilot source matches original manifest', () => {
  const files = ['index.html', 'styles.css', 'core.js', 'app.js', 'app.test.js', 'README.md'];
  const generated = JSON.parse(source('evidence/generated-source.json'));
  const initialHashes = JSON.parse(source('evidence/generated-source-sha256.json'));
  const reviewedHashes = JSON.parse(source('evidence/reviewed-source-sha256.json'));
  assert.deepEqual(Object.keys(generated).sort(), files.slice().sort());
  for (const file of files) {
    assert.equal(sha(generated[file]), initialHashes[file], `Copilot original hash: ${file}`);
    assert.equal(sha(source(file)), reviewedHashes[file], `Reviewed snapshot hash: ${file}`);
  }
});

test('entrypoint declares only present local resources and every UI lookup has a unique ID', () => {
  const html = source('index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of source('app.js').matchAll(/getElementById\('([^']+)'\)/g)) {
    assert.ok(ids.includes(match[1]), `Missing static UI element: ${match[1]}`);
  }
  const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(resources, ['styles.css', 'core.js', 'app.js']);
  for (const resource of resources) assert.ok(fs.statSync(path.join(root, resource)).isFile());
  assert.doesNotMatch(source('app.js') + source('core.js'), /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/);
});

test('restoring a valid sprint value clears its invalid accessibility marker', () => {
  const ui = fixture();
  ui.sprint(0);
  assert.equal(ui.elements['sprint-length'].value, '25');
  assert.equal(ui.elements['sprint-length'].attributes['aria-invalid'], 'false');
  assert.match(ui.elements.feedback.textContent, /previous length was kept/);
  ui.elements['clear-selection'].emit('click');
  assert.equal(ui.elements['sprint-length'].attributes['aria-invalid'], 'false');
});

test('changing sprint retains pending checkbox and Edit targets', () => {
  const ui = fixture(); ui.add('First', 10); ui.add('Second', 20);
  const first = ui.control('Select First'); first.checked = true; first.emit('change');
  const pendingCheckbox = ui.control('Select Second');
  ui.sprint(40);
  assert.equal(ui.control('Select Second'), pendingCheckbox, 'Sprint blur must not replace the checkbox before its click');
  assert.match(ui.elements.summary.textContent, /Selected: 10 min · Remaining: 30 min/);
  pendingCheckbox.checked = true; pendingCheckbox.emit('change');
  assert.match(ui.elements.summary.textContent, /Selected: 30 min · Remaining: 10 min/);
  assert.equal(ui.saved().selectedIds.length, 2);

  const pendingEdit = ui.control('Edit Second');
  ui.sprint(50);
  assert.equal(ui.control('Edit Second'), pendingEdit, 'Sprint blur must not replace Edit before its click');
  pendingEdit.emit('click');
  assert.equal(ui.elements['task-title'].value, 'Second');
  assert.equal(ui.elements['task-minutes'].value, 20);
  assert.equal(ui.elements['save-task'].textContent, 'Save task');
  assert.equal(ui.saved().sprintMinutes, 50);
});
