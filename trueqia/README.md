# TRUEQIA (app móvil)

Aplicación Expo/React Native orientada a trueques con autenticación JWT y navegación por pestañas (Trades, Chat, Profile).

- Arquitectura detallada: [../docs/trueqia-architecture.md](../docs/trueqia-architecture.md).
- Backend asociado: rutas `/api/auth/*` y `/api/trueqia/*` descritas en [../docs/backend-architecture.md](../docs/backend-architecture.md).

## Requisitos
- Node.js 20.x, npm 10.x y Expo CLI (`npx expo`).
- Dispositivo o emulador configurado con SDK 54.

## Instalación y comandos
```bash
cd trueqia
npm install
npm run lint      # linting (si falla por dependencias, revisa versiones de RN/Expo)
npm run typecheck # comprobación TypeScript
npm start         # alias de `npx expo start`
```
Configura `EXPO_PUBLIC_API_BASE_URL` en `.env` o variables de entorno para apuntar al backend (por defecto `http://localhost:4000/api`).

## Problemas detectados
- En este entorno no se pudieron ejecutar los comandos porque `npm`/`node` no están instalados. Instala Node (v20 LTS) antes de lanzar Expo.
- Si Expo lanza advertencias de peer dependencies, reinstala sin `--legacy-peer-deps` y valida con `npm run lint`.

## Flujo rápido
1. Ejecuta `npm start` y abre la app en Expo Go.
2. Regístrate o inicia sesión (crea admin seed si usas el backend incluido).
3. Navega a pestaña **Trades** (mock) y usa ofertas/contratos desde las pantallas conectadas al backend.
