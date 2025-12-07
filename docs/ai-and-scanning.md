# IA y flujo de escaneo

## Propósito
- Documentar los módulos de IA demo (contratos y moderación) y el flujo de escaneo/lookup de productos Allwain.
- Facilitar troubleshooting de endpoints simulados que las apps móviles consumen.

## Componentes
- **Contratos demo**: `backend/src/ia/contracts.service.ts` genera texto de contrato de trueque para `/trueqia/contracts/preview`.
- **Moderación demo**: `backend/src/ia/moderation.service.ts` expone eventos ficticios consumidos por `/admin/ai/activity`.
- **Escaneo Allwain**:
  - Endpoint `/allwain/scan-demo`: armado en `allwain.routes.ts` con `buildAllwainScanDemo` (`services/allwain-demo.service.ts`).
  - Lookup realista de productos: `/allwain/products/:id` y `/allwain/products?ean=` usan `services/allwain.service.ts`.
- **Clientes**:
  - TrueQIA: `ContractPreviewScreen` (POST contrato demo).
  - Allwain: `ScanScreen` → `ScanResultScreen` para `/scan-demo`; `DealsScreen` y otras pantallas usan productos/ofertas.

## Cómo se despliega
1. Depende del backend compilado; no requiere dependencias externas.
2. Exponer `/api/trueqia/contracts/preview`, `/api/admin/ai/activity` y `/api/allwain/*` tras proxy HTTPS.
3. Ajustar `EXPO_PUBLIC_API_BASE_URL` en apps al host publicado; sin ello las llamadas fallarán en dispositivos móviles.

## Cómo se repara (errores típicos)
- **Contrato vacío o 500**: payload incorrecto en `ContractPreviewScreen`; validar que se envían campos esperados (titulo, partes). Revisar logs del backend.
- **Eventos IA siempre iguales**: comportamiento esperado (demo). Para más detalle agregar eventos en `moderation.service.ts`.
- **Escaneo devuelve 401**: falta token; el endpoint exige auth incluso siendo demo.
- **`PRODUCT_NOT_FOUND`**: EAN/ID inexistente; usar IDs semilla del JSON (`products` en `data.store.ts`).
- **`INVALID_LOCATION` en ofertas Allwain**: parámetros `lat/lng` no numéricos; probar sin filtros o enviar números válidos.
