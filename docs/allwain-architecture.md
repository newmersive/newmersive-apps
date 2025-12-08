# Arquitectura de Allwain (mobile)

## Qué es Allwain
App móvil Expo (SDK 54) con React 19.1.0 y React Native 0.81.5 enfocada en escaneo/búsqueda de productos, descubrimiento de ofertas, registro de ahorro y comisiones por patrocinio.

## Estructura de carpetas
- `App.tsx`: punto de entrada, inicializa fuentes/temas y monta la navegación principal.
- `src/navigation/`: `RootNavigator` con stack y tabs que alternan entre autenticación y flujo principal según el store de auth.
- `src/screens/`: pantallas de autenticación, búsqueda, escaneo, resultados, ofertas, invitados/sponsors y perfil.
- `src/store/`: Zustand para sesión (`auth.store.ts`).
- `src/config/`: utilidades de red (`api.ts`) con base URL y helpers `apiPost`, `apiAuthGet`, `apiAuthPost`.
- `src/components/`: componentes UI reutilizables (botones, tarjetas, layouts) cuando existan.
- `src/theme/`: colores y estilos base Allwain.

## Flujo principal de usuario
1. **Onboarding / login:** `AuthScreen` gestiona registro/login. Al autenticarse se guarda `token` y `user` en `auth.store`.
2. **Pantalla principal:** tabs iniciales muestran búsqueda/escaneo. El CTA de búsqueda lleva a `ScanScreen`.
3. **Escaneo / búsqueda:** `ScanScreen` simula lectura de código y navega a `ScanResultScreen`, que consume `/api/allwain/scan-demo`.
4. **Ofertas / propuestas:** `DealsScreen` lista `GET /api/allwain/offers`; permite refrescar y manejar estados de carga.
5. **Sponsor / QR / referidos:** `SponsorsScreen` y secciones de perfil muestran `sponsorCode`, resumen de comisiones e invitados usando `GET /api/allwain/sponsors/summary`.
6. **Ahorro/comisión:** botones de los flujos de ahorro usan `POST /api/allwain/savings` cuando se habilitan para registrar ahorro y comisión.

## Conexión con el backend
- **Base URL:** `EXPO_PUBLIC_API_BASE_URL` (por defecto `http://localhost:4000/api`) definida en entorno de Expo.
- **Endpoints consumidos:**
  - `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` — autenticación.
  - `GET /api/allwain/scan-demo` — resultado de escaneo demo.
  - `GET /api/allwain/offers` — listado de ofertas.
  - `GET /api/allwain/products`/`/products/:id` — búsqueda de producto por EAN o ID.
  - `GET /api/allwain/order-groups` y `POST /api/allwain/order-groups`/`:id/join` — grupos de compra.
  - `POST /api/allwain/savings` — registro de ahorro y comisión.
  - `GET /api/allwain/sponsors/summary` — resumen de referidos y comisiones.

## Notas de arquitectura
- Estado global mínimo (auth). El resto de pantallas gestionan datos con peticiones directas a la API.
- `api.ts` centraliza manejo de errores 401 para limpiar sesión (`useAuthStore.clearAuth`).
- Tema y componentes están aislados para mantener identidad visual separada de TrueQIA.
