# Estado del proyecto

## Estructura real del repositorio
- **backend/**: API Node.js + TypeScript con rutas `/api` para autenticación, TrueQIA y Allwain.
- **trueqia-v2/**: app Expo (tema blanco/azul) con navegación tabs y llamadas a `/auth/*` y `/trueqia/*`.
- **allwain-v2/**: app Expo (paleta Allwain salmon/dark) orientada a escaneo, ofertas y referidos `/allwain/*`.
- **Legacy**: carpetas `trueqia/` y `allwain/` anteriores y los ZIP (`*-full.zip`, `newmersive-vfinal.zip`) se conservan solo como respaldo y no forman parte del RC.

## Release candidate – ready for IONOS
- ✅ **Backend**: `npm test` pasa con Node 22; scripts `build`/`start` listos para `npm install && npm run build && npm start`. Endpoints montados en `/api` y panel admin protegido.【b1ff4b†L1-L16】
- ✅ **trueqia-v2**: navegación con `NavigationContainer` + tabs (Trades/Chat/Profile), API base vía `EXPO_PUBLIC_API_BASE_URL`, comparte auth con Allwain y mantiene tema propio. Lint/typecheck pendientes por bloqueo de registro npm 403 en este entorno.【2ffe57†L1-L6】【d37072†L1-L9】
- ✅ **allwain-v2**: tabs Inicio/Escanear/Resultado/Ofertas/Invitados/Perfil con flujo de escaneo (`/allwain/scan-demo`), ofertas (`/allwain/offers`) y referidos (`/allwain/sponsors/summary`). Uso de `EXPO_PUBLIC_API_BASE_URL`. Instalación de deps pendiente por 403 al registry npm en este entorno.【d4ba63†L1-L8】
- ⚠️ **Limitaciones conocidas**: datos demo (ofertas/ahorros), escaneo mock (sin cámara real), sin pasarela de pago real, sin IA productiva (solo stubs de contratos/moderación), dependencias npm no instalables en este entorno por bloqueo 403.

## Checklist “Paco” en IONOS
1. Clonar repo y situarse en `backend/`.
2. Configurar `.env` (PORT, JWT_SECRET, NODE_ENV=production, DATA_FILE opcional) y ejecutar:
   ```bash
   npm install
   npm run build
   pm2 start dist/server.js --name newmersive-backend -- --port ${PORT:-4000}
   ```
3. Ajustar Nginx como proxy a `localhost:4000` si aplica.
4. Para móviles: copiar `.env.example` en `trueqia-v2/` y `allwain-v2/`, poner `EXPO_PUBLIC_API_BASE_URL=http://<ip-vps>:4000/api` y lanzar `npm start` (Expo Go o emulador).
5. Panel admin: usar el seed `admin@newmersive.local` con su password demo para consultar `/api/admin/*`.

## Estado de pruebas y chequeos
- ✅ `npm test` en backend【b1ff4b†L1-L16】
- ⚠️ `npm install` en trueqia-v2/allwain-v2 bloqueado por 403 al registry npm (pendiente repetir en entorno con acceso).【2ffe57†L1-L6】【d4ba63†L1-L8】
