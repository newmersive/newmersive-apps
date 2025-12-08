# Arquitectura de TrueQIA (mobile)

## Resumen funcional
Plataforma móvil Expo (SDK 54) para intercambio y colaboración con tokens: permite registro/login, navegación por pestañas, publicación y consumo de ofertas, creación de trueques, generación de contratos demo y visualización de patrocinadores.

## Estructura de carpetas
- `App.tsx`: entrypoint y router basado en estado de autenticación.
- `src/navigation/`: navegación stack/tabs definida en `RootNavigator`.
- `src/screens/`: pantallas de Login, Main, Home, Sponsor, Offers, Trades, Contracts y variaciones auxiliares.
- `src/store/`: Zustand para auth, ofertas y trueques.
- `src/config/`: configuración HTTP y constantes (API base, headers).
- `src/api/`: helpers de llamadas si se añaden endpoints específicos.

## Flujo principal
1. **Login / sesión:** `AuthScreen` (o `LoginScreen`) usa `auth.store.ts` para llamar a `/api/auth/login` o `/register`. El token y usuario se guardan y persisten en AsyncStorage.
2. **MainScreen como hub:** tras login, `MainScreen` muestra tabs internas.
3. **Tabs internas:**
   - **Inicio (Home):** resumen y accesos rápidos.
   - **Patrocinador:** muestra `sponsorCode` y referidos.
   - **Ofertas:** `OffersScreen` lista `/api/trueqia/offers` y permite crear nuevas.
   - **Trueques:** `TradesScreen` consume `/api/trueqia/trades` y permite proponer trueques.
   - **Contratos:** `ContractsScreen` crea previsualizaciones con `/api/trueqia/contracts/preview`.

## Detalle de stores (Zustand)
- `auth.store.ts`: estado `{ token, user, sessionMessage, hydrated }`; acciones `restoreSession`, `login`, `register`, `logout`, `setAuth`, `clearSessionMessage`. Usa AsyncStorage para persistir la sesión.
- `offers.store.ts`: tipos `TrueqiaOffer`/`OfferOwner`; carga ofertas con `apiAuthGet("/trueqia/offers")` y permite `createOffer` reusando el endpoint de creación.
- `trades.store.ts`: tipo `Trade`; `loadTrades` usa `GET /trueqia/trades`; `proposeTrade` hace `POST /trueqia/trades` y añade el trade devuelto al estado.

## Conexión con el backend
- **Base URL:** `EXPO_PUBLIC_API_BASE_URL` (fallback `http://localhost:4000/api`).
- **Endpoints usados:**
  - Auth: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`.
  - TrueQIA: `GET /api/trueqia/offers`, `POST /api/trueqia/offers`, `GET /api/trueqia/trades`, `POST /api/trueqia/trades`, `POST /api/trueqia/trades/:id/accept|reject`, `POST /api/trueqia/contracts/preview`.
  - Opcional: endpoints de admin (solo para rol admin) si se añaden accesos en la app.

## Notas de arquitectura
- El enrutado inicial depende de `useAuthStore.hydrated` para evitar parpadeos al restaurar sesión.
- Los helpers `apiAuthGet`/`apiAuthPost` limpian la sesión si hay 401; envolver pantallas con mensajes de error mejora UX.
- Cada dominio (auth, ofertas, trueques) está encapsulado en su store para mantener responsabilidades claras y permitir futuras pestañas sin mezclar estados.
