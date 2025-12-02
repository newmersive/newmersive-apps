# Newmersive Backend

Backend en Node.js/TypeScript para las experiencias de **TRUEQIA** y **ALLWAIN**. Expone las rutas en `/api` y utiliza un almacenamiento JSON sencillo para usuarios, ofertas y transacciones demo.

> 📄 Consulta el resumen de arquitectura en [docs/backend-architecture.md](../docs/backend-architecture.md).

## Requisitos
- Node.js **20.x** (probado con la serie LTS actual)
- npm **10.x**

## Configuración
1. Instala dependencias (se utiliza `--legacy-peer-deps` para evitar conflictos de peer dependencies en entornos antiguos):
   ```bash
   npm install --legacy-peer-deps
   ```
2. Crea un archivo `.env` en la raíz del backend (puedes partir de `.env.example`).

### Variables de entorno
El backend lee las siguientes variables (no incluyas valores sensibles en el repositorio):

| Variable      | Descripción                                                                 | Ejemplo                    |
| ------------- | --------------------------------------------------------------------------- | -------------------------- |
| `PORT`        | Puerto de escucha del servidor Express.                                     | `4000`                     |
| `JWT_SECRET`  | Clave usada para firmar tokens JWT.                                         | `cambia-esta-clave`        |
| `NODE_ENV`    | Entorno de ejecución (`development`, `production`, `test`).                 | `development`              |
| `DEMO_MODE`   | Activa comportamientos demo cuando vale `true`.                             | `false`                    |
| `DATA_FILE`   | Ruta del archivo JSON con los datos persistidos (usuarios/ofertas/demo).    | `./data/database.json`     |

## Cómo arrancar
1. **Desarrollo:**
   ```bash
   npm run dev
   ```
   Levanta el servidor con recarga automática en `http://localhost:4000` (o el puerto definido en `PORT`).
2. **Compilar para producción:**
   ```bash
   npm run build
   ```
3. **Arrancar build compilado:**
   ```bash
   npm start
   ```

## Rutas principales (todas bajo `/api`)
- `GET /health` — Comprobación rápida del estado y del `NODE_ENV`.
- `POST /auth/register` — Registro de usuario (roles permitidos: `user`, `company`, `admin`, `buyer`).
- `POST /auth/login` — Inicio de sesión; devuelve token JWT.
- `GET /auth/me` — Perfil del usuario autenticado.
- **TRUEQIA**
  - `GET /trueqia/offers` — Ofertas disponibles para TRUEQIA.
  - `GET /trueqia/trades` — Intercambios demo.
  - `POST /trueqia/contracts/preview` — Genera texto de contrato demo (no modifica firma de ruta usada por TRUEQIA).
- **ALLWAIN**
  - `GET /allwain/scan-demo` — Respuesta de ejemplo para lectura de etiqueta.
  - `GET /allwain/offers` — Ofertas disponibles para ALLWAIN.
- **Administración** (requiere token de usuario con rol `admin`)
  - `GET /admin/dashboard` — Ping protegido para panel.
  - `GET /admin/users` — Lista pública de usuarios demo.
  - `GET /admin/ai/activity` — Eventos demo de moderación.

## Pruebas
Las pruebas viven en `tests/` y cubren autenticación y protecciones de rutas.

Ejecuta toda la suite con:
```bash
npm test
```
