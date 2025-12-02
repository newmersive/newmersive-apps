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
- **Relaciones**: usuarios asociados a roles; ofertas se filtran por `owner`; trades contienen correos participantes. Persistencia en arrays (sin BD relacional).
- **Almacenamiento** (`data.store.ts`):
  - Lee/escribe JSON, inicializa ofertas y trades demo y crea el usuario admin.
  - Operaciones: `getDatabase`, `persistDatabase`, `resetDatabase`, `upsertUser`, `setUsers`, `getOffersForOwner`, `getTrades`.

## Tabla de endpoints (prefijo `/api`)
| Método | Ruta | Descripción | Modelos | Auth |
| --- | --- | --- | --- | --- |
| GET | /health | Ping con `status` y `env`. | – | Público |
| POST | /auth/register | Registra usuario (roles permitidos en whitelist) y devuelve token. | User | Público |
| POST | /auth/login | Autentica y devuelve token. | User | Público |
| GET | /auth/me | Perfil del usuario autenticado. | User | Bearer |
| GET | /trueqia/offers | Ofertas filtradas por owner `trueqia`. | Offer | Bearer |
| GET | /trueqia/trades | Lista de trades demo. | Trade | Bearer |
| POST | /trueqia/contracts/preview | Devuelve texto de contrato demo generado en backend IA. | – | Bearer |
| GET | /allwain/scan-demo | Respuesta mock de escaneo QR/etiqueta. | – | Bearer |
| GET | /allwain/offers | Ofertas con owner `allwain`. | Offer | Bearer |
| GET | /admin/dashboard | Ping protegido para admin. | – | Bearer (admin) |
| GET | /admin/users | Lista pública de usuarios (sin password). | User | Bearer (admin) |
| GET | /admin/ai/activity | Lista de eventos demo de moderación. | – | Bearer (admin) |

### Consumo por apps
- **TrueQIA**: usa `/auth/register`, `/auth/login`, `/trueqia/offers`, `/trueqia/contracts/preview` (trades aún no conectados en UI), `/auth/me` disponible.
- **Allwain**: usa `/auth/register`, `/auth/login`, `/allwain/scan-demo` (flujo de escaneo) y `/allwain/offers` (pestaña Ofertas).

## Autenticación y roles
- Middleware `authRequired`: valida header `Authorization: Bearer <token>`, usa `jwt.verify` con `ENV.JWT_SECRET`; si es válido adjunta `{id,email,role}` en `req.user`.
- Middleware `adminOnly`: requiere `req.user.role === "admin"`; responde 403 en caso contrario.
- Tokens se firman a 7 días (`registerUser`/`loginUser`) y contienen `sub`, `email`, `role`.
- Roles permitidos en registro: `user`, `company`, `admin`, `buyer` (fallback a `user`).

## Seeds y coherencia de datos
- Archivo `data/database.json` y `data.store.ts` comparten las mismas semillas por defecto (admin + 4 ofertas divididas entre owners y 2 trades demo).
- Los endpoints `listOffers` filtran por owner, garantizando que Allwain y TrueQIA no comparten ofertas.
- No hay refresco automático de datos; si se modifica el JSON manualmente es necesario reiniciar para recargar cache.

## Tests
- Suite en `tests/auth.spec.ts` con helper `TestClient`:
  - Cubre registro y login (estado/estructura del token).
  - Verifica middleware: rechazo sin token, token inválido, bloqueo de usuario no admin y acceso permitido a admin.
- Huecos: sin pruebas para rutas `trueqia/*`, `allwain/*`, persistencia ni generación de contratos/moderación.
