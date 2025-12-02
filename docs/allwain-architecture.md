# Arquitectura de Allwain (mobile)

## Resumen funcional
- **Qué es**: app móvil Expo/React Native enfocada en escaneo y búsqueda de productos/servicios con ofertas comisionadas. Comparte backend con TrueQIA pero con temática y UI diferente (paleta salmón).
- **Diferencias clave**: flujo centrado en búsqueda y escaneo demo, invitados/compras con resultados sugeridos; sin trueques ni contratos.

## Flujo principal de usuario
1. Onboarding/Login en `AuthScreen` usando `/auth/register` o `/auth/login`.
2. Pestañas principales (`MainTabs`):
   - **Buscar**: entrada de texto y resultados sugeridos estáticos.
   - **Ofertas**: listado demo de ofertas y comisión estimada.
   - **Perfil**: datos del usuario y cierre de sesión.
3. Desde secciones de Scan/Guests/Demo se simulan flujos de invitaciones, escaneo QR/etiquetas y resultados de AI pricing.

## Mapa de pantallas
| Pantalla | Propósito | Navegación | Stores/Hooks |
| --- | --- | --- | --- |
| Auth/AuthScreen | Formulario de login/registro unificado. | Stack raíz decide `MainTabs` tras autenticación. | `useAuthStore.login`, `useAuthStore.register` |
| Auth/LoginScreen / Auth/RegisterScreen | Placeholders. | N/A | N/A |
| Search/SearchScreen | Búsqueda con resultados mock y CTA de mejor precio. | N/A | Estado local |
| Deals/DealsScreen | Tarjetas de ofertas demo con comisión y CTA de invitar. | N/A | N/A |
| Offers/OffersScreen | Placeholder de ofertas (puente para integración backend). | N/A | N/A |
| Scan/HomeScreen | Landing de escaneo con CTA hacia flujo de cámara/resultado. | Puede ir a `ScanScreen` / `ScanResultScreen` | Estado local |
| Scan/ScanScreen | Simulación de escaneo de QR/etiqueta. | `ScanResultScreen` | Estado local |
| Scan/ScanResultScreen | Resultado demo de lectura con sugerencias. | N/A | N/A |
| Guests/GuestsScreen | Gestión de invitados/comisiones demo. | N/A | N/A |
| Profile/ProfileScreen | Perfil del usuario y logout. | N/A | `useAuthStore.logout` |
| Profile/ProfileMainScreen | Placeholder de perfil extendido. | N/A | N/A |
| Demo/DemoLandingScreen / DemoScanResultScreen | Flujos demo de AI pricing/escaneo. | N/A | Estado local |
| Admin/AdminDashboardScreen | Placeholder. | N/A | N/A |

## Navegación
- **Árbol**: `RootNavigator` (stack) muestra `AuthScreen` si no hay `user`; tras login carga `MainTabs` con pestañas `Buscar`, `Ofertas`, `Perfil`.
- **Flujo**: abrir app → autenticarse → navegar entre pestañas; flujos de escaneo/invitados están enlazados mediante botones internos desde `ScanHome`/`Deals`.

## Estado global / stores
- **`auth.store.ts`**: igual que TrueQIA; gestiona `token`, `user`, `login`, `register`, `logout` usando `apiPost` hacia `/auth/login` y `/auth/register`.
- No hay otros stores: resultados de búsqueda, escaneo, invitados y ofertas se mantienen en mocks o estado local.

## Integración con el backend
- **Autenticación**: `POST /auth/register`, `POST /auth/login`.
- **Rutas específicas** (implementadas pero aún no conectadas en UI principal):
  - `GET /allwain/scan-demo`: resultado de lectura de etiqueta.
  - `GET /allwain/offers`: ofertas asociadas a Allwain.
- **Endpoints compartidos con TrueQIA**: `/auth/*`; el backend diferencia propietario en `/trueqia/offers` vs `/allwain/offers`.

## Inconsistencias / riesgos
- Amplio uso de pantallas placeholder sin integración real.
- No se consumen los endpoints `/allwain/scan-demo` ni `/allwain/offers` desde el código actual.
- Falta manejo de errores de red y expiración de token; los datos de mock pueden divergir del backend.
- Flujos de invitados y comisiones son únicamente estáticos; requiere modelado de datos real.
