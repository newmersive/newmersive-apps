# TRUEQIA v2 (Expo SDK 54)

Aplicación Expo/React Native para trueques con tokens, patrocinadores y contratos demo. Usa el backend unificado bajo `/api/trueqia/*`.

Arquitectura ampliada: [../docs/trueqia-architecture.md](../docs/trueqia-architecture.md).

## Cómo arrancar
```bash
cd trueqia-v2
npm install
npx expo start
```
Usa Expo Go o emulador compatible con SDK 54.

## Tabs y flujo
- **Inicio/Home:** resumen y accesos rápidos.
- **Patrocinador:** muestra tu `sponsorCode` y referidos.
- **Ofertas:** lista y creación de ofertas contra `/api/trueqia/offers`.
- **Trueques:** listado y propuesta de trueques contra `/api/trueqia/trades`.
- **Contratos:** genera previsualización con `/api/trueqia/contracts/preview`.

## Dependencias clave
- Expo 54, React 19.1.0, React Native 0.81.5.
- Zustand para estado (`auth.store.ts`, `offers.store.ts`, `trades.store.ts`).
- React Navigation (`@react-navigation/native`, `native-stack`, `bottom-tabs`).
- AsyncStorage para persistir la sesión en `auth.store.ts`.

## Configuración de entorno
```env
EXPO_PUBLIC_API_BASE_URL=http://<IP_LOCAL>:4000/api
```
Requiere que el backend sea accesible desde el dispositivo. La variable se expone en el bundle gracias al prefijo `EXPO_PUBLIC_`.
