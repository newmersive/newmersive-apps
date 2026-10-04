UPDATE "Product"
SET
  "visibility" = 'public',
  "name" = CASE "id"
    WHEN 'allwain-catalog-product-0001' THEN 'Tomate valenciano · Meliana'
    WHEN 'allwain-catalog-product-0002' THEN 'Miel de azahar · Alboraya'
    WHEN 'allwain-catalog-product-0003' THEN 'Aceite de oliva virgen extra · Valencia'
    WHEN 'allwain-catalog-product-0004' THEN 'Arroz de Valencia · Moncada'
    WHEN 'allwain-catalog-product-0005' THEN 'Lavadora de bajo consumo · Massamagrell'
    WHEN 'allwain-catalog-product-0006' THEN 'Televisor 4K · Foios'
    WHEN 'allwain-catalog-product-0007' THEN 'Ordenador portátil profesional · Meliana'
    WHEN 'allwain-catalog-product-0008' THEN 'Bicicleta urbana · Alboraya'
    WHEN 'allwain-catalog-product-0009' THEN 'Revisión de vehículo · Valencia'
    WHEN 'allwain-catalog-product-0010' THEN 'Reparación de fontanería · Moncada'
    WHEN 'allwain-catalog-product-0011' THEN 'Diseño de identidad comercial · Massamagrell'
    ELSE "name"
  END,
  "brand" = 'Catálogo de demostración Allwain',
  "description" = 'Oferta de demostración para explorar Allwain sin generar pedidos ni cobros.'
WHERE "id" IN (
  'allwain-catalog-product-0001',
  'allwain-catalog-product-0002',
  'allwain-catalog-product-0003',
  'allwain-catalog-product-0004',
  'allwain-catalog-product-0005',
  'allwain-catalog-product-0006',
  'allwain-catalog-product-0007',
  'allwain-catalog-product-0008',
  'allwain-catalog-product-0009',
  'allwain-catalog-product-0010',
  'allwain-catalog-product-0011'
);

UPDATE "Offer"
SET
  "title" = CASE "id"
    WHEN 'allwain-catalog-offer-0001' THEN 'Tomate valenciano · Meliana'
    WHEN 'allwain-catalog-offer-0002' THEN 'Miel de azahar · Alboraya'
    WHEN 'allwain-catalog-offer-0003' THEN 'Aceite de oliva virgen extra · Valencia'
    WHEN 'allwain-catalog-offer-0004' THEN 'Arroz de Valencia · Moncada'
    WHEN 'allwain-catalog-offer-0005' THEN 'Lavadora de bajo consumo · Massamagrell'
    WHEN 'allwain-catalog-offer-0006' THEN 'Televisor 4K · Foios'
    WHEN 'allwain-catalog-offer-0007' THEN 'Ordenador portátil profesional · Meliana'
    WHEN 'allwain-catalog-offer-0008' THEN 'Bicicleta urbana · Alboraya'
    WHEN 'allwain-catalog-offer-0009' THEN 'Revisión de vehículo · Valencia'
    WHEN 'allwain-catalog-offer-0010' THEN 'Reparación de fontanería · Moncada'
    WHEN 'allwain-catalog-offer-0011' THEN 'Diseño de identidad comercial · Massamagrell'
    ELSE "title"
  END,
  "description" = 'Oferta de demostración para explorar cantidades, entrega y recurrencia sin generar pedidos ni cobros.',
  "allwainStatus" = 'active',
  "meta" = COALESCE("meta", '{}'::jsonb) || '{"demo":true,"demoLabel":"Oferta de demostración","checkoutEnabled":false}'::jsonb,
  "updatedAt" = NOW()
WHERE "id" IN (
  'allwain-catalog-offer-0001',
  'allwain-catalog-offer-0002',
  'allwain-catalog-offer-0003',
  'allwain-catalog-offer-0004',
  'allwain-catalog-offer-0005',
  'allwain-catalog-offer-0006',
  'allwain-catalog-offer-0007',
  'allwain-catalog-offer-0008',
  'allwain-catalog-offer-0009',
  'allwain-catalog-offer-0010',
  'allwain-catalog-offer-0011'
);
