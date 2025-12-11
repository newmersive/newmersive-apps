# Recompensas y sponsors

## Cómo se calculan y guardan
- **TrueQIA (tokens)**: los usuarios acumulan tokens por invitaciones y trueques. Los saldos se guardan junto al usuario (`tokens` en el JSON demo). Pendiente endpoint agregado para resumen: se documenta como `/trueqia/sponsors/summary` para futuras iteraciones.
- **Allwain (comisiones)**: `services/allwain.service.ts` registra ahorros vía `/allwain/savings` y genera métricas por sponsor en `getSponsorSummary` (totales de invitados, ahorro y comisión).

## Endpoints relevantes
- `/auth/register` acepta `sponsorCode` para registrar referidos.
- `/allwain/sponsors/summary` devuelve totales para el usuario autenticado.
- `/admin/allwain/sponsors` agrega métricas para paneles administrativos.
- `/trueqia/sponsors/summary` (placeholder documentado; mostrar tokens acumulados cuando esté disponible).

## Qué se ve en las pantallas
- **Apps**: las pantallas de Sponsors muestran el código personal y los invitados (Allwain) o tokens (TrueQIA) según los datos disponibles.
- **Panel admin**: sección “Sponsors / Recompensas” lee `/api/allwain/sponsors/summary` y muestra placeholder para TrueQIA hasta que exista el endpoint dedicado.

## Nota sobre QR
“El sistema avanzado de QR de campañas y tarjetas PVC se implementará en una fase posterior (Fase 2). Actualmente, cada usuario tiene un único QR personal, gestionado por el backend tal como está.”
