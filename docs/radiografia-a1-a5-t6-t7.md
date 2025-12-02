# Radiografía tras tareas Allwain A1–A5 y TrueQIA T6–T7

## Navegación y flujo
- **Allwain**: `RootNavigator` conmuta entre `AuthScreen` y `MainTabs` (Buscar, Ofertas, Perfil). El stack adicional expone `Scan`, `ScanResult`, `Guests`, `DemoLanding`, `DemoScanResult`. Pantallas de Admin/Offers legacy no están enlazadas.
- **TrueQIA**: `RootNavigator` alterna `AuthScreen` con tabs `Trades`, `Chat`, `Profile`. Requests, ChatList, ProfileMain, Admin y las pantallas demo siguen fuera del árbol de navegación actual.

## Tema y estilos
- La app Allwain aplica el tema salmón en contenedor de navegación, headers y fondos (`colors.salmon`, `colors.dark`) y no referencia estilos de TrueQIA, que mantiene su propia paleta azul (`config/theme.ts`). No hay imports cruzados de temas entre apps.

## Consumo de API en Allwain
- **Ofertas**: `DealsScreen` usa `getAllwainOffers` (`/api/allwain/offers`) con loader, mensaje de error y estado vacío. 
- **Escaneo demo**: `ScanScreen` y `ScanResultScreen` consumen `/api/allwain/scan-demo`; permiten reintento y muestran errores de autenticación.

## Loaders, errores y expiración de token
- **Allwain**: `apiAuthGet` desloguea ante 401 (`AUTH_EXPIRED`) y las pantallas de ofertas/escaneo presentan loaders y mensajes de error específicos.
- **TrueQIA**: las llamadas autenticadas (`apiAuthGet`/`apiAuthPost`) devuelven errores genéricos y no limpian sesión; `loadOffers` solo muestra error en memoria sin reintentos ni manejo de expiración de token.

## Estado de Requests, Chats y Admin en TrueQIA
- `RequestsListScreen` y `Chats/ChatListScreen` son placeholders sin integración ni acceso desde tabs.
- `ChatScreen` muestra un módulo demo dentro de la pestaña `Chat` (estado local sin backend).
- `AdminDashboardScreen` permanece como placeholder no navegable (quedó referenciado solo en código legado de perfil).

## Pantallas huérfanas e imports cruzados
- Pantallas huérfanas: Allwain (Admin, Offers legacy), TrueQIA (Login/Register placeholders, RequestsList, ChatList, ProfileMain, Admin y demos) no están conectadas al flujo principal. 
- No se detectan imports cruzados innecesarios entre apps; cada una usa su propio espacio de nombres y colores.

## Backend (seeds, endpoints, coherencia)
- Seeds alineados en `data.store.ts` y `data/database.json`: usuario admin + 4 ofertas divididas por owner (TrueQIA vs Allwain) y 2 trades demo.
- Endpoints activos según rutas: `/trueqia/offers`, `/trueqia/contracts/preview`, `/trueqia/trades`, `/allwain/offers`, `/allwain/scan-demo`, `/auth/*` y panel `/admin/*`. 
- Las ofertas se filtran por `owner`, evitando mezclar datos entre aplicaciones; no hay refresco automático de cache si se edita el JSON manualmente.

## Pendientes e inconsistencias
- TrueQIA carece de manejo de expiración de token y reintentos; las pantallas Requests/Chats/Admin siguen sin conexión a backend.
- Allwain mantiene secciones mock (Guests, demo AI) y carece de persistencia de sesión.
- Siguen existiendo pantallas huérfanas heredadas en ambos proyectos que podrían depurarse o reinsertarse en la navegación.
