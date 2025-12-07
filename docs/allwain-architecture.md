# Arquitectura de Allwain (mobile)

## Propósito
- App Expo/React Native enfocada en búsqueda de productos, ofertas y demostración de escaneo.
- Compartir autenticación JWT con TrueQIA y habilitar flujos de referidos y ahorros Allwain.

## Componentes principales
- **Entrypoint**: `App.tsx` monta `RootNavigator`.
- **Navegación**: stack que alterna `AuthScreen` o `MainTabs` según `auth.store.ts`.
- **Pantallas clave**:
  - Auth/AuthScreen (login/registro con sponsor code opcional).
  - Search/SearchScreen (buscador mock y acceso a escaneo/demo).
  - Deals/DealsScreen (GET `/allwain/offers`).
  - Scan/ScanScreen y ScanResultScreen (GET `/allwain/scan-demo`).
  - Guests/GuestsScreen (gestión demo comisiones/invitados).
  - Profile/ProfileScreen y SponsorsScreen (logout, sponsor QR/código).
  - Demo/Admin placeholders fuera del flujo principal.
- **Integración backend**: helpers `apiAuthGet`/`apiPost` con `EXPO_PUBLIC_API_BASE_URL`.
- **Estado**: `auth.store.ts` (token/usuario); resto usa estado local.

## Flujo principal
1. `RootNavigator` muestra login si no hay token.
2. Tras login, tabs activas: Buscar, Ofertas, Perfil.
3. Escaneo llama `/allwain/scan-demo` y presenta resultado; sponsors se visualizan desde datos del usuario.

## Cómo se despliega
1. Requisitos: Node/npm y Expo CLI.
2. Configurar `EXPO_PUBLIC_API_BASE_URL=http://<host-backend>:4000/api` en `.env` o variables Expo.
3. Instalar dependencias: `cd allwain && npm install`.
4. Desarrollo: `npm run start` y conectar vía Expo Go/emulador asegurando acceso al backend.
5. Build nativa opcional: `expo prebuild` y comandos de build según plataforma.

## Cómo se repara (errores típicos)
- **Oferta vacía o error 401**: token expirado o base URL incorrecta; re-login y verificar `.env`.
- **Escaneo sin datos**: backend caído o `/allwain/scan-demo` inaccesible; probar en navegador y revisar consola Metro.
- **Sponsor code no visible**: usuario sin `sponsorCode` asignado; revisar seed en backend o endpoint `/auth/me`.
- **Cierre de sesión al reiniciar**: no hay persistencia de token; re-autenticar o implementar AsyncStorage.

## TODO principales
- Persistir token y estados de ofertas/escaneo para evitar llamadas duplicadas.
- Conectar pantallas Guests/Demo/Admin con datos reales o retirarlas.
- Ejecutar `npm run lint`/`npm run typecheck` cuando haya entorno Node.
