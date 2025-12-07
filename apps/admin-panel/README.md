# Admin Panel (Next.js)

Panel web base para administrar usuarios, patrocinadores y configuración demo de IA/escaneo para Newmersive.

## Scripts

```bash
cd apps/admin-panel
npm install
npm run dev   # http://localhost:3000
```

Configura el backend con `PORT` y expone la API en `http://localhost:4000/api` (valor por defecto). Puedes ajustar la URL del backend con la variable `NEXT_PUBLIC_API_BASE_URL`.

## Módulos incluidos
- **Login admin**: autenticación contra `/api/auth/login` (solo rol `admin`).
- **Usuarios**: listado desde `/api/admin/users` con bloqueo simulado localmente.
- **Patrocinadores**: resumen TrueQIA (tokens) y tabla Allwain con `/api/admin/allwain/sponsors`.
- **IA**: selector demo/real + activación de módulos guardados en `localStorage`; muestra eventos de `/api/admin/ai/activity`.
- **Escaneo**: configuración local de `SCAN_PROVIDER` y límites de uso.
- **Contratos**: listado filtrable a partir de trades (`/api/trueqia/trades`) enriquecido con ofertas TrueQIA/Allwain.
