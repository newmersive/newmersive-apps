# Arquitectura de TrueQIA (mobile)

## Resumen funcional
- Aplicación Expo/React Native centrada en trueques y colaboración, con navegación por pestañas para trueques, chat y perfil.
- Capacidad de registro/login con JWT, exploración de ofertas y generación de contratos demo consumiendo el backend.

## Flujo principal
1. `App.tsx` monta `NavigationContainer` → `RootNavigator`.
2. `RootNavigator` revisa el store de auth (`useAuthStore`): si no hay sesión, muestra `AuthScreen`; si hay usuario, carga `MainTabs`.
3. Tabs activas: **Trades** (`TradesScreen` con trueques mock), **Chat** (`ChatScreen` con mensajes locales), **Profile** (`ProfileScreen` con datos y logout).
4. Desde flujos secundarios se consumen ofertas y contratos: `OffersListScreen` llama a `/trueqia/offers`, `ContractPreviewScreen` a `/trueqia/contracts/preview`.

## Mapa de pantallas (`src/screens`)
| Pantalla | Propósito | Navegación | Stores/Hooks |
| --- | --- | --- | --- |
| Auth/AuthScreen | Login/registro unificado con errores y loader. | Redirige a `MainTabs` al autenticar. | `useAuthStore.login`, `useAuthStore.register` |
| Home/HomeScreen | Bienvenida con datos del usuario autenticado. | Accesible vía rutas internas. | `useAuthStore.user` |
| Trades/TradesScreen | Lista de trueques mock (pestaña inicial). | – | – |
| Offers/OffersListScreen | Consume `/trueqia/offers` y muestra CTA a detalle. | `ContractPreviewScreen` | `useOffersStore.loadOffers` |
| Contracts/ContractPreviewScreen | Envía datos a `/trueqia/contracts/preview` para texto demo. | – | `apiAuthPost` |
| Chat/ChatScreen | Chat simulado con estado local (pestaña Chat). | – | estado local |
| Profile/ProfileScreen | Datos del usuario y logout (pestaña Profile). | – | `useAuthStore.logout` |
| Requests/RequestsListScreen, ChatListScreen, ProfileMainScreen, AdminDashboardScreen, Demo* | Placeholders heredados; no enlazados en la navegación actual. | – | – |

## Integración con la API
- Configuración: `EXPO_PUBLIC_API_BASE_URL` (por defecto `http://localhost:4000/api`).
- Autenticación: `apiPost('/auth/login')`, `apiPost('/auth/register')`, `apiAuthGet('/auth/me')`.
- Ofertas y contratos: `apiAuthGet('/trueqia/offers')`, `apiAuthPost('/trueqia/contracts/preview')`; trades demo mediante `/trueqia/trades` (store pendiente de uso).

## Estado global (Zustand)
- `auth.store.ts`: guarda `token`, `user`, `sessionMessage`; acciones `login`, `register`, `logout`, `restoreSession` (sin persistencia en disco).
- `offers.store.ts`: `items`, `loading`, `error`, `loadOffers` que consume el backend.

## TODO críticos
- Añadir persistencia segura del token (AsyncStorage) para evitar cerrar sesión al reiniciar la app.
- Conectar trades y otras pantallas mock (Requests, Admin) a endpoints reales o limpiar navegación.
- Manejar expiración de token y errores de red de forma global (hoy se limita a throw en helpers API).
- Ejecutar y fijar `npm run lint`/`npm run typecheck` tras disponer de Node/npm para detectar issues de tipado.
