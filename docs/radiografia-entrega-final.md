# Radiografía completa y plan de entrega final

## 1) Estado actual
- **Backend**
  - Express montado bajo /api con CORS abierto y handler global de errores, sin restricciones de origen configuradas todavía.【F:backend/src/server.ts†L9-L24】
  - Routing agrupado en /auth, /trueqia, /allwain, /leads, /admin y /health. Base pública única /api/health.【F:backend/src/routes/index.ts†L16-L46】
  - **Persistencia**:
    - Driver JSON sigue activo en data.store.ts (persistencia en data/database.json) y lo usan rutas admin y cualquier feature que no se haya movido.【F:backend/src/services/data.store.ts†L16-L188】
    - Driver Postgres listo vía Prisma (@prisma/adapter-pg) y seleccionado con STORAGE_DRIVER=postgres. Ofertas/trueques/contratos TrueQIA respetan el flag y trabajan contra Postgres; Allwain usa siempre Postgres sin checar STORAGE_DRIVER; leads global ya solo escribe en Postgres; tokens de reseteo solo tienen implementación JSON (faltan helpers PG).【F:backend/src/services/trueqia.service.ts†L39-L200】【F:backend/src/services/allwain.service.ts†L24-L184】【F:backend/src/services/data.store.pg.ts†L20-L176】
    - Esquema Prisma incluye usuarios, ofertas, trades, productos, leads, contratos, grupos de pedido, referidos, ahorros y tokens de reset (sin defaults de UUID).【F:backend/prisma/schema.prisma†L1-L67】【F:backend/prisma/schema.prisma†L82-L125】
  - **Auth/CORS**: middleware authRequired para todo salvo health/auth; adminOnly depende del rol; CORS sin allowlist aún.【F:backend/src/middleware/auth.middleware.ts†L14-L54】【F:backend/src/server.ts†L9-L21】
  - **Base path y errores**: todas las rutas bajo /api; errores de servicios devuelven códigos específicos (INVALID_TOKEN_AMOUNT, OFFER_ALREADY_CLAIMED, etc.).

