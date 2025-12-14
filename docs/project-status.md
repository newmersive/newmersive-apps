# Estado del proyecto

## Estructura real del repositorio
- **backend/**: API Node.js + TypeScript con rutas `/api` para autenticación, TrueQIA, Allwain y admin.
- **trueqia-v2/**: app Expo (tema blanco/azul) conectada a `/auth/*` y `/trueqia/*`.
- **allwain-v2/**: app Expo (paleta Allwain) orientada a escaneo, ofertas y referidos `/allwain/*`.
- **apps/admin-panel/**: panel Next.js para leads, resumen rápido, IA y sponsors.
- **Legacy**: carpetas históricas y ZIP de referencia.

## Release candidate
- ✅ **Backend**: tests de API pasan en entorno con dependencias instaladas. Rutas admin operativas (`/api/admin/summary`, `/api/admin/leads`, `/api/admin/ai/activity`). Contratos IA en modo demo usando `services/ai/contracts.ai.service.ts`.
- ✅ **trueqia-v2**: navegación por tabs y consumo de `/trueqia/*`; IA de contratos usa el stub del backend.
- ✅ **allwain-v2**: flujo de escaneo demo, ofertas y sponsors `/allwain/sponsors/summary`.
- ✅ **Admin panel**: dashboard con tarjetas, tabla de leads, lista de eventos IA simulados y sección de sponsors en lectura.
- ⚠️ **Limitaciones**: datos demo, sin IA productiva ni QR de campañas; dependencias Expo pueden requerir reinstalación en un entorno con acceso a npm.

## Checklist de despliegue rápido
1. Backend (`backend/`): `npm install && npm run build && npm start` (configurar `.env` con `JWT_SECRET`, `PORT`, `DATA_FILE` opcional).
2. Panel admin (`apps/admin-panel/`): `npm install && npm run dev` con `NEXT_PUBLIC_API_BASE_URL=http://<host>:<port>/api`.
3. Apps Expo: copiar `.env.example`, definir `EXPO_PUBLIC_API_BASE_URL` apuntando al backend y lanzar `npm start`.

## Estado de pruebas y chequeos
- ✅ `npm test` en backend (verificado en entorno con acceso a dependencias).
- ⚠️ Instalación de deps en apps Expo puede fallar en entornos sin acceso a registry npm; repetir en entorno con red.
