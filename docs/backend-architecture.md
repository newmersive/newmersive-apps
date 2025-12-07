# Arquitectura del Backend

## Propósito
- API unificada para TrueQIA y Allwain con autenticación JWT, ofertas, contratos demo y panel admin.
- Servir datos semilla desde `data/database.json` para pruebas sin depender de una base externa.

## Componentes principales
- **Stack**: Node.js + Express + TypeScript.
- **Entrada**: `src/server.ts` monta Express, CORS y router `/api`.
- **Rutas** (`src/routes`):
  - `auth.routes`: registro/login/me.
  - `trueqia.routes`: ofertas y contratos demo.
  - `allwain.routes`: escaneo demo, productos, ofertas, grupos de pedido y referidos.
  - `admin.routes`: dashboard, usuarios, actividad IA, resumen de sponsors.
  - `health.routes`: ping.
- **Controladores/servicios**:
  - `services/auth.service.ts`: gestión de usuarios, generación de tokens, validación de sponsor codes.
  - `services/data.store.ts`: lectura/escritura de `data/database.json`, seed de usuarios/ofertas.
  - `services/trueqia.service.ts` y `services/allwain.service.ts`: lógica de dominio.
  - `ia/moderation.service.ts` y `ia/contracts.service.ts`: respuestas demo IA.
- **Middleware** (`middleware/auth.middleware.ts`): validación de JWT y rol admin.
- **Tipos compartidos** (`src/shared/types.ts`): User, Offer, Trade, etc.

## Modelo de datos
- Persistencia en archivo JSON (`data/database.json`) con carga en memoria.
- Seed automático en `data.store.ts` garantiza:
  - Usuario admin `admin@newmersive.local` (rol `admin`).
  - Cuatro ofertas base (2 TrueQIA, 2 Allwain) y trades demo.
- Campos clave de `User`: `id`, `name`, `email`, `passwordHash`, `role`, `sponsorCode`, `referredByCode`, saldos y métricas Allwain.

## Endpoints (prefijo `/api`)
| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| GET | /health | Ping con `env`. | Público |
| POST | /auth/register | Alta de usuario y token (roles whitelist). | Público |
| POST | /auth/login | Login y token. | Público |
| GET | /auth/me | Perfil del usuario autenticado. | Bearer |
| GET | /trueqia/offers | Ofertas de owner `trueqia`. | Bearer |
| GET | /trueqia/trades | Trades demo. | Bearer |
| POST | /trueqia/contracts/preview | Texto de contrato demo (IA). | Bearer |
| GET | /allwain/scan-demo | Respuesta mock de escaneo QR/EAN. | Bearer |
| GET | /allwain/products/:id | Producto por ID. | Bearer |
| GET | /allwain/products?ean= | Producto por EAN. | Bearer |
| GET | /allwain/offers | Ofertas (filtros opcionales `lat`,`lng`,`location`). | Bearer |
| POST | /allwain/offers | Crear oferta (owner usuario). | Bearer |
| POST | /allwain/offers/:id/interest | Registrar lead. | Bearer |
| GET | /allwain/order-groups | Grupos de compra. | Bearer |
| POST | /allwain/order-groups | Crear grupo de compra. | Bearer |
| POST | /allwain/order-groups/:id/join | Unirse a grupo. | Bearer |
| POST | /allwain/savings | Registrar ahorro y comisión sponsor. | Bearer |
| GET | /allwain/sponsors/summary | Resumen de referidos Allwain. | Admin |
| GET | /admin/dashboard | Ping protegido admin. | Admin |
| GET | /admin/users | Lista pública de usuarios. | Admin |
| GET | /admin/ai/activity | Eventos demo de moderación. | Admin |

### Autenticación y roles
- `authRequired` exige `Authorization: Bearer <token>` firmado con `ENV.JWT_SECRET`; adjunta `{ id, email, role }` en `req.user`.
- `adminOnly` valida `req.user.role === "admin"`.
- Tokens se firman a 7 días (`sub`, `email`, `role`).
- Registro limitado a roles `user`, `company`, `admin`, `buyer`; fallback `user`.

## Cómo se despliega
1. Variables de entorno (`.env`): `PORT=4000`, `JWT_SECRET=<cadena>`, `DATA_FILE` opcional para usar un JSON alternativo.
2. Instalar dependencias: `cd backend && npm install` (Node >= 18).
3. Compilar: `npm run build` (genera `dist/`).
4. Arrancar: `npm run start` (o `npm run dev` para hot reload). Exponer puerto 4000 y apuntar apps móviles a `http://<host>:<PORT>/api`.
5. Producción recomendable con `pm2`/`systemd` para reinicios y logs; montar backup del `data/database.json` o setear `DATA_FILE` en ruta persistente.

## Cómo se repara (errores típicos)
- **401/INVALID_TOKEN**: token expirado o `JWT_SECRET` distinto entre instancias; regenerar `.env` consistente y reloguear.
- **Archivo JSON corrupto**: si `data/database.json` se rompe, ejecutar `npm run dev` para que `data.store.ts` regenere seed o restaurar backup indicado por `DATA_FILE`.
- **MISSING_FIELDS/INVALID_* en `/allwain`**: revisar payload numérico (`units`, `price`, `tokens`) y tipos; logs en consola muestran validaciones.
- **CORS o JSON parse errors**: asegúrate de enviar `Content-Type: application/json`; CORS está abierto por defecto pero proxies pueden añadir cabeceras restrictivas.
- **Puerto en uso**: ajustar `PORT` o liberar servicio previo (`lsof -i :4000`).

## Tests
- `tests/auth.spec.ts`: registro/login y middleware (token ausente/rol admin). Usa `TestClient` con servidor efímero.
- `tests/offers.spec.ts`: `/trueqia/offers` y `/allwain/offers` con validación de owner y auth.
- Ejecutar con `npm test` (Node >= 18). No se ejecutaron en esta sesión.

## Ejecución local rápida
1. `npm install`
2. `npm run dev` (puerto 4000).
3. Ajustar `EXPO_PUBLIC_API_BASE_URL` en apps a `http://<tu-ip>:4000/api`.
