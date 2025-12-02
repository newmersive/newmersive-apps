# Arquitectura de TrueQIA (mobile)

## Resumen funcional
- **Qué es**: aplicación móvil Expo/React Native centrada en trueques y colaboración, con navegación por pestañas para trueques, chat y perfil.
- **Capacidades de usuario**: registro e inicio de sesión con token JWT, exploración de trueques destacados (mock), visualización de ofertas provenientes del backend, generación de previsualizaciones de contrato IA, mensajería simulada dentro de la app y gestión básica de perfil/cierre de sesión.

## Mapa de pantallas (`src/screens`)

| Pantalla | Propósito | Navega a | Stores/Hooks clave |
| --- | --- | --- | --- |
| Auth/AuthScreen | Registro/Login unificados con manejo de errores y loaders. | Con stack raíz decide redirección a `MainTabs` tras login. | `useAuthStore.login`, `useAuthStore.register` |
| Auth/LoginScreen | Placeholder de login (no conectado). | N/A | N/A |
| Auth/RegisterScreen | Placeholder de registro. | N/A | N/A |
| Home/HomeScreen | Mensaje de bienvenida con datos del usuario. | N/A | `useAuthStore.user` |
| Trades/TradesScreen | Lista mock de trueques destacados. | N/A | N/A |
| Offers/OffersListScreen | Consume backend para listar ofertas y abrir previsualización de contrato. | `ContractPreview` | `useOffersStore` |
| Contracts/ContractPreviewScreen | Genera contrato demo llamando al backend con datos de oferta/usuarios. | N/A | `apiAuthPost` |
| Requests/RequestsListScreen | Placeholder para peticiones de trueque. | N/A | N/A |
| Chats/ChatListScreen | Placeholder para listado de chats. | N/A | N/A |
| Chat/ChatScreen | Chat simulado con conversaciones locales y envío de mensajes en memoria. | N/A | Estado local de componente |
| Profile/ProfileScreen | Muestra datos del usuario y permite cerrar sesión. | N/A | `useAuthStore.user`, `useAuthStore.logout` |
| Profile/ProfileMainScreen | Placeholder de perfil. | N/A | N/A |
| Demo/DemoLandingScreen | Pantalla de demo de ofertas. | Navega a `DemoOffers`, `DemoOfferDetail` | Estado local |
| Demo/DemoOffersScreen | Lista demo. | `DemoOfferDetail` | N/A |
| Demo/DemoOfferDetailScreen | Detalle demo. | N/A | N/A |
| Admin/AdminDashboardScreen | Placeholder de panel admin. | N/A | N/A |

## Navegación
- **Árbol**: `NavigationContainer` → `RootNavigator` (stack sin headers) →
  - Si no hay usuario en `useAuthStore`: `AuthScreen`.
  - Si hay usuario: `MainTabs` con pestañas `Trades`, `Chat`, `Profile`.
- **Flujo típico**: usuario abre app → ve AuthScreen → login/registro (`/auth/login` o `/auth/register`) → stack cambia a `MainTabs` → pestaña `Trades` muestra trueques demo → desde `OffersListScreen` puede abrir `ContractPreviewScreen` y generar contrato (`/trueqia/contracts/preview`), simulando un trueque cerrado.

## Estado global / stores (Zustand)
- **`auth.store.ts`**: guarda `token`, `user`, y expone `login`, `register`, `logout`, `setAuth`.
  - Backends: `apiPost` a `/auth/login` y `/auth/register`.
- **`offers.store.ts`**: mantiene `items`, `loading`, `error`; acción `loadOffers` que usa `apiAuthGet` contra `/trueqia/offers`.
- No hay stores para peticiones, órdenes ni chat; esas pantallas usan mocks/estado local.

## Integración con la API
- `AuthScreen`: `POST /auth/login`, `POST /auth/register`.
- `OffersListScreen`: `GET /trueqia/offers` para cargar ofertas; botón navega a `ContractPreviewScreen`.
- `ContractPreviewScreen`: `POST /trueqia/contracts/preview` con datos de solicitante/proveedor/tokens/notas para recibir `contractText`.
- Resto de pantallas usan datos locales o están pendientes de conexión (`Requests`, `Chats`, `Admin`).

## Problemas y observaciones
- Varias pantallas duplicadas o placeholder (`LoginScreen`, `RegisterScreen`, `RequestsListScreen`, `ChatListScreen`, `AdminDashboardScreen`, componentes Demo) sin navegación real desde el flujo principal.
- No hay manejo de expiración de token ni refresco; `apiAuthGet`/`apiAuthPost` solo leen token en memoria.
- Ausencia de validaciones/formularios avanzados y sin manejo global de errores de red.
- Falta sincronización real de chat, peticiones y órdenes; solo mocks.
