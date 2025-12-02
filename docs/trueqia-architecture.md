# Arquitectura de TrueQIA (mobile)

## Resumen funcional
- **Qué es**: aplicación móvil Expo/React Native centrada en trueques y colaboración, con navegación por pestañas para trueques, chat y perfil.
- **Capacidades de usuario**: registro/inicio de sesión con token JWT, exploración de trueques destacados (mock), visualización de ofertas provenientes del backend, generación de previsualizaciones de contrato IA, mensajería simulada y un panel de perfil con cierre de sesión.

## Mapa de pantallas (`src/screens`)

| Pantalla | Propósito | Navega a | Stores/Hooks clave |
| --- | --- | --- | --- |
| Auth/AuthScreen | Registro/Login unificados con manejo de errores y loaders. | Stack raíz decide redirección a `MainTabs` tras login. | `useAuthStore.login`, `useAuthStore.register` |
| Auth/LoginScreen / Auth/RegisterScreen | Placeholders no usados en navegación actual. | N/A | N/A |
| Home/HomeScreen | Mensaje de bienvenida con datos del usuario. | N/A | `useAuthStore.user` |
| Trades/TradesScreen | Lista mock de trueques destacados (pestaña inicial). | N/A | N/A |
| Offers/OffersListScreen | Consume backend para listar ofertas y abrir previsualización de contrato. | `ContractPreview` | `useOffersStore` |
| Contracts/ContractPreviewScreen | Genera contrato demo llamando al backend con datos de oferta/usuarios. | N/A | `apiAuthPost` |
| Requests/RequestsListScreen | Placeholder sin navegación desde tabs. | N/A | N/A |
| Chats/ChatListScreen | Placeholder sin navegación desde tabs. | N/A | N/A |
| Chat/ChatScreen | Chat simulado con conversaciones locales y envío de mensajes en memoria (pestaña `Chat`). | N/A | Estado local de componente |
| Profile/ProfileScreen | Muestra datos del usuario y permite cerrar sesión (pestaña `Profile`). | N/A | `useAuthStore.user`, `useAuthStore.logout` |
| Profile/ProfileMainScreen | Placeholder no enlazado; versión antigua del perfil/admin. | N/A | N/A |
| Demo/DemoLandingScreen | Pantalla de demo de ofertas. | `DemoOffers`, `DemoOfferDetail` | Estado local |
| Demo/DemoOffersScreen | Lista demo. | `DemoOfferDetail` | N/A |
| Demo/DemoOfferDetailScreen | Detalle demo. | N/A | N/A |
| Admin/AdminDashboardScreen | Placeholder sin acceso desde navegación actual. | N/A | N/A |

## Navegación
- **Árbol**: `NavigationContainer` → `RootNavigator` (stack sin headers) → si no hay usuario `AuthScreen`; si existe, `MainTabs` con pestañas `Trades`, `Chat`, `Profile`.
- **Flujo típico**: usuario abre app → se autentica (`/auth/login` o `/auth/register`) → stack cambia a `MainTabs` → pestaña `Trades` muestra trueques demo → ofertas/contratos accesibles desde rutas internas (no hay enlaces visibles en tabs); chat y perfil usan datos locales.
- **Pantallas fuera del flujo**: Requests, ChatList, ProfileMain, Admin y demos no están enlazadas en la navegación principal tras la refactorización a tabs.

## Estado global / stores (Zustand)
- **`auth.store.ts`**: guarda `token`, `user`, expone `login`, `register`, `logout`, `setAuth`. Persistencia solo en memoria.
- **`offers.store.ts`**: mantiene `items`, `loading`, `error`; acción `loadOffers` usa `apiAuthGet` contra `/trueqia/offers`.
- No hay stores para peticiones ni chat; pantallas correspondientes son mock/estado local.

## Integración con la API
- `AuthScreen`: `POST /auth/login`, `POST /auth/register`.
- `OffersListScreen`: `GET /trueqia/offers` con loader/error y sin reintento automático.
- `ContractPreviewScreen`: `POST /trueqia/contracts/preview` con datos de oferta/usuarios para recibir `contractText`.
- `TradesScreen`, `RequestsListScreen`, `ChatListScreen`, `AdminDashboardScreen` y demos siguen desconectados del backend.

## Problemas y observaciones
- Varias pantallas duplicadas o placeholder (Login/Register heredadas, RequestsList, ChatList, ProfileMain, AdminDashboard, demos) sin navegación real desde el flujo principal.
- No hay manejo explícito de expiración de token en `apiAuthGet`/`apiAuthPost`; los fallos de auth devuelven errores genéricos y no limpian sesión.
- Ausencia de validaciones/formularios avanzados y sin manejo global de errores de red.
- Chat y peticiones siguen siendo mocks sin sincronización backend.
