# Allwain v2 (Expo)

Flujo Expo conectado al backend existente (`/api/auth/*`, `/api/allwain/*`). Incluye login/registro, tabs principales, consumo de ofertas y demo de escaneo.

## Requisitos
- Node 18+ y npm 10+.
- Expo CLI (`npx expo start`).

## Backend
1. Ir a la carpeta `backend` en el monorepo.
2. Instalar dependencias y compilar:
   ```bash
   npm install
   npm run build
   npm start # o pm2 start dist/server.js --name newmersive-backend
   ```
3. El backend expone `http://<IP_LOCAL>:4000/api` y las rutas necesarias:
   - `POST /api/auth/register`
   - `POST /api/auth/login`
   - `GET /api/auth/me`
   - `GET /api/allwain/scan-demo`
   - `GET /api/allwain/offers`
   - `GET /api/allwain/sponsors/summary`

## Configuración de entorno (Expo)
1. Copia `.env.example` a `.env` dentro de `allwain-v2`.
2. Ajusta la IP local (la que muestra Expo en el QR) para que el móvil pueda alcanzar el backend:
   ```env
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.143:4000/api
   ```
   El prefijo `EXPO_PUBLIC_` hace que la variable esté disponible en el bundle de Expo.

## Ejecutar la app
1. En `allwain-v2` instala dependencias:
   ```bash
   npm install
   ```
2. Arranca Expo:
   ```bash
   npm start # alias de npx expo start
   ```
3. Escanea el QR con la app de Expo Go (en la misma red que el backend) o usa un emulador.

## Probar el flujo completo
1. **Registro/Login**
   - Desde la pantalla de autenticación, crea un usuario nuevo o inicia sesión.
   - Tras la respuesta correcta, el store de `auth` guarda `token` y `user` y `RootNavigator` cambia automáticamente al stack de tabs.
   - Los errores del backend (`INVALID_CREDENTIALS`, `EMAIL_ALREADY_EXISTS`, problemas de red) se muestran en pantalla y también se registran en la consola.
2. **Tabs principales**
   - `Inicio`: CTA directo a escanear.
   - `Escanear` → botón "Simular escaneo" lleva a `Resultado`, que llama `GET /allwain/scan-demo` y muestra producto + ofertas.
   - `Ofertas`: obtiene datos de `GET /allwain/offers`, muestra loader, estados vacío/error y permite recargar.
   - `Invitados`: lee `GET /allwain/sponsors/summary` para comisiones de referidos.
3. **Errores visibles**
   - Si hay problemas de red o token expirado, se muestran mensajes y se registran en consola para depurar (URL base, status de la API, etc.).

## Notas
- Usa `EXPO_PUBLIC_API_BASE_URL` para apuntar a staging/producción sin recompilar.
- Asegúrate de que el dispositivo y el backend estén en la misma red; de lo contrario, `fetch` fallará con `Network request failed`.
- El tema usa la paleta Allwain (salmon/dark), separada de TrueQIA.
