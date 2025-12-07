# Arquitectura del Backend

## Propósito
- API unificada para **TrueQIA** y **Allwain** con autenticación JWT, ofertas, contratos demo y panel admin.
- Servir datos semilla desde `data/database.json` para pruebas sin depender de una base externa.
- Dejar preparado el terreno para integrar un **bot de WhatsApp** que genere leads hacia TrueQIA/Allwain.

## Componentes principales

- **Stack**: Node.js + Express + TypeScript.
- **Entrada**: `src/server.ts`
  - Monta Express.
  - Configura CORS y JSON body parser.
  - Enruta todo bajo `/api`.
- **Rutas** (`src/routes`):
  - `auth.routes.ts`: registro/login/me, reset password.
  - `trueqia.routes.ts`: ofertas, trades y contratos demo de TrueQIA.
  - `allwain.routes.ts`: escaneo demo, productos, ofertas, grupos de pedido, ahorro/comisiones y referidos.
  - `admin.routes.ts`: dashboard, usuarios, actividad IA, leads globales.
  - `health.routes.ts`: ping/estado.
- **Servicios**:
  - `services/auth.service.ts`:
    - Registro/login.
    - Generación de JWT.
    - Cálculo de `userIdCounter`.
    - Sistema de referidos (`sponsorCode`, `referredByCode`) y tokens iniciales según app.
    - Reset de contraseña con tokens temporales.
  - `services/data.store.ts`:
    - Capa de acceso a `data/database.json`.
    - Carga en memoria, merge de datos semilla y persistencia.
    - Helpers para usuarios, ofertas, trades, contratos, leads y tokens de reset.
  - `services/trueqia.service.ts`:
    - Listado de ofertas (con opción de excluir las del propio usuario).
    - Alta de ofertas TrueQIA.
    - Creación, aceptación y rechazo de trades con movimiento de tokens internos.
  - `services/allwain.service.ts` (y/o lógica en `allwain.routes.ts`):
    - Demo de escaneo (`/scan-demo`).
    - Ofertas Allwain, grupos de compra, cálculo de ahorro y comisiones por sponsor.
  - `ia/moderation.service.ts`:
    - Stub/demo para moderación IA de contenido o actividad.
  - `ia/contracts.service.ts`:
    - Generación de texto de contrato demo para TrueQIA.
- **Middleware**:
  - `middleware/auth.middleware.ts`:
    - `authRequired`: valida JWT y rellena `req.user`.
    - `adminOnly`: restringe rutas a rol `admin`.
- **Tipos compartidos** (`src/shared/types.ts`):
  - Modelos TypeScript para todos los recursos compartidos.

---

## Modelo de datos

### Entidades principales (en `src/shared/types.ts`)

- **User**
  - `id: string`
  - `name: string`
  - `email: string`
  - `passwordHash: string`
  - `role: "user" | "buyer" | "company" | "admin"`
  - `createdAt: string`
  - Sistema de referidos y economía interna:
    - `sponsorCode?: string` — código propio único.
    - `referredByCode?: string` — código del sponsor que lo trajo (si existe).
    - `avatarUrl?: string`
    - `tokens?: number` — saldo de tokens TrueQIA.
    - `allwainBalance?: number` — saldo/comisiones acumuladas en Allwain.

- **AuthUser / AuthTokenResponse**
  - `AuthUser` es la versión pública de usuario sin `passwordHash`.
  - `AuthTokenResponse`:
    - `token: string` — JWT.
    - `user: AuthUser`.

- **Offer**
  - `id: string`
  - `title: string`
  - `description: string`
  - `owner: "trueqia" | "allwain"`
  - `ownerUserId: string`
  - `tokens?: number` — precio en tokens (TrueQIA).
  - `price?: number` — precio en dinero (Allwain).
  - `productId?: string`
  - `meta?: Record<string, unknown>` — distancia, imágenes, etc.

