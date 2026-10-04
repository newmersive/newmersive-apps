const assert = require('node:assert/strict');
const { it } = require('node:test');
const load = require('./helpers/load-typescript.cjs');
function setup(accuracy, fail = false) {
  const calls = [];
  const api = load('src/utils/currentLocation.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-location': {
      Accuracy: { Highest: 6 },
      requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      getCurrentPositionAsync: async options => {
        calls.push(options);
        if (fail) throw Error('unavailable');
        return { coords: { latitude: 39.5334567, longitude: -0.3578912, accuracy } };
      },
      getLastKnownPositionAsync: async () => { throw Error('MUST_NOT_USE_OLD_POSITION'); },
      reverseGeocodeAsync: async point => {
        calls.push(point);
        return [{ street: 'Calle prueba', streetNumber: '2', city: 'Foios' }];
      },
    },
  });
  return { ...api, calls };
}
it('keeps precise coordinates for delivery and geocodes the original fix', async () => {
  const api = setup(8);
  const point = await api.getAllwainCurrentLocation({ preciseDelivery: true });
  assert.equal(point.latitude, 39.5334567);
  assert.equal(point.longitude, -0.3578912);
  assert.equal(point.address, 'Calle prueba 2, Foios');
  assert.deepEqual(api.calls[0], { accuracy: 6 });
  assert.equal(api.calls[1].latitude, point.latitude);
});
it('rejects coarse or unknown accuracy and never falls back to an old fix', async () => {
  for (const accuracy of [800, null]) {
    await assert.rejects(setup(accuracy).getAllwainCurrentLocation(), /suficiente precisión/);
  }
  await assert.rejects(setup(5, true).getAllwainCurrentLocation(), /No pudimos obtener/);
});
it('keeps public proximity coordinates rounded while using an accurate address', async () => {
  const point = await setup(8).getAllwainCurrentLocation();
  assert.equal(point.latitude, 39.533);
  assert.equal(point.address, 'Calle prueba 2, Foios');
});
