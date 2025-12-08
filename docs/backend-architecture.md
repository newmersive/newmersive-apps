# Arquitectura del Backend

## Visión general
- **Stack:** Node.js, Express y TypeScript.
- **Entrada:** `src/server.ts` crea la instancia de Express, configura CORS y JSON parsing y monta todas las rutas bajo el prefijo `/api` mediante `src/routes/index.ts`.
- **Ámbito:** API unificada para **TrueQIA** y **Allwain** con autenticación JWT, datos semilla y panel administrativo.

## Estructura de carpetas
- `src/server.ts`: arranque de Express y registro del router principal.
- `src/routes/`: definición de rutas HTTP por dominio.
- `src/controllers/`: controladores ligeros (cuando aplica) usados por las rutas.
- `src/services/`: lógica de dominio y orquestación de datos.
- `src/middleware/`: middlewares reutilizables (`authRequired`, `adminOnly`).
- `src/shared/types.ts`: modelos TypeScript comunes a TrueQIA y Allwain.
- `src/types/`: tipos auxiliares específicos del backend (peticiones/respuestas).
- `data/database.json`: almacén actual en disco con datos semilla y persistencia simple.

## Dominios y módulos

### Core
- **Autenticación y usuarios:**
  - **Rutas:** `src/routes/auth.routes.ts` (`/api/auth/register`, `/login`, `/me`, recuperación de contraseña).
  - **Servicios:** `src/services/auth.service.ts` gestiona hash/validación de credenciales, generación de JWT, asignación de `sponsorCode` y tokens iniciales por app.
  - **Tipos:** `AuthUser`, `AuthTokenResponse`, `User` en `src/shared/types.ts`.
- **Administración:**
  - **Rutas:** `src/routes/admin.routes.ts` (`/api/admin/dashboard`, `/users`, `/ai/activity`).
  - **Servicios:** composición de `data.store` y servicios IA (`ia/contracts.service.ts`, `ia/moderation.service.ts`) para dashboards y reportes.
- **Salud:** `src/routes/health.routes.ts` expone `GET /api/health` para liveness checks.

### TrueQIA
- **Rutas:** `src/routes/trueqia.routes.ts` agrupa ofertas (`/offers`), trueques (`/trades`), contratos demo IA (`/contracts/preview`).
- **Servicios:**
  - `src/services/trueqia.service.ts` controla ciclo de vida de ofertas y trueques con validación de tokens y owners.
  - `src/services/data.store.ts` almacena ofertas/trades/contratos y actualiza saldos de tokens.
  - `src/ia/contracts.service.ts` genera texto demo para contratos.
- **Tipos:** `Offer`, `Trade`, `Contract` y estructuras de usuario con saldo de tokens en `src/shared/types.ts`.

### Allwain
- **Rutas:** `src/routes/allwain.routes.ts` para escaneo demo (`/scan-demo`), productos (`/products`), ofertas (`/offers`), grupos de compra (`/order-groups`), ahorro/comisiones (`/savings`) y sponsors (`/sponsors/summary`).
- **Servicios:**
  - `src/services/scan.service.ts` y `src/services/allwain-demo.service.ts` simulan resultados de escaneo y catálogo.
  - `src/services/allwain.service.ts` maneja ofertas, grupos de compra y cálculos de ahorro/comisiones.
  - `src/services/data.store.ts` persiste productos, ofertas y resumenes de patrocinio.
- **Tipos:** reutiliza `Offer`, `Product`, `SponsorSummary` y balances Allwain en `src/shared/types.ts`.

### Leads y WhatsApp
- **Rutas:** `src/routes/leads.routes.ts` define `/api/leads/whatsapp` para registrar leads entrantes.
- **Servicios:** `src/services/leads.service.ts` almacena leads y permite futura expansión a bots o CRM.

## Persistencia actual
- `src/services/data.store.ts` carga y persiste un objeto en memoria respaldado por `data/database.json` (o `ENV.DATA_FILE`).
- Incluye semillas de usuarios (admin, usuarios demo TrueQIA, Allwain Ops), ofertas, trades, contratos demo, productos y tokens de recuperación de contraseña.
- Operaciones expuestas: obtención y escritura de usuarios, ofertas, trades, contratos, productos, grupos de compra, leads y tokens de reset; `persistDatabase` escribe el JSON tras cada operación mutante.

### Migración futura a base de datos real
- **Objetivo sugerido:** PostgreSQL con un ORM ligero (Prisma/Drizzle) o query builder (Knex).
- **Pasos recomendados:**
  1. Definir esquemas equivalentes a los tipos de `src/shared/types.ts` (usuarios, ofertas, trades, productos, contratos, leads, grupos de compra, sponsors).
  2. Reemplazar `data.store.ts` por repositorios que implementen la misma interfaz (`getUsers`, `addOffer`, `updateTradeStatus`, etc.).
  3. Introducir migraciones iniciales y seeds que reproduzcan `data/database.json` para entornos de desarrollo.
  4. Encapsular transacciones críticas (p.ej. aceptación de trade con movimiento de tokens) en nivel de servicio.
  5. Usar variables de entorno para cadena de conexión y rotar secretos (`JWT_SECRET`) fuera del código.

## Seguridad básica
- **Middlewares:**
  - `authRequired` (`src/middleware/auth.middleware.ts`): verifica JWT firmado con `JWT_SECRET`, añade `req.user` con `userId` y `role`.
  - `adminOnly`: asegura rol `admin` tras pasar `authRequired`.
- **Rutas protegidas:**
  - Todo lo bajo `/api/trueqia/*`, `/api/allwain/*`, `/api/admin/*`, `/api/leads/*` y endpoints de contratos requieren `Authorization: Bearer <token>` salvo el lead público si se habilita.
  - Rutas públicas: `/api/health`, `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`.
- **Obtención de `userId`:** proviene del JWT decodificado en `authRequired` y se usa en servicios para asociar ofertas, trueques, grupos y registros de ahorro/comisiones al usuario autenticado.

## Cómo se montan las rutas bajo `/api`
- `src/routes/index.ts` exporta un router que registra `auth`, `trueqia`, `allwain`, `admin`, `leads` y `health`.
- `src/server.ts` hace `app.use("/api", apiRouter);`, centralizando versión y prefijo de todas las rutas.

## Datos y tipos de apoyo
- Tipos comunes y dominios están en `src/shared/types.ts` (usuarios, ofertas, trades, productos, contratos, leads, resúmenes de sponsor).
- Tipos específicos de peticiones/respuestas complementan en `src/types/`.
- `types.d.ts` en la raíz del backend declara tipos globales cuando es necesario.