- **Trade**
  - `id: string`
  - `offerId: string`
  - `fromUserId: string`
  - `toUserId: string`
  - `tokens: number`
  - `status: "pending" | "accepted" | "rejected" | "cancelled"`
  - `createdAt: string`
  - `resolvedAt?: string`

- **Product**
  - `id: string`
  - `name: string`
  - `ean?: string`
  - `category?: string`
  - `brand?: string`

- **Lead**
  - Entidad de lead/contacto de interés (Allwain o TrueQIA).
  - El backend puede almacenar tanto leads generados desde app/web como futuros leads desde WhatsApp.
  - Campos mínimos recomendables:
    - `id: string`
    - `createdAt: string`
    - Datos de origen/canal y contacto según se vaya expandiendo (`channel`, `sourceApp`, `phone`, `email`, etc.).

- **Contract**
  - Soporta contratos demo de trueques/compras.
  - Campos típicos:
    - `id: string`
    - `app: "trueqia" | "allwain"`
    - `type: "trade" | "purchase"`
    - `status: "draft" | "active" | "closed" | "conflict"`
    - `basePdfId?: string`
    - `generatedText?: string`
    - `createdAt: string`
    - `updatedAt: string`

### Persistencia (`data.store.ts`)

- Usa un archivo JSON (`data/database.json` o el definido en `ENV.DATA_FILE`) como almacenamiento simple.
- Al cargar:
  - Lee el JSON si existe; si no, inicializa con **datos semilla**.
  - Hace *merge* de:
    - Usuarios demo (`admin`, usuarios demo TrueQIA, `Allwain Ops`, etc.).
    - Ofertas base TrueQIA y Allwain.
    - Trades demo.
    - Productos demo.
- Expone funciones:
  - `getDatabase`, `persistDatabase`, `resetDatabase`.
  - `getUsers`, `getUserById`, `getUserByEmail`, `getUserBySponsorCode`, `upsertUser`, `setUsers`.
  - `getOffersByOwner`, `getOfferById`, `addOffer`.
  - `getTrades`, `getTradeById`, `addTrade`, `updateTrade`, `updateTradeStatus`.
  - `createContract`, `getContractById`, `updateContractStatus`.
  - Gestión de tokens de reset de contraseña en memoria (`savePasswordResetToken`, `getPasswordResetToken`, `deletePasswordResetToken`).

---

## Endpoints (prefijo `/api`)

| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| GET | `/health` | Ping con info básica de entorno. | Público |

### Auth

| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| POST | `/auth/register` | Alta de usuario, soporte de `sponsorCode` y retorno de token + `AuthUser`. | Público |
| POST | `/auth/login` | Login por email/password, devuelve `AuthTokenResponse`. | Público |
| GET | `/auth/me` | Perfil del usuario autenticado. | Bearer |
| POST | `/auth/forgot-password` | Solicita reset de contraseña (genera token y lo guarda). | Público |
| POST | `/auth/reset-password` | Cambia contraseña usando token de reset. | Público |

### TrueQIA

| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| GET | `/trueqia/offers` | Lista de ofertas TrueQIA. Soporta `?excludeMine=true` para ocultar las del propio usuario. | Bearer |
| POST | `/trueqia/offers` | Crear oferta TrueQIA (tokens, meta, etc.) asociada al usuario autenticado. | Bearer |
| POST | `/trueqia/trades` | Crear trade entre usuarios indicando `offerId`, `toUserId`, `tokens`. Valida tokens positivos. | Bearer |
| POST | `/trueqia/trades/:id/accept` | Aceptar trade, mover tokens y marcar `accepted`. | Bearer |
| POST | `/trueqia/trades/:id/reject` | Rechazar trade y marcar `rejected`. | Bearer |
| POST | `/trueqia/contracts/preview` | Genera texto de contrato demo (IA) y puede crear un contrato con estado `draft`. | Bearer |

### Allwain

| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| GET | `/allwain/scan-demo` | Escaneo demo de producto (simula lector de etiquetas/EAN). Devuelve producto + ofertas. | Bearer |
| GET | `/allwain/products/:id` | Obtener un producto por ID. | Bearer |
| GET | `/allwain/products` | Buscar producto por `ean`. | Bearer |
| GET | `/allwain/offers` | Ofertas Allwain, con posibilidad de filtros (ej. distancia, localización en `meta`). | Bearer |
| POST | `/allwain/offers` | Crear oferta Allwain (precio, tokens, meta) ligada al usuario autenticado. | Bearer |
| POST | `/allwain/offers/:id/interest` | Registrar interés en una oferta (crea un lead o similar). | Bearer |
| GET | `/allwain/order-groups` | Listado de grupos de compra (demo). | Bearer |
| POST | `/allwain/order-groups` | Crear grupo de compra. | Bearer |
| POST | `/allwain/order-groups/:id/join` | Unirse a un grupo de compra. | Bearer |
| POST | `/allwain/savings` | Registrar ahorro del usuario y comisión asociada al sponsor. | Bearer |
| GET | `/allwain/sponsors/summary` | Resumen de ahorro, comisiones y balance para patrocinadores (según diseño actual, restringible a admin o usuario). | Bearer / Admin (según implementación concreta) |

### Leads / WhatsApp (diseño preparado)

| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| POST | `/leads/whatsapp` | Punto de entrada pensado para leads capturados por el bot de WhatsApp (IA). Canal `whatsapp`, `sourceApp` `trueqia|allwain`, texto del mensaje y datos de contacto. | Público |

> Nota: este endpoint se documenta para que la arquitectura esté preparada; la implementación concreta puede añadirse o adaptarse en `admin.routes.ts` o un router específico de `leads`.

### Admin

| Método | Ruta | Descripción | Auth |
| --- | --- | --- | --- |
| GET | `/admin/dashboard` | Ping protegido para panel admin. | Admin |
| GET | `/admin/users` | Lista de usuarios sin `passwordHash` (sólo datos públicos). | Admin |
| GET | `/admin/ai/activity` | Lista demo de actividad IA/moderación. | Admin |
| GET | `/admin/leads` | Listado global de leads (web/app/WhatsApp) para seguimiento desde el panel. | Admin |

---

## Autenticación y roles

- Middleware `authRequired`:
  - Requiere cabecera `Authorization: Bearer <token>`.
  - Verifica el token con `ENV.JWT_SECRET`.
  - Si es válido, inyecta `req.user = { id, email, role }`.
  - En error:
    - `401 { error: "UNAUTHORIZED" }` si falta token.
    - `401 { error: "INVALID_TOKEN" }` si es inválido o expirado.

- Middleware `adminOnly`:
  - Requiere que `req.user.role === "admin"`.
  - En caso contrario devuelve `403 { error: "FORBIDDEN" }`.

- Emisión de tokens:
  - Firmados con `ENV.JWT_SECRET`.
  - Payload mínimo: `{ sub: user.id, email: user.email, role: user.role }`.
  - Expiración: `7d`.

- Registro:
  - Roles permitidos: `["user", "company", "admin", "buyer"]`.
  - Si no se pasa rol o no está en la whitelist, se fuerza `user`.
  - Si se pasa `sponsorCode`, se valida contra usuarios existentes:
    - Si es válido, se guarda en `referredByCode`.
  - El propio usuario recibe un `sponsorCode` nuevo único.

---

## Cómo se despliega

1. **Variables de entorno** (`.env`):
   - `PORT=4000`
   - `JWT_SECRET=<cadena-secreta>`
   - `DATA_FILE=/ruta/persistente/database.json` (opcional, por defecto `data/database.json` en el proyecto).
   - Flags de demo como `DEMO_MODE=true` si se usan.

2. **Instalar dependencias**:
   ```bash
   cd backend
   npm install

2. `npm run dev` (puerto 4000).
3. Ajustar `EXPO_PUBLIC_API_BASE_URL` en apps a `http://<tu-ip>:4000/api`.
