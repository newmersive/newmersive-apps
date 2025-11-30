# Newmersive Backend

## Scripts

- `npm run dev`: inicia el servidor en modo desarrollo con recarga automática.
- `npm run build`: compila TypeScript a JavaScript en `dist/`.
- `npm test`: ejecuta la suite con el runner nativo de Node (`node:test`) usando `ts-node` y `NODE_ENV=test`.

## Pruebas

Las pruebas viven en `tests/` y verifican:
- Registro y login (`POST /auth/register` y `POST /auth/login`) devolviendo los códigos de estado esperados y un token JWT.
- La protección de rutas administrativas a través de `authRequired` y `adminOnly`, rechazando tokens ausentes/erróneos y permitiendo sólo a usuarios con rol `admin`.

Ejecuta todas las pruebas con:

```bash
npm test
