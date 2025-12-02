# Arquitectura de Allwain (mobile)

## Resumen funcional
- **Qué es**: app móvil Expo/React Native enfocada en escaneo y búsqueda de productos/servicios con ofertas comisionadas. Comparte backend con TrueQIA pero con temática y UI propia en paleta salmón.
- **Diferencias clave**: flujo centrado en búsqueda y escaneo demo (lector conectado a `/allwain/scan-demo`), invitados/compras con resultados sugeridos y consumo de ofertas reales vía `/allwain/offers`; no comparte estilos ni componentes de TrueQIA.

## Flujo principal de usuario
1. Onboarding/Login en `AuthScreen` usando `/auth/register` o `/auth/login`.
2. Pestañas principales (`MainTabs`):
   - **Buscar**: entrada de texto y resultados sugeridos estáticos + accesos a escaneo y demo.
   - **Ofertas**: listado conectado a `/allwain/offers` con loader, error y estado vacío.
   - **Perfil**: datos del usuario y cierre de sesión.
3. Flujo de escaneo conectado al backend: `ScanScreen` llama a `/allwain/scan-demo` y navega a `ScanResultScreen`; este último puede reutilizar el resultado recibido o recargarlo desde el backend.
4. Flujos de invitados y demo AI pricing siguen siendo mocks pero mantienen la misma temática visual.

## Mapa de pantallas
| Pantalla | Propósito | Navegación | Stores/Hooks |
| --- | --- | --- | --- |
| Auth/AuthScreen | Formulario de login/registro unificado. | Stack raíz decide `MainTabs` tras autenticación. | `useAuthStore.login`, `useAuthStore.register` |
| Search/SearchScreen | Búsqueda con resultados mock y CTA hacia escaneo y demo. | Navega a `Scan`, `DemoLanding`. | Estado local |
| Deals/DealsScreen | Lista ofertas reales de `/allwain/offers` con loader/error y CTA a escaneo/invitados. | Navega a `Scan`, `Guests`. | `getAllwainOffers` |
| Scan/ScanScreen | Dispara `/allwain/scan-demo` y envía resultado al detalle. | `ScanResultScreen` | `getAllwainScanDemo` |
| Scan/ScanResultScreen | Muestra resultado del backend; puede recargar demo y gestiona expiración de token. | N/A | `getAllwainScanDemo` |
| Guests/GuestsScreen | Gestión de invitados/comisiones demo. | N/A | N/A |
| Profile/ProfileScreen | Perfil del usuario y logout. | N/A | `useAuthStore.logout` |
| Demo/DemoLandingScreen / DemoScanResultScreen | Flujos demo de AI pricing/escaneo (mock). | N/A | Estado local |
| Admin/AdminDashboardScreen | Placeholder no enlazado. | N/A | N/A |

## Navegación
- **Árbol**: `RootNavigator` (stack) muestra `AuthScreen` si no hay `user`; tras login carga `MainTabs` con pestañas `Buscar`, `Ofertas`, `Perfil` y habilita stack secundario para `Scan`, `ScanResult`, `Guests`, `DemoLanding`, `DemoScanResult`.
- **Flujo**: abrir app → autenticarse → navegar entre pestañas; escaneo y demo se lanzan desde botones en `Search` o `Deals`.

## Estado global / stores
- **`auth.store.ts`**: gestiona `token`, `user`, `login`, `register`, `logout` usando `apiPost` hacia `/auth/login` y `/auth/register`.
- No hay otros stores: resultados de búsqueda, escaneo, invitados y ofertas se mantienen en estado local con llamadas directas a `getAllwainOffers`/`getAllwainScanDemo`.

## Integración con el backend
- **Autenticación**: `POST /auth/register`, `POST /auth/login`.
- **Rutas específicas**: `GET /allwain/scan-demo` (Scan y ScanResult) y `GET /allwain/offers` (Deals).
- **Manejo de errores/expiración**: `apiAuthGet` invalida token ante 401 (`AUTH_EXPIRED`) y los `screen` muestran mensajes de error o estado vacío según corresponda.

## Inconsistencias / riesgos
- Varias pantallas siguen siendo placeholder (Admin, Offers antiguos) o mocks (Guests, demo AI pricing).
- Búsqueda y flujos de invitados/comisiones no consumen backend.
- No hay almacenamiento persistente del token; depende del estado en memoria para mantener la sesión.
