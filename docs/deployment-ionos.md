# Despliegue en IONOS

## Propósito
- Guía rápida para publicar el backend Node y las apps Expo conectadas en infraestructura IONOS (VPS/Cloud).
- Asegurar que cualquier persona pueda levantar el stack sin el fundador.

## Componentes implicados
- **Backend**: carpeta `backend` (Node + Express). Requiere Node >= 18.
- **Frontends móviles**: carpetas `trueqia` y `allwain` (Expo). Se conectan al backend via `EXPO_PUBLIC_API_BASE_URL`.
- **Datos**: archivo `backend/data/database.json` (o el definido en `DATA_FILE`) debe residir en disco persistente.
- **Reverse proxy**: recomendado Nginx/Apache en IONOS para TLS y balanceo.

## Pasos de despliegue
1. **Provisionar servidor**: VPS con Ubuntu/Debian, puertos 80/443/4000 abiertos. Instalar Node 18+ (`nvm` o paquetes oficiales) y `git`.
2. **Clonar proyecto**: `git clone` y `cd backend`.
3. **Configurar entorno**: crear `/opt/newmersive/.env` (o similar) con `PORT=4000`, `JWT_SECRET=<secreto>`, `NODE_ENV=production`, `DATA_FILE=/var/lib/newmersive/database.json` (ruta persistente). Copiar `backend/data/database.json` inicial a esa ruta.
4. **Instalar dependencias**: `npm install`.
5. **Build + start**: `npm run build` y luego `npm run start` (idealmente con `pm2 start dist/server.js --name newmersive-api -- env .env`). Verificar `curl http://localhost:4000/api/health`.
6. **Reverse proxy**: configurar Nginx para apuntar `server_name api.midominio.com` → `http://localhost:4000`; habilitar HTTPS con Certbot/Let’s Encrypt.
7. **Apps Expo**: en `trueqia` y `allwain`, setear `EXPO_PUBLIC_API_BASE_URL=https://api.midominio.com/api` y generar builds si se necesitan binarios.

## Cómo se repara (errores típicos)
- **API inaccesible desde Internet**: revisar firewall IONOS (Security Group) y reglas locales `ufw`; proxy debe reenviar a puerto 4000.
- **502 en Nginx**: proceso Node caído o puerto incorrecto; chequear `pm2 logs`/`journalctl` y que `PORT` coincida con el `proxy_pass`.
- **Pérdida de datos tras reinicio**: `DATA_FILE` no estaba en partición persistente; mover JSON a `/var/lib/newmersive/` y actualizar `.env`.
- **HTTPS caducado**: renovar certificados con `certbot renew` y configurar cron/systemd timer.
- **Las apps no autentican**: base URL equivocada o `JWT_SECRET` cambiado; alinear `.env` y forzar relogin.
