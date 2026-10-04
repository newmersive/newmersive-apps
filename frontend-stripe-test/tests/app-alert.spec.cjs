const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadAlert(platform = 'web') {
  const nativeCalls = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/appAlert.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.equal(name, 'react-native');
      return { Platform: { OS: platform }, Alert: { alert: (...args) => nativeCalls.push(args) } };
    },
  });
  return { ...exports, nativeCalls };
}

test('confirmation executes only after acceptance, and only once', () => {
  const api = loadAlert();
  let submitted = 0;
  api.AppAlert.alert('Cancelar pedido', 'Se liberará la reserva.', [
    { text: 'Volver', style: 'cancel' },
    { text: 'Cancelar pedido', style: 'destructive', onPress: () => submitted++ },
  ]);
  const id = api.getAppAlert().id;
  assert.equal(submitted, 0);
  api.chooseAppAlert(id, 1);
  api.chooseAppAlert(id, 1);
  assert.equal(submitted, 1);
  assert.equal(api.getAppAlert(), null);
});

test('back/escape never invokes the destructive action', () => {
  const api = loadAlert();
  let canceled = 0;
  let dismissed = 0;
  let submitted = 0;
  api.AppAlert.alert('Repetir captura', undefined, [
    { text: 'Volver', style: 'cancel', onPress: () => canceled++ },
    { text: 'Anular y repetir', style: 'destructive', onPress: () => submitted++ },
  ], { onDismiss: () => dismissed++ });
  api.dismissAppAlert(api.getAppAlert().id);
  assert.equal(submitted, 0);
  assert.equal(canceled, 1);
  assert.equal(dismissed, 1);
});

test('queued alerts and alerts opened by a callback are preserved', () => {
  const api = loadAlert();
  let updates = 0;
  const unsubscribe = api.subscribeAppAlert(() => updates++);
  api.AppAlert.alert('Primera', '', [{ text: 'Continuar', onPress: () => api.AppAlert.alert('Tercera') }]);
  api.AppAlert.alert('Segunda');
  const firstId = api.getAppAlert().id;
  api.chooseAppAlert(firstId, 0);
  assert.equal(api.getAppAlert().title, 'Segunda');
  api.chooseAppAlert(firstId, 0);
  assert.equal(api.getAppAlert().title, 'Segunda');
  api.chooseAppAlert(api.getAppAlert().id, 0);
  assert.equal(api.getAppAlert().title, 'Tercera');
  api.dismissAppAlert(api.getAppAlert().id);
  assert.equal(api.getAppAlert(), null);
  assert.ok(updates >= 5);
  unsubscribe();
});

test('native platforms retain their native alert behavior', () => {
  for (const platform of ['android', 'ios']) {
    const api = loadAlert(platform);
    const buttons = [{ text: 'Aceptar', onPress: () => {} }];
    const options = { cancelable: false };
    api.AppAlert.alert('Título', 'Mensaje', buttons, options);
    assert.equal(api.nativeCalls.length, 1);
    assert.equal(api.nativeCalls[0][0], 'Título');
    assert.equal(api.nativeCalls[0][2], buttons);
    assert.equal(api.nativeCalls[0][3], options);
    assert.equal(api.getAppAlert(), null);
  }
});
