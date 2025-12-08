# Allwain v2 (Expo SDK 54)

Aplicación móvil Expo/React Native (React 19.1.0, RN 0.81.5) enfocada en escaneo de productos, ofertas y referidos. Usa el backend unificado bajo `/api/allwain/*`.

Arquitectura detallada: [../docs/allwain-architecture.md](../docs/allwain-architecture.md).

## Cómo arrancar
```bash
cd allwain-v2
npm install
npx expo start
```
Abre el proyecto en Expo Go o emulador (SDK 54).

## Configuración de entorno
Define la URL del backend accesible desde el dispositivo:
```env
EXPO_PUBLIC_API_BASE_URL=http://<IP_LOCAL>:4000/api
```
(El prefijo `EXPO_PUBLIC_` es requerido por Expo para exponer la variable en el bundle.)

## Dependencias clave
- Expo 54, React 19.1.0, React Native 0.81.5.
- React Navigation (`@react-navigation/native`, `native-stack`, `bottom-tabs`).
- Zustand para el store de autenticación.

## Endpoints consumidos
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- Allwain: `GET /api/allwain/scan-demo`, `GET /api/allwain/offers`, `GET /api/allwain/products`, `GET /api/allwain/order-groups`, `POST /api/allwain/order-groups`, `POST /api/allwain/order-groups/:id/join`, `POST /api/allwain/savings`, `GET /api/allwain/sponsors/summary`.

## Notas
- `auth.store.ts` mantiene `token` y `user`; `api.ts` borra sesión si el backend responde 401.
- Mantén backend y dispositivo en la misma red o usa túnel (ngrok/Expo) para acceder a `EXPO_PUBLIC_API_BASE_URL`.
