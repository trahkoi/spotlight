const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const S = require('../pairing.js');
const source = readFileSync(join(__dirname, '../app.js'), 'utf8');
const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const storageKey = 'spotlight.session.v1';

// Minimal DOM for exercising the actual app event handlers without a browser.
class Element {
  constructor() {
    this.value = ''; this.children = []; this.attributes = {}; this.events = {};
    this.classes = new Set();
    this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  setCustomValidity(value) { this.validationMessage = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  fire(name) { this.events[name]({ preventDefault() {} }); }
}
function storage() {
  const entries = new Map();
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
function app(localStorage, confirm = () => true) {
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  elements['round-count'].value = '2';
  runInNewContext(source, {
    window: { Spotlight: S, localStorage, confirm },
    document: { getElementById: id => elements[id], createElement: () => new Element() },
  });
  const click = id => elements[id].fire('click');
  function roster() {
    elements.leaders.value = 'Alice\nBob'; elements.followers.value = 'Cara\nDana';
    elements.leaders.fire('input'); elements.followers.fire('input');
    elements['roster-form'].fire('submit');
  }
  function cells(node = elements.history) {
    return node.children.flatMap(child => child.attributes['aria-label']?.startsWith('Shared dances:') ? [child] : cells(child));
  }
  return { elements, click, roster, cells, generate: () => elements['generate-form'].fire('submit') };
}

test('applied dancers and valid history edits survive reload; drafts and plans do not', () => {
  const disk = storage(), first = app(disk);
  assert.equal(disk.entries.size, 0);
  first.roster();
  first.cells()[0].value = '7'; first.cells()[0].fire('input');
  const saved = disk.getItem(storageKey);
  first.generate(); first.click('regenerate');
  assert.equal(disk.getItem(storageKey), saved);
  first.elements.leaders.value = 'Unapplied dancer'; first.elements.leaders.fire('input');
  const restored = app(disk);
  assert.equal(restored.elements.leaders.value, 'Alice\nBob');
  assert.equal(restored.elements.followers.value, 'Cara\nDana');
  assert.equal(restored.cells()[0].value, 7);
  assert.equal(restored.elements.results.children.length, 0);
  assert.equal(restored.elements['plan-actions'].hidden, true);
});

test('recording saves updated history once and invalid edits cannot overwrite storage', () => {
  const disk = storage(), page = app(disk); page.roster(); page.generate();
  page.click('record');
  const saved = disk.getItem(storageKey);
  assert.equal(JSON.parse(saved).history.flat().reduce((a, b) => a + b, 0), 4);
  assert.equal(page.elements.record.disabled, true);
  page.click('record'); assert.equal(disk.getItem(storageKey), saved);
  page.cells()[0].value = '-1'; page.cells()[0].fire('input');
  assert.equal(disk.getItem(storageKey), saved);
  page.elements.followers.value = 'Alice'; page.elements.followers.fire('input');
  page.elements['roster-form'].fire('submit');
  assert.equal(disk.getItem(storageKey), saved);
});

test('clear resets the page and saved data, leaving unrelated storage alone', () => {
  const disk = storage(), page = app(disk); disk.setItem('another-app', 'keep');
  page.roster(); page.generate(); page.click('clear-data');
  assert.equal(disk.getItem(storageKey), null);
  assert.equal(disk.getItem('another-app'), 'keep');
  assert.equal(page.elements.leaders.value, '');
  assert.equal(page.elements.followers.value, '');
  assert.equal(page.cells().length, 0);
  assert.equal(page.elements.results.children.length, 0);
  assert.equal(page.elements['plan-actions'].hidden, true);
  assert.equal(app(disk).elements.leaders.value, '');
});

test('cancelling clear preserves saved and working data', () => {
  const disk = storage(), page = app(disk, () => false); page.roster(); page.generate();
  const saved = disk.getItem(storageKey); page.click('clear-data');
  assert.equal(disk.getItem(storageKey), saved);
  assert.equal(page.elements.leaders.value, 'Alice\nBob');
  assert.equal(page.elements.results.children.length, 2);
});

test('malformed or incompatible saved data is rejected without crashing or overwriting it', () => {
  for (const bad of ['{broken', JSON.stringify({ version: 9 }), JSON.stringify({ version: 1, leaders: ['A'], followers: ['B'], history: [[-1]] })]) {
    const disk = storage(); disk.setItem(storageKey, bad);
    const page = app(disk);
    assert.equal(page.elements.leaders.value, '');
    assert.equal(page.elements['storage-status'].classes.has('error'), true);
    assert.equal(disk.getItem(storageKey), bad);
    page.roster();
    assert.equal(page.elements['storage-status'].classes.has('error'), false);
    assert.deepEqual(JSON.parse(disk.getItem(storageKey)).leaders, ['Alice', 'Bob']);
  }
});

test('blocked reads, writes, and clears leave a usable page and report failures', () => {
  const unavailable = () => { throw new Error('Storage blocked'); };
  const page = app({ getItem: unavailable, setItem: unavailable, removeItem: unavailable });
  assert.equal(page.elements['storage-status'].classes.has('error'), true);
  page.roster(); page.generate(); page.click('record');
  assert.equal(page.cells().reduce((sum, input) => sum + Number(input.value), 0), 4);
  assert.equal(page.elements['storage-status'].classes.has('error'), true);
  page.click('clear-data');
  assert.equal(page.elements.leaders.value, 'Alice\nBob');
  assert.match(page.elements['storage-status'].textContent, /Could not clear/);
});

test('a failed save leaves the previous snapshot intact and can recover on a later edit', () => {
  const disk = storage(), page = app(disk); page.roster();
  const saved = disk.getItem(storageKey), originalWrite = disk.setItem;
  disk.setItem = () => { throw new Error('Quota exceeded'); };
  page.cells()[0].value = '9'; page.cells()[0].fire('input');
  assert.equal(disk.getItem(storageKey), saved);
  assert.equal(page.elements['storage-status'].classes.has('error'), true);
  disk.setItem = originalWrite;
  page.cells()[1].value = '3'; page.cells()[1].fire('input');
  assert.deepEqual(JSON.parse(disk.getItem(storageKey)).history[0], [9, 3]);
  assert.equal(page.elements['storage-status'].classes.has('error'), false);
});

test('tapping a count increments and saves it; edit mode allows corrections', () => {
  const disk = storage(), page = app(disk); page.roster(); page.generate();
  function findCounter(node = page.elements.history) {
    if (node.attributes['aria-label']?.startsWith('Add a shared dance: Alice and Cara.')) return node;
    for (const child of node.children) { const found = findCounter(child); if (found) return found; }
  }
  const counter = findCounter();
  assert.equal(page.cells()[0].hidden, true);
  assert.equal(counter.textContent, '0');
  counter.fire('click'); counter.fire('click');
  assert.equal(counter.textContent, '2');
  assert.equal(JSON.parse(disk.getItem(storageKey)).history[0][0], 2);
  assert.equal(page.elements['plan-status'].textContent, 'Outdated');
  assert.equal(page.elements.record.disabled, true);
  page.elements['edit-counts'].checked = true;
  page.elements['edit-counts'].fire('change');
  assert.equal(page.cells()[0].hidden, false);
  assert.equal(findCounter().hidden, true);
  page.cells()[0].value = '0'; page.cells()[0].fire('input');
  assert.equal(JSON.parse(disk.getItem(storageKey)).history[0][0], 0);
  page.cells()[0].value = ''; page.cells()[0].fire('input');
  page.elements['edit-counts'].checked = false; page.elements['edit-counts'].fire('change');
  assert.equal(page.elements['edit-counts'].checked, true);
  page.cells()[0].value = String(Number.MAX_SAFE_INTEGER); page.cells()[0].fire('input');
  assert.equal(findCounter().disabled, true);
});
