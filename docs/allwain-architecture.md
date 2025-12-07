# Arquitectura de Allwain (mobile)

## Resumen funcional
- App Expo/React Native enfocada en búsqueda, ofertas y escaneo demo. Comparte autenticación JWT con TRUEQIA y usa endpoints específicos de Allwain.

## Flujo principal
1. `App.tsx` monta `RootNavigator` con stack: si no hay sesión, muestra `AuthScreen`; con usuario carga `MainTabs`.
2. Tabs activas: **Buscar** (`SearchScreen` con CTA a escaneo/demo), **Ofertas** (`DealsScreen` consume `/allwain/offers`), **Perfil** (`ProfileScreen` con logout).
3. Flujos adicionales: `ScanScreen` llama a `/allwain/scan-demo` y navega a `ScanResultScreen`; pantallas de invitados y demos muestran datos mock.

## Mapa de pantallas
| Pantalla | Propósito | Navegación | Integración |
| --- | --- | --- | --- |
| Auth/AuthScreen | Login/registro unificado. | Redirige a tabs tras autenticar. | `/auth/login`, `/auth/register` |
| Search/SearchScreen | Buscador mock con accesos a escaneo y demo. | `Scan`, `DemoLanding`. | – |
| Deals/DealsScreen | Lista ofertas de `/allwain/offers` con loaders/errores. | `Scan`, `Guests`. | `apiAuthGet` |
| Scan/ScanScreen | Dispara `/allwain/scan-demo` y pasa resultado. | `ScanResultScreen`. | `apiAuthGet` |
| Scan/ScanResultScreen | Muestra resultado del backend y permite recargar. | – | `apiAuthGet` |
| Guests/GuestsScreen | Gestión demo de invitados/comisiones. | – | mock |
| Profile/ProfileScreen | Datos y logout. | – | `useAuthStore.logout` |
| Demo/DemoLandingScreen, DemoScanResultScreen, AdminDashboardScreen | Pantallas demo/placeholder. | – | mock |

## Integración con el backend
- Base URL: `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:4000/api`).
- Endpoints usados: `/auth/login`, `/auth/register`, `/allwain/offers`, `/allwain/scan-demo`.
- Manejo de auth: helpers `apiAuthGet`/`apiPost` agregan token si existe y ejecutan `logout` ante 401.

## Estado global
- `auth.store.ts`: token y usuario en memoria; acciones `login`, `register`, `logout`.
- Resto de pantallas manejan estado local (no hay store para ofertas/escaneo).

## TODO principales
- Persistir token con AsyncStorage para mantener sesión entre reinicios.
- Añadir store para ofertas/escaneo que evite llamadas duplicadas y normalice errores.
- Conectar pantallas mock (Guests, Demo, Admin) o eliminarlas del flujo principal.
- Ejecutar `npm run lint`/`npm run typecheck` al disponer de Node/npm para validar tipado.
