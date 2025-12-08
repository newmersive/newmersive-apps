# Newmersive Backend

API en Node.js/TypeScript que sirve a **TrueQIA** y **Allwain** bajo el prefijo `/api` con autenticación JWT y datos semilla en JSON.

Consulta la descripción ampliada en [../docs/backend-architecture.md](../docs/backend-architecture.md).

## Arranque rápido
```bash
cd backend
npm install
npm run dev            # desarrollo con recarga
# o
npm run build && npm start  # producción (usa dist/)
```

## Variables de entorno mínimas
| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `PORT` | Puerto HTTP | `4000` |
| `JWT_SECRET` | Clave para firmar/verificar tokens | `dev-secret-change-me` |
| `DATA_FILE` | Ruta de persistencia JSON | `./data/database.json` |
| `NODE_ENV` | `development`\|`production` | `development` |

## Endpoints principales (prefijo `/api`)
- `GET /health` — estado del servicio.
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me` — autenticación y perfil.
- `GET /trueqia/offers`, `POST /trueqia/offers`, `GET /trueqia/trades`, `POST /trueqia/contracts/preview` — flujo TrueQIA.
- `GET /allwain/scan-demo`, `GET /allwain/offers`, `GET /allwain/order-groups`, `GET /allwain/sponsors/summary` — flujo Allwain.
- `POST /leads/whatsapp` — registro de leads externos (ej. bot de WhatsApp).
- `GET /admin/dashboard`, `/admin/users`, `/admin/ai/activity` — panel admin protegido (`adminOnly`).

## Notas
- El archivo `data/database.json` se crea/actualiza automáticamente con datos semilla.
- Rutas protegidas requieren cabecera `Authorization: Bearer <token>`.
