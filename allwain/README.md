# Allwain (app móvil)

App Expo/React Native enfocada en ofertas y escaneo demo, compartiendo backend con TRUEQIA.

- Arquitectura detallada: [../docs/allwain-architecture.md](../docs/allwain-architecture.md).
- Backend asociado: rutas `/api/auth/*` y `/api/allwain/*` descritas en [../docs/backend-architecture.md](../docs/backend-architecture.md).

## Requisitos
- Node.js 20.x, npm 10.x y Expo CLI (`npx expo`).
- Dispositivo o emulador compatible con Expo SDK 54.

## Instalación y comandos
```bash
cd allwain
npm install
npm run lint      # opcional, valida ESLint
npm run typecheck # opcional, valida TypeScript
npm start         # alias de `npx expo start`
```
Configura `EXPO_PUBLIC_API_BASE_URL` hacia el backend (p. ej. `http://localhost:4000/api`).

## Problemas detectados
- No se ejecutaron los comandos en este entorno por falta de Node/npm; instala Node LTS antes de arrancar Expo.
- Si aparecen conflictos de peer dependencies de React Native/Expo, reinstala sin flags y verifica con `npm run lint`.

## Flujo rápido
1. Arranca Expo con `npm start`.
2. Autentícate (registra usuario o usa admin seed del backend).
3. Usa pestañas **Buscar**, **Ofertas**, **Perfil**; prueba el flujo de escaneo demo desde los accesos en Buscar/Ofertas.
