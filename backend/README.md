# Newmersive Backend

API en Node.js/TypeScript para TRUEQIA y ALLWAIN. Expone rutas bajo `/api` con autenticación JWT, ofertas demo y utilidades de IA simuladas.

Consulta la descripción detallada de rutas y lógica en [../docs/backend-architecture.md](../docs/backend-architecture.md).

## Requisitos
- Node.js 20.x (LTS recomendado) y npm 10.x.
- Acceso a red para instalar dependencias.
- Permisos de escritura en `data/database.json` (se crea automáticamente con semillas).

## Instalación
```bash
cd backend
npm install
```
Si tu entorno bloquea la instalación de Node/npm (como en este auditoría), instala Node manualmente o con `nvm` antes de ejecutar los comandos.

## Variables de entorno
Crea `.env` (opcional) en `backend/` con:

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `PORT` | Puerto de Express | `4000` |
| `JWT_SECRET` | Clave para firmar tokens | `dev-secret-change-me` |
| `NODE_ENV` | `development` \| `production` \| `test` | `development` |
| `DEMO_MODE` | Habilita comportamientos demo | `false` |
| `DATA_FILE` | Ruta del archivo JSON persistente | `./data/database.json` |

## Scripts
- **Desarrollo:** `npm run dev` (usa `ts-node-dev`, recarga automática).
- **Build:** `npm run build` (compila a `dist`).
- **Producción:** `npm start` (ejecuta `dist/server.js`).
- **Pruebas:** `npm test` (usa `node:test` + `ts-node/register`).

## Despliegue rápido en IONOS (Ubuntu + pm2)
1. Instala dependencias (Node 20+ ya presente):
   ```bash
   cd backend
   npm install
   npm run build
   ```
2. Lanza el servicio con pm2:
   ```bash
   pm2 start dist/server.js --name newmersive-backend \
     --env production \
     -- --port ${PORT:-4000}
   ```
3. Variables de entorno recomendadas:
   ```bash
   export PORT=4000
   export JWT_SECRET="cambia-esta-clave"
   export NODE_ENV=production
   export DATA_FILE="/var/newmersive/data/database.json" # opcional, ruta persistente
   ```
4. Verifica salud: `curl http://localhost:4000/api/health` debe responder `{ status: "ok" }`.

## Problemas conocidos
- En entornos sin Node/npm, `npm install` y los scripts fallan (`bash: command not found: npm`). Instala Node (v20 LTS) o ejecuta en una imagen que ya lo incluya.
- Asegura que `JWT_SECRET` no sea el valor por defecto en entornos productivos.

## Endpoints principales
- `GET /api/health` — estado del servicio.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` — autenticación y perfil.
- `GET /api/trueqia/offers`, `GET /api/trueqia/trades`, `POST /api/trueqia/contracts/preview` — flujo TrueQIA.
- `GET /api/allwain/scan-demo`, `GET /api/allwain/offers` — flujo Allwain.
- `POST /api/leads/whatsapp` — registra un lead capturado por el bot de WhatsApp y lo almacena para el panel admin.
- `GET /api/admin/dashboard`, `/api/admin/users`, `/api/admin/ai/activity` — endpoints protegidos para admin.
