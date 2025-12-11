# Admin Panel

## Propósito
El panel de administración ofrece una vista rápida del ecosistema Newmersive: estado de usuarios, leads capturados (web/WhatsApp), actividad de IA y métricas de patrocinadores. Se usa como consola de control básica sin modificar datos de negocio.

## Secciones
- **Dashboard**: tarjetas con usuarios (conteo demo si falta endpoint), leads totales, patrocinadores e incidencias de IA.
- **Leads**: tabla de lectura con nombre, contacto, origen (canal + app) y fecha. Alimentada por `/api/admin/leads`.
- **IA y Supervisión**: lista de eventos de moderación (stub) y recordatorio de qué alertas se mostrarán en el futuro: abuso, anomalías de uso y patrones raros de trueques/compras.
- **Sponsors / Recompensas**: métricas en lectura de invitaciones y comisiones. Allwain usa `/api/allwain/sponsors/summary`; TrueQIA mostrará tokens cuando exista `/api/trueqia/sponsors/summary`.

## Endpoints consumidos
- `/api/admin/summary` (totales rápidos; alias de dashboard simple).
- `/api/admin/leads`.
- `/api/admin/ai/activity` (stub con eventos de moderación demo).
- `/api/allwain/sponsors/summary` (requiere token del usuario/admin actual).
- `/api/trueqia/sponsors/summary` (pendiente; se muestra placeholder si no existe).

## Cómo arrancarlo en local
1. Colocarse en `apps/admin-panel/`.
2. Instalar dependencias: `npm install`.
3. Definir `NEXT_PUBLIC_API_BASE_URL` apuntando al backend (ej. `http://localhost:4000/api`).
4. Ejecutar `npm run dev` y abrir `http://localhost:3000`.
5. Iniciar sesión con un usuario con rol `admin` (seed: `admin@newmersive.local` / `admin123`).
