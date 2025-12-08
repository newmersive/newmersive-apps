# Referidos y sponsors

## Propósito
- Describir cómo se generan y consumen los códigos de sponsor para incentivar invitaciones.
- Alinear frontend y backend en el cálculo de comisiones y visibilidad de códigos.

## Componentes
- **Backend**:
  - `auth.service.ts`: valida `sponsorCode` en registro, asigna código propio (`newSponsorCode`) y guarda `referredByCode` si aplica.
  - `data.store.ts`: seeds con códigos (`SPN-ADMIN`, `SPN-TRUEQIA`, `SPN-ALLWAIN`, etc.).
  - `allwain.service.ts`: calcula ahorros y comisiones (`registerAllwainSaving`) y agrega métricas (`listAllSponsorStats`).
  - Rutas: `/auth/register` acepta `sponsorCode`; `/allwain/savings` registra ahorro y comisión; `/admin/allwain/sponsors` lista métricas.
- **Apps móviles**:
  - TrueQIA y Allwain muestran/leen `sponsorCode` en AuthScreen y SponsorsScreen; `SponsorQRScreen` permite compartir código.

## Cómo se despliega
1. Backend debe conservar `data/database.json` con códigos seed o usar `DATA_FILE` persistente.
2. Al subir a producción, definir qué usuarios iniciales tendrán códigos compartibles (editar JSON o crear usuarios via `/auth/register`).
3. Configurar apps con `EXPO_PUBLIC_API_BASE_URL` para que `/auth/register` capture `sponsorCode` y `/auth/me` devuelva el código asignado.

## Cómo se repara (errores típicos)
- **Código no reconocido**: `validateSponsorCode` solo acepta códigos existentes en usuarios; crear el sponsor primero o usar uno seed.
- **Comisión cero en `/allwain/savings`**: usuario sin `referredByCode`; confirmar que se registró con sponsor o setear manualmente en el JSON.
- **Resumen admin vacío**: no hay ahorros registrados; disparar pruebas con `/allwain/savings` o revisar que `listAllSponsorStats` recorra el JSON correcto (`DATA_FILE`).
- **Código no visible en app**: refrescar sesión (`/auth/me`) tras login; las apps guardan usuario solo en memoria.
