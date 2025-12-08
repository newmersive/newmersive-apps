# Post-merge audit (dev → main)

## Branch/state verification
- ✅ `allwain-v2/src`, `trueqia-v2/src` y `backend/src` están presentes en `work` (HEAD: 9e0a5c4, merge PR #55) con navegación y servicios apuntando al nuevo flujo v2.
- 🚨 Persiste la app legacy `allwain/` (misma estructura Expo) junto a `allwain-v2/`; si se ejecuta `expo start` en la carpeta incorrecta, Metro cargará las pantallas antiguas.
- 🚨 Archivos zip `allwain-v2-full.zip`, `trueqia-v2-full.zip`, `newmersive-vfinal.zip` siguen en el repo y pueden inducir a usar paquetes antiguos si se descomprimen o se apunta Metro ahí.

## Expo/Metro build inputs
- ✅ `allwain-v2/app.json` y `package.json` apuntan a `./node_modules/expo/AppEntry.js` como `entryPoint/main`, lo que hace que Metro consuma exclusivamente el árbol `allwain-v2/` al lanzar desde esa carpeta.
- ✅ `trueqia-v2` usa la misma configuración (`entryPoint` y `main` en `package.json`) sin referencias a la versión legacy.
- 🛠️ Para evitar que Metro lea la versión antigua, ejecutar siempre desde `allwain-v2/` o eliminar/archivar la carpeta `allwain/` antes del build.

## Allwain-v2: pantallas y enlaces
- ❌ Splash: no hay pantalla o stack de splash; `RootNavigator` inicia en `DemoLanding`.
- ⚠️ Auth separada por app: solo hay `Login`/`Register` genéricos; no hay routing diferenciado por app ni guardas específicas.
- ⚠️ Home: incluye CTA “Escanear producto”, pero no muestra ahorro acumulado ni KPIs financieros.
- ✅ Escaneo → resultado: `ScanResultScreen` consume `GET /api/allwain/scan-demo` (autenticado) y muestra ofertas del payload.
- ✅ Ofertas: `OffersScreen` lista `/api/allwain/offers` con refresco y manejo de error.
- ⚠️ Patrocinadores: `SponsorsScreen` genera QR local y datos simulados en memoria; no consulta `/allwain/sponsors/summary`.
- ⚠️ Histórico/Euros: se muestran valores mock (setTimeout local), no cifras reales de backend.
- ⚠️ Perfil: pantalla básica sin contratos ni secciones adicionales.
- ❌ Contratos: no existe pantalla/vista de contratos.
- 🛠️ Para alinear con lo esperado, conectar Sponsors/Guests con `/allwain/sponsors/summary`, añadir splash y métricas de ahorro en Home, y crear módulo de contratos.

## Backend
- ✅ `GET /api/allwain/scan-demo` usa `scan.service.ts` con `buildAllwainScanDemo` (proveedor `mock` por defecto o `google` si se configura), devolviendo producto y ofertas actuales; no hay mocks antiguos separados.
- ✅ Rutas activas para referidos y sponsors: `/allwain/sponsors/summary` y `/allwain/savings` calculan comisiones y balance real de usuario; `/admin/sponsors` expone stats agregados.
- ✅ Grupos de pedido: `/allwain/order-groups` (list/create/join) implementados con validaciones de estado y unidades.
- ✅ Leads: `/allwain/offers/:id/interest` crea leads asociados a ofertas y usuarios.
- 🛠️ Si se requiere datos “live” en el scan, establecer `DEMO_MODE=false` y configurar `SCAN_PROVIDER`/`DATA_FILE` en `.env`.

## Qué no está entrando en producción / acciones
- 🚨 Riesgo de servir pantallas legacy si se corre Metro en `allwain/` (o si se usan zips). Eliminar carpeta legacy o renombrarla fuera del repo antes de publicar.
- ❌ Faltan splash, contratos y métricas financieras en Allwain-v2; Sponsors/Guests operan con mocks locales, por lo que producción no refleja datos de backend.
- 🛠️ Regenerar build de Allwain tomando únicamente `allwain-v2/`, tras conectar las pantallas a las rutas activas del backend y limpiar restos legacy.
