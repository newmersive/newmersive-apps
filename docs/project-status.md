# Estado del proyecto

## Estructura real del repositorio
- **backend/**: API Node.js + TypeScript con rutas `/api` para autenticación, ofertas demo de TrueQIA/Allwain y utilidades de IA mock.
- **trueqia/**: app Expo/React Native (Expo SDK 54, React Native 0.75) con navegación por tabs y consumo del backend.
- **allwain/**: app Expo/React Native (Expo SDK 54) temática retail/escaneo, comparte backend.
- **docs/**: documentación funcional y técnica de cada proyecto.
- **Archivos ZIP** (`allwain-v2-full.zip`, `trueqia-v2-full.zip`, `newmersive-vfinal.zip`): backups empaquetados sin usar en el flujo actual.

## Ramas relevantes
- `work`: rama base encontrada en el repositorio inicial y usada para esta auditoría.

## Estado de funcionamiento por proyecto
### Backend
- **Dependencias**: requeridas Node.js ≥ 18/20 y npm; no instaladas en el entorno actual (`npm` no disponible).
- **Comandos ejecutados**: `npm install` falló por ausencia de `npm` y restricciones de red al intentar instalar Node.
- **Arranque**: no verificado en este entorno; el código expone `/api` con rutas `auth`, `trueqia`, `allwain`, `admin`, `health`.
- **Tests**: no ejecutados por falta de runtime; suite prevista en `tests/*.spec.ts` (auth y ofertas).

### TrueQIA (Expo)
- **Ubicación**: `trueqia/` (contiene `App.tsx`, `app.json`).
- **Dependencias**: no instaladas (mismo bloqueo por ausencia de Node/npm).
- **Checks disponibles**: scripts `npm run lint`, `npm run typecheck`, `npm start` (Expo) pendientes de ejecutar.
- **Estado esperado**: consume endpoints de backend (`/auth/*`, `/trueqia/*`); requiere configurar `EXPO_PUBLIC_API_BASE_URL` para dispositivos físicos.

### Allwain (Expo)
- **Ubicación**: `allwain/` (contiene `App.tsx`, `app.json`).
- **Dependencias**: no instaladas; bloqueadas por falta de Node/npm.
- **Checks**: scripts `npm run lint`, `npm run typecheck`, `npm start` (Expo) no ejecutados.
- **Estado esperado**: usa `/auth/*` y `/allwain/*` del backend para ofertas y demo de escaneo.

## Qué compila / qué falla (en este entorno)
- ❌ `npm install` (backend): `bash: command not found: npm`.
- ❌ Intento de instalar Node/npm vía `apt-get update` → bloqueado por repositorios `archive.ubuntu.com`/`security.ubuntu.com` no firmados (403). Sin runtime Node disponible.
- ❌ `npm install` / `npm run lint` / `npm run typecheck` / `npx expo start` en apps móviles: bloqueados por la misma ausencia de Node/npm.
- ⚠️ No se pudieron ejecutar tests ni servidores de desarrollo por falta de runtime; el código TypeScript es consistente a nivel de tipado estático según revisión manual.

## Intentos y pasos realizados (ronda actual)
1. Verificación de entorno: `node -v` devolvió `command not found`, confirmando que no hay runtime Node.
2. Intento de preparar el entorno: `apt-get update` falló por repositorios no firmados/403, por lo que no se pudo instalar Node ni npm.
3. No se aplicaron fixes de código al backend ni a las apps móviles debido a la imposibilidad de instalar dependencias en este entorno.

## Próximos pasos recomendados
1. **Proveer Node/npm** en el entorno de desarrollo (LTS 20.x recomendado). Instalar manualmente o usar nvm antes de repetir `npm install` en cada proyecto.
2. **Backend**:
   - Ejecutar `npm install`, `npm test` y `npm run dev` para validar rutas y persistencia JSON.
   - Revisar `.env` (`PORT`, `JWT_SECRET`, `DATA_FILE` opcional) y garantizar permisos de escritura en `data/database.json`.
3. **TrueQIA**:
   - Instalar dependencias con `npm install`; luego `npm run lint` y `npm run typecheck`.
   - Levantar con `npx expo start` configurando `EXPO_PUBLIC_API_BASE_URL` hacia el backend.
4. **Allwain**:
   - Instalar dependencias y arrancar Expo (`npm install`, `npx expo start`).
   - Probar flujos de ofertas y escaneo demo contra el backend.
5. **Documentación**: mantener actualizados los README con comandos de instalación/ejecución y registrar cualquier nuevo error o paso manual necesario (p. ej., añadir certificados en dispositivos físicos).