- **TrueQIA (Expo)**
  - Navegación post-login: tabs (Inicio, Ofertas, Trueques, Chat, Perfil→Sponsors) más pantallas apiladas para listado/creación de ofertas, detalle de trade y contrato IA; Splash controla la restauración de sesión antes de mostrar Auth/Main.【F:trueqia-v2/src/navigation/RootNavigator.tsx†L17-L107】【F:trueqia-v2/src/navigation/MainTabs.tsx†L39-L79】
  - Store apiAuthPost('/trueqia/offers') y CTA + CREAR OFERTA existen según código previo; flujo de trades usa backend (GET/POST /trueqia/*).
  - Expo web falla por import.meta/modo módulo: el proyecto usa React 19 + Expo 54 con react-native-web y no declara type=module, por lo que es necesario revisar Babel/Metro para web (pendiente en bloqueos).

- **Allwain (Expo)**
  - Navegación tras login: stack con tabs (Buscar, Ofertas, Perfil) y rutas adicionales accesibles desde botones (Scan, ScanResult, Guests, DemoLanding/DemoScanResult).【F:allwain/src/navigation/RootNavigator.tsx†L18-L74】【F:allwain/src/navigation/MainTabs.tsx†L11-L27】
  - API layer consume solo /allwain/offers y /allwain/scan-demo mediante llamadas autenticadas; no hay consumo de JSON local. Campos esperados siguen siendo tokens (desfase con backend que entrega price).【F:allwain/src/api/allwain.api.ts†L3-L27】
  - Pantallas clave: Search (CTA a Scan y Demo), Deals (lista ofertas + CTA scan/guests con refresco en focus), Perfil básico, flujo demo de escaneo. Ninguna pantalla apunta a datos locales; todo depende de backend.

## 2) Bloqueos
- Persistencia mixta: Admin y tokens de reseteo siguen leyendo/escribiendo en JSON; Allwain y Leads ya dependen 100% de Postgres → riesgo de estados divergentes y seeds incoherentes.
- Prisma no es source of truth: se está haciendo db pull; falta fijar migraciones iniciales/seed controlado para server-ready.
- Expo Web TrueQIA: error Cannot use import.meta outside a module al compilar web; hay que ajustar babel/metro o package.json para soportar ESM/React 19.
- Parámetros de oferta Allwain: front espera tokens pero backend entrega price; UI muestra tokens en vez de precio real.
- Ops: faltan checklists de despliegue (pm2/nginx/SSL) y healthcheck documentado para IONOS.

## 3) Plan de entrega final (prioridad)
1. Unificar storage en Postgres: mover admin + password reset a data.store.pg, eliminar dependencias JSON en runtime, y fijar STORAGE_DRIVER=postgres por defecto en .env de server. Revisar data.store.pg para añadir helpers faltantes.
2. Prisma como fuente de verdad: crear migración inicial (prisma migrate dev --name init) y seed mínimo (usuarios demo + productos Allwain) versionado; prohibir db pull en CI/CD.
3. Backend listo para servidor: añadir cors({ origin: [...] }), base URL pública /api, endpoints de health listos para monitor; scripts npm run build && prisma migrate deploy && pm2 start dist/server.js --name newmersive.
4. TrueQIA: asegurar flujo end-to-end en tabs + CreateOffer CTA visible; revisar trades/contract preview; reparar build web ajustando babel.config.js/metro.config para ESM o desactivar web si no se entrega.
5. Allwain: alinear tipos de oferta (mostrar price), exponer CTAs hacia grupos de pedido/sponsors si deben ser visibles; validar pantallas Scan/Demo funcionan contra backend.
6. QA mínimo: pruebas API (health, register/login, crear oferta TrueQIA, listar ofertas Allwain), y smoke manual en apps (login, crear oferta, flujo trade, scan demo).

## 4) Parches propuestos (arquitectura/código)
- **Backend**
  - Implementar en src/services/data.store.pg.ts las funciones de tokens de reseteo y usarlo desde auth.service cuando STORAGE_DRIVER=postgres; migrar rutas admin a Postgres (usar Prisma aggregates en vez de JSON).【F:backend/src/services/data.store.pg.ts†L20-L176】【F:backend/src/routes/admin.routes.ts†L10-L88】
  - Añadir cors({ origin: ENV.ALLOWED_ORIGINS?.split(',') ?? ['*'] }) y documentar en .env junto a PORT, DATABASE_URL, STORAGE_DRIVER=postgres, JWT_SECRET.
  - Crear script de seed (ej. prisma/seed.ts) con usuarios demo, ofertas y productos Allwain; ejecutar en npm run seed previo a pm2.

- **TrueQIA**
  - Ajustar configuración web: habilitar babel-preset-expo y un plugin para import.meta o declarar type=module coherente; comprobar bundling con expo start --web.
  - Revisar caches Android/iOS: borrar .expo, node_modules, watchman y relanzar expo start -c para reflejar cambios de bundling (documentar en README si persiste el bug).

- **Allwain**
  - Cambiar Offer del cliente y DealsScreen para usar price/productId desde backend y mostrar moneda real; añadir CTA hacia /allwain/order-groups si se quiere probar grupos.
  - Confirmar onboarding: Auth → Tabs → Scan/Guests accesibles; agregar CTA hacia referidos si aplica.

## 5) Comandos de verificación
- **Ubuntu**
  - npm install (backend) y npm run build
  - npx prisma migrate deploy && npx prisma db seed
  - PORT=4000 STORAGE_DRIVER=postgres DATABASE_URL='postgres://...' node dist/server.js
  - curl http://localhost:4000/api/health
  - curl -X POST http://localhost:4000/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Demo","email":"demo@test.com","password":"pass"}'
  - curl -H 'Authorization: Bearer <TOKEN>' http://localhost:4000/api/trueqia/offers
  - curl -H 'Authorization: Bearer <TOKEN>' http://localhost:4000/api/allwain/offers
  - curl -X POST -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' -d '{"title":"Oferta demo","description":"Desc","tokens":10}' http://localhost:4000/api/trueqia/offers

- **PowerShell**
  - npm install ; npm run build
  - $env:DATABASE_URL='postgres://...'; $env:STORAGE_DRIVER='postgres'; node .\dist\server.js
  - Invoke-RestMethod http://localhost:4000/api/health
  - Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -Body '{"email":"demo@test.com","password":"pass"}' -ContentType 'application/json'
  - Invoke-RestMethod -Headers @{Authorization='Bearer $token'} http://localhost:4000/api/trueqia/offers
