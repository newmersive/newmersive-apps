# Arquitectura del Backend

## Resumen general
- **Stack**: Node.js + Express + TypeScript. Persistencia en archivo JSON (`data/database.json`) mediante utilidades en `src/services/data.store.ts`. JWT para autenticación; bcrypt para hashes.
- **Estructura**:
  - `src/server.ts`: arranque de Express, montaje de `/api`.
  - `src/routes`: definición de rutas agrupadas (`auth`, `trueqia`, `allwain`, `admin`, `health`).
  - `src/controllers`: lógica HTTP para auth.
  - `src/services`: servicios de dominio (auth, market, data store).
  - `src/ia`: helpers demo (contratos, moderación).
  - `src/middleware`: autenticación/roles.
  - `data/`: archivo JSON con datos semilla.

## Modelo de datos
- Definido en `src/shared/types.ts`:
  - **User**: `id`, `name`, `email`, `passwordHash`, `role` (`user|buyer|company|admin`), `createdAt`.
  - **AuthUser/AuthTokenResponse**: versión pública sin `passwordHash` + token.
  - **Offer**: `id`, `title`, `description`, `tokens`, `owner` (`trueqia|allwain`), `category`.
  - **Trade**: `id`, `title`, `status`, `participants`, `tokens`.
- **Almacenamiento** (`data.store.ts`):
  - Lee/escribe JSON, inicializa ofertas y trades demo y asegura que siempre exista el usuario admin + 4 ofertas base (si faltan en el JSON se reinyectan).
  - Operaciones: `getDatabase`, `persistDatabase`, `resetDatabase`, `upsertUser`, `setUsers`, `getOffersForOwner`, `getTrades`.

## Tabla de endpoints (prefijo `/api`)
| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| GET | /health | Ping con `env`. | Público |
| POST | /auth/register | Registra usuario (roles whitelist) y devuelve token. | Público |
| POST | /auth/login | Autentica y devuelve token. | Público |
| GET | /auth/me | Perfil del usuario autenticado. | Bearer |
| GET | /trueqia/offers | Ofertas filtradas por owner `trueqia`. | Bearer |
| GET | /trueqia/trades | Lista de trades demo. | Bearer |
| POST | /trueqia/contracts/preview | Devuelve texto de contrato demo generado en backend IA. | Bearer |
| GET | /allwain/scan-demo | Respuesta mock de escaneo QR/etiqueta. | Bearer |
| GET | /allwain/offers | Ofertas con owner `allwain`. | Bearer |
| GET | /admin/dashboard | Ping protegido para admin. | Bearer (admin) |
| GET | /admin/users | Lista pública de usuarios (sin password). | Bearer (admin) |
| GET | /admin/ai/activity | Lista de eventos demo de moderación. | Bearer (admin) |

### Autenticación y roles
- `authRequired`: valida `Authorization: Bearer <token>`, usa `jwt.verify` con `ENV.JWT_SECRET`; adjunta `{id,email,role}` en `req.user`. Errores consistentes: `{ code: "UNAUTHORIZED" }` o `{ code: "INVALID_TOKEN" }`.
- `adminOnly`: requiere `req.user.role === "admin"`; responde `{ code: "FORBIDDEN" }`.
- Tokens se firman a 7 días y contienen `sub`, `email`, `role`.
- Roles permitidos en registro: `user`, `company`, `admin`, `buyer` (fallback a `user`).
- Seed automático: `auth.service` crea admin `admin@newmersive.local` con `admin123` si no existe.

### Consumo por apps
- **TrueQIA**: `/auth/register`, `/auth/login`, `/trueqia/offers`, `/trueqia/contracts/preview`, `/trueqia/trades`, `/auth/me`.
- **Allwain**: `/auth/register`, `/auth/login`, `/allwain/scan-demo`, `/allwain/offers`.

## Tests
- `tests/auth.spec.ts`: cubre registro/login y middleware (token ausente, inválido, rol no admin, acceso admin). Usa helper `TestClient` que arranca el servidor en puerto efímero.
- `tests/offers.spec.ts`: valida que `/trueqia/offers` y `/allwain/offers` requieren token y filtran por `owner`.
- **Estado de ejecución**: no se ejecutaron en esta auditoría por falta de Node/npm; requieren `npm test` con Node ≥ 18.

## Ejecución local
1. `npm install`
2. `npm run dev` (puerto `4000` por defecto) o `npm test` para la suite.
3. Ajusta `EXPO_PUBLIC_API_BASE_URL` en apps móviles apuntando a `http://<tu-ip>:<PORT>/api`.
