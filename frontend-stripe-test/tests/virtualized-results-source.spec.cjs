const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function fixture() {
  let states = [], hook = 0, effects = [], tree, props, calls = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => { const i = hook++; return states[i] ||= { current: value }; },
    useState: initial => { const i = hook++; states[i] ||= { value: typeof initial === 'function' ? initial() : initial }; return [states[i].value, update => { states[i].value = typeof update === 'function' ? update(states[i].value) : update; }]; },
    useMemo: (callback, deps) => { const i = hook++, old = states[i]; if (!old || deps.some((value, index) => value !== old.deps?.[index])) states[i] = { value: callback(), deps }; return states[i].value; },
    useEffect: (callback, deps) => { const i = hook++, old = states[i]; if (!old || deps.some((value, index) => value !== old.deps?.[index])) { states[i] = { deps }; effects.push(() => { old?.cleanup?.(); states[i].cleanup = callback(); }); } },
  };
  const filename = path.resolve(__dirname, '../src/components/VirtualizedResults.tsx'), compiled = new Module(filename);
  compiled.require = name => name === 'react' ? react : name === 'react-native' ? { FlatList: 'FlatList', View: 'View' } : (() => { throw Error(`Unexpected import ${name}`); })();
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  function render(next) { props = next || props; hook = 0; tree = compiled.exports.default(props); tree.props.ref.current = { scrollToOffset: options => calls.push(options) }; const pending = effects; effects = []; pending.forEach(effect => effect()); return tree; }
  return { api: compiled.exports, render, calls, get tree() { return tree; }, unmount() { states.forEach(state => state?.cleanup?.()); }, remount(next) { states = []; render(next); } };
}
const scroll = y => ({ nativeEvent: { contentOffset: { y } } });
const layout = height => ({ nativeEvent: { layout: { height } } });
const data = Array.from({ length: 10000 }, (_, index) => ({ id: `record-${index}` }));
const base = { restoreKey: 'actor:a:query:one', data, estimatedItemHeight: 120, keyExtractor: item => item.id };

test('real wrapper leaves ten thousand records lazy and only renders requested rows', () => {
  const h = fixture(); let rendered = 0;
  const tree = h.render({ ...base, renderItem: ({ item }) => { rendered++; return item.id; } });
  assert.equal(rendered, 0); assert.equal(tree.props.data.length, 10000);
  assert.equal(tree.props.initialNumToRender, 8); assert.equal(tree.props.maxToRenderPerBatch, 8); assert.equal(tree.props.windowSize, 5);
  for (const index of [0, 4999, 9999]) tree.props.renderItem({ item: data[index], index });
  assert.equal(rendered, 3); h.unmount();
});

test('actual callbacks restore the same query and isolate late events, accounts and different filters', () => {
  const h = fixture(); h.render(base); h.tree.props.onLayout(layout(740)); h.tree.props.onScroll(scroll(900));
  const old = h.tree.props; h.render({ ...base, restoreKey: 'actor:b:query:two' });
  old.onScroll(scroll(99999)); old.onLayout(layout(740)); old.onContentSizeChange(360, 100000);
  assert.equal(h.api.rememberedResultOffset('actor:b:query:two'), 0);
  h.tree.props.onLayout(layout(740)); assert.equal(h.calls.at(-1).offset, 0);
  h.tree.props.onScroll(scroll(240)); h.unmount();
  h.remount(base); h.tree.props.onLayout(layout(740)); assert.equal(h.calls.at(-1).offset, 900);
  assert.equal(h.api.rememberedResultOffset('actor:b:query:two'), 240); h.unmount();
});

test('measured row heights remain available after a detail return', () => {
  const h = fixture(); h.render(base);
  h.tree.props.renderItem({ item: data[0], index: 0 }).props.onLayout(layout(211)); h.render();
  assert.deepEqual(h.tree.props.getItemLayout(data, 1), { index: 1, offset: 211, length: 120 });
  h.tree.props.onLayout(layout(740)); h.tree.props.onScroll(scroll(10000)); h.unmount();
  h.remount(base); assert.equal(h.tree.props.getItemLayout(data, 1).offset, 211);
  h.tree.props.onContentSizeChange(360, 1200091); assert.equal(h.calls.at(-1).offset, 10000); h.unmount();
});

test('restore waits for data and does not consume an offset while the same query reloads', () => {
  const h = fixture(); h.render(base); h.tree.props.onLayout(layout(740)); h.tree.props.onScroll(scroll(600)); h.unmount();
  h.remount({ ...base, data: [] }); const before = h.calls.length;
  h.tree.props.onContentSizeChange(360, 0); h.tree.props.onLayout(layout(740)); assert.equal(h.calls.length, before);
  h.render(base); h.tree.props.onContentSizeChange(360, 1200000); assert.equal(h.calls.at(-1).offset, 600); h.unmount();
});
