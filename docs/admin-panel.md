# Admin Panel y monitoreo

## Propósito
- Centralizar validaciones administrativas: comprobar que la API responde, listar usuarios sin exponer hashes y revisar actividad de IA.
- Dar soporte a métricas de referidos Allwain (`/admin/allwain/sponsors`).

## Componentes
- **Backend** (`backend/src/routes/admin.routes.ts`): rutas protegidas con `authRequired` + `adminOnly`.
- **Datos**: `auth.service.getPublicUsers` filtra campos sensibles; `ia/moderation.service` devuelve eventos demo; `allwain.service.listAllSponsorStats` agrega métricas de referidos.
- **Clientes**: pantallas Admin en apps móviles son placeholders; el consumo real se hace vía llamadas HTTP con token admin.

## Cómo se despliega
1. Depende del backend: tras compilar/arrancar, asegurar que existe un usuario con rol `admin` (seed automático `admin@newmersive.local` / `admin123`).
2. Confirmar `JWT_SECRET` idéntico en todas las réplicas para que los tokens admin funcionen.
3. Exponer `/api/admin/*` solo tras capa HTTPS/reverse proxy; idealmente restringir por IP en el proxy.

## Cómo se repara (errores típicos)
- **403/FORBIDDEN**: el usuario no tiene rol `admin`; usar credenciales seed o modificar rol en `data/database.json` y reiniciar.
- **Lista vacía de usuarios**: `data/database.json` corrupto; dejar que `data.store.ts` regenere seed o restaurar backup.
- **Actividad IA vacía**: es normal; son datos demo. Si se requiere, extender `ia/moderation.service` para eventos adicionales.
- **404 en `/admin/allwain/sponsors`**: verificar prefijo `/api` y autenticación Bearer; la ruta vive en el router admin, no en `/allwain`.
