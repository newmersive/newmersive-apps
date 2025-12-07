# Arquitectura de TrueQIA (mobile)

## Propósito
- App Expo/React Native para trueques y colaboración, consumiendo el backend común.
- Demostrar registro/login con JWT, exploración de ofertas y generación de contratos demo.

## Componentes principales
- **Entrypoint**: `App.tsx` con `NavigationContainer` y `RootNavigator`.
- **Navegación**: stack que decide entre `AuthScreen` y `MainTabs` según `useAuthStore`.
- **Pantallas clave** (`src/screens`):
  - Auth/AuthScreen (login/registro y errores).
  - Trades/TradesScreen (lista mock inicial).
  - Offers/OffersListScreen (consume `/trueqia/offers`).
  - Contracts/ContractPreviewScreen (POST `/trueqia/contracts/preview`).
  - Chat/ChatScreen (mock local).
  - Profile/ProfileScreen + SponsorsScreen (datos de usuario, logout, sponsor code).
  - Pantallas demo heredadas (`Requests`, `AdminDashboardScreen`, etc.) actualmente fuera del flujo principal.
- **Estado**: Zustand en `auth.store.ts` (token, user, acciones) y `offers.store.ts` (listado y loaders).
- **APIs**: helpers `apiPost`, `apiAuthGet`, `apiAuthPost` con base `EXPO_PUBLIC_API_BASE_URL`.

## Flujo principal
1. `RootNavigator` revisa sesión en memoria.
2. Sin usuario: muestra `AuthScreen`; con usuario: carga `MainTabs` (Trades, Chat, Profile).
3. Desde tabs se navega a ofertas/contratos; acciones de auth actualizan el store y almacenan token en memoria.

## Cómo se despliega
1. Requisitos: Node/npm y Expo CLI.
2. Variables en `.env` o `.env.local`: `EXPO_PUBLIC_API_BASE_URL=http://<host-backend>:4000/api`.
3. Instalación: `cd trueqia && npm install`.
4. Desarrollo: `npm run start` (Metro) y escanear QR en Expo Go o emulador. Confirmar backend accesible desde el dispositivo (misma red o túnel).
5. Build: `expo prebuild` y `expo build:*` si se requieren binarios nativos; mantener `EXPO_PUBLIC_API_BASE_URL` apuntando al backend productivo.

## Cómo se repara (errores típicos)
- **Pantalla vacía tras login**: base URL incorrecta o backend sin CORS; verificar `.env` y que `Authorization` llegue al backend (`/auth/me`).
- **Sesión se pierde al reiniciar app**: aún no hay persistencia AsyncStorage; re-autenticar o implementar almacenamiento según TODO.
- **Errores 401**: token expirado o cambiado `JWT_SECRET`; ejecutar logout y login.
- **Crash por hooks API**: helpers lanzan excepciones; envolver llamadas en `try/catch` en las pantallas para mensajes amigables.

## TODO críticos
- Persistir token con AsyncStorage.
- Conectar pantallas mock (Requests/Admin) o limpiar navegación.
- Manejo global de expiración de token y errores de red.
- Ejecutar `npm run lint`/`npm run typecheck` cuando haya entorno Node.
