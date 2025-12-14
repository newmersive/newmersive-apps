# IA y flujo de escaneo

## Propósito
Explicar los stubs de IA (contratos y moderación) y cómo se conectan con las rutas actuales, junto al flujo de escaneo/lookup de productos Allwain.

## Componentes
- **Contratos demo**:
  - Servicio: `backend/src/services/ai/contracts.ai.service.ts` expone `generateContractText`, que construye el texto de contrato sin depender de un proveedor externo.
  - Ruta: `/trueqia/contracts/preview` usa `generateContractPreview` (en `services/trueqia.service.ts`) para llamar al stub y guardar el borrador.
  - Payload esperado: `offerTitle`, `requesterName`, `providerName`, `tokens`.
- **Moderación demo**: `/admin/ai/activity` devuelve eventos de ejemplo consumidos por el panel admin (no hay scoring real todavía).
- **Escaneo Allwain**:
  - `/allwain/scan-demo` y productos (`/allwain/products/:id`, `/allwain/products?ean=`) viven en `routes/allwain.routes.ts` con lógica en `services/allwain.service.ts` y `services/allwain-demo.service.ts`.

## Cómo sustituir por un modelo IA real
1. Implementar la llamada al proveedor deseado dentro de `services/ai/contracts.ai.service.ts` manteniendo la misma firma y tipos.
2. No es necesario tocar las rutas: `generateContractPreview` ya abstrae la generación y guarda el resultado en la base de datos demo.
3. Para moderación, extender el stub de `/admin/ai/activity` o crear un servicio similar que lea de la fuente elegida.

## Despliegue y notas
- No requiere dependencias externas ni claves IA en el estado actual.
- Exponer `/api/trueqia/contracts/preview`, `/api/admin/ai/activity` y `/api/allwain/*` tras proxy HTTPS.
- Ajustar `EXPO_PUBLIC_API_BASE_URL` o `NEXT_PUBLIC_API_BASE_URL` para que apps y panel apunten al host correcto.
