ALTER TABLE "AllwainShoppingList"
  ADD COLUMN "demo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AllwainShoppingList"
  DROP CONSTRAINT "AllwainShoppingList_status_check";

ALTER TABLE "AllwainShoppingList"
  ADD CONSTRAINT "AllwainShoppingList_status_check"
  CHECK ("status" IN ('draft', 'published', 'partially_awarded', 'awarded', 'closed', 'canceled', 'archived'));

WITH demo_buyer AS (
  SELECT "id"
  FROM "User"
  WHERE "deletedAt" IS NULL
    AND "status" = 'active'
    AND "email" LIKE '%@newmersive.local'
  ORDER BY CASE WHEN "email" = 'demo.allwain.buyer@newmersive.local' THEN 0 ELSE 1 END,
           "createdAt" ASC
  LIMIT 1
), demo_lists AS (
  SELECT * FROM (VALUES
    ('allwain-demo-shopping-list-weekly-local', 'Compra semanal de casa', 'Fruta, leche, cafe y productos basicos para una familia. Practica ofreciendo toda la lista o solo lo que tengas.', 'Foios, Valencia', 39.534, -0.356, 'local_connector', '{"enabled":true,"interval":"weekly","label":"Cada semana"}'::jsonb),
    ('allwain-demo-shopping-list-office', 'Reposicion mensual de oficina', 'Material y consumibles habituales para un equipo de doce personas.', 'Valencia', 39.470, -0.376, 'carrier', '{"enabled":true,"interval":"monthly","label":"Cada mes"}'::jsonb),
    ('allwain-demo-shopping-list-home', 'Puesta a punto de una vivienda', 'Electrodomesticos y servicios para preparar una vivienda antes de entrar.', 'Alboraya, Valencia', 39.500, -0.349, 'seller', NULL::jsonb),
    ('allwain-demo-shopping-list-event', 'Productos para una celebracion local', 'Compra agrupada de alimentos, bebidas y material reutilizable.', 'Meliana, Valencia', 39.528, -0.349, 'local_connector', NULL::jsonb),
    ('allwain-demo-shopping-list-farm', 'Suministros quincenales para huerta', 'Una lista recurrente que permite comparar varios proveedores por bloques.', 'Moncada, Valencia', 39.545, -0.395, 'pickup', '{"enabled":true,"interval":"biweekly","label":"Cada 15 dias"}'::jsonb)
  ) AS value("id", "title", "description", "locationLabel", "lat", "lng", "channel", "recurrence")
)
INSERT INTO "AllwainShoppingList" (
  "id", "buyerUserId", "title", "description", "demo", "status", "visibility",
  "currency", "allowSubstitutions", "needByText", "proposalDeadlineAt",
  "preferredDeliveryChannel", "recurrence", "locationLabel", "locationLatApprox",
  "locationLngApprox", "publishedAt", "version", "createdAt", "updatedAt"
)
SELECT demo_lists."id", demo_buyer."id", demo_lists."title", demo_lists."description",
       true, 'published', 'public', 'EUR', true, 'Durante los proximos 14 dias',
       CURRENT_TIMESTAMP + INTERVAL '365 days', demo_lists."channel", demo_lists."recurrence",
       demo_lists."locationLabel", demo_lists."lat", demo_lists."lng", CURRENT_TIMESTAMP,
       1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM demo_lists CROSS JOIN demo_buyer
ON CONFLICT ("id") DO NOTHING;

WITH demo_items AS (
  SELECT * FROM (VALUES
    ('allwain-demo-list-item-weekly-01', 'allwain-demo-shopping-list-weekly-local', 0, 'Naranjas valencianas', 10.000, 'kg', 120, 'alimentacion', 'fruta', 'produce_weight', 'Recien recogidas'),
    ('allwain-demo-list-item-weekly-02', 'allwain-demo-shopping-list-weekly-local', 1, 'Tomate valenciano', 4.000, 'kg', 250, 'alimentacion', 'verdura', 'produce_weight', NULL),
    ('allwain-demo-list-item-weekly-03', 'allwain-demo-shopping-list-weekly-local', 2, 'Leche', 6.000, 'l', 150, 'alimentacion', 'lacteos', 'packaged_food', NULL),
    ('allwain-demo-list-item-weekly-04', 'allwain-demo-shopping-list-weekly-local', 3, 'Cafe molido', 2.000, 'pack', 500, 'alimentacion', 'despensa', 'packaged_food', 'Paquetes de 500 g'),
    ('allwain-demo-list-item-weekly-05', 'allwain-demo-shopping-list-weekly-local', 4, 'Aceite de oliva', 2.000, 'l', 1000, 'alimentacion', 'despensa', 'packaged_food', NULL),
    ('allwain-demo-list-item-office-01', 'allwain-demo-shopping-list-office', 0, 'Cafe en grano', 8.000, 'pack', 900, 'alimentacion', 'despensa', 'packaged_food', 'Paquetes de 1 kg'),
    ('allwain-demo-list-item-office-02', 'allwain-demo-shopping-list-office', 1, 'Leche', 36.000, 'l', 140, 'alimentacion', 'lacteos', 'packaged_food', NULL),
    ('allwain-demo-list-item-office-03', 'allwain-demo-shopping-list-office', 2, 'Papel reciclado A4', 10.000, 'pack', 650, 'oficina', 'papeleria', 'general', NULL),
    ('allwain-demo-list-item-office-04', 'allwain-demo-shopping-list-office', 3, 'Boligrafos azules', 40.000, 'ud', 60, 'oficina', 'papeleria', 'general', NULL),
    ('allwain-demo-list-item-office-05', 'allwain-demo-shopping-list-office', 4, 'Jabon de manos', 8.000, 'ud', 300, 'hogar', 'limpieza', 'packaged_food', NULL),
    ('allwain-demo-list-item-office-06', 'allwain-demo-shopping-list-office', 5, 'Agua mineral', 12.000, 'pack', 350, 'alimentacion', 'bebidas', 'packaged_food', NULL),
    ('allwain-demo-list-item-home-01', 'allwain-demo-shopping-list-home', 0, 'Lavadora eficiente', 1.000, 'ud', 45000, 'hogar', 'electrodomesticos', 'appliance', NULL),
    ('allwain-demo-list-item-home-02', 'allwain-demo-shopping-list-home', 1, 'Frigorifico combi', 1.000, 'ud', 65000, 'hogar', 'electrodomesticos', 'appliance', NULL),
    ('allwain-demo-list-item-home-03', 'allwain-demo-shopping-list-home', 2, 'Pintura blanca', 20.000, 'l', 700, 'hogar', 'reforma', 'general', NULL),
    ('allwain-demo-list-item-home-04', 'allwain-demo-shopping-list-home', 3, 'Instalacion de lamparas', 1.000, 'servicio', 15000, 'servicios', 'electricidad', 'service', 'Cinco puntos de luz'),
    ('allwain-demo-list-item-home-05', 'allwain-demo-shopping-list-home', 4, 'Limpieza de entrada', 1.000, 'servicio', 12000, 'servicios', 'limpieza', 'service', NULL),
    ('allwain-demo-list-item-event-01', 'allwain-demo-shopping-list-event', 0, 'Naranjas', 25.000, 'kg', 120, 'alimentacion', 'fruta', 'produce_weight', NULL),
    ('allwain-demo-list-item-event-02', 'allwain-demo-shopping-list-event', 1, 'Tomates', 12.000, 'kg', 250, 'alimentacion', 'verdura', 'produce_weight', NULL),
    ('allwain-demo-list-item-event-03', 'allwain-demo-shopping-list-event', 2, 'Pan artesano', 30.000, 'ud', 180, 'alimentacion', 'panaderia', 'packaged_food', NULL),
    ('allwain-demo-list-item-event-04', 'allwain-demo-shopping-list-event', 3, 'Agua mineral', 10.000, 'pack', 350, 'alimentacion', 'bebidas', 'packaged_food', NULL),
    ('allwain-demo-list-item-event-05', 'allwain-demo-shopping-list-event', 4, 'Vasos reutilizables', 100.000, 'ud', 80, 'hogar', 'menaje', 'general', NULL),
    ('allwain-demo-list-item-farm-01', 'allwain-demo-shopping-list-farm', 0, 'Compost vegetal', 20.000, 'saco', 750, 'agricultura', 'sustratos', 'general', NULL),
    ('allwain-demo-list-item-farm-02', 'allwain-demo-shopping-list-farm', 1, 'Cajas reutilizables', 30.000, 'ud', 250, 'agricultura', 'embalaje', 'general', NULL),
    ('allwain-demo-list-item-farm-03', 'allwain-demo-shopping-list-farm', 2, 'Cinta de riego', 4.000, 'rollo', 2200, 'agricultura', 'riego', 'general', NULL),
    ('allwain-demo-list-item-farm-04', 'allwain-demo-shopping-list-farm', 3, 'Guantes de trabajo', 12.000, 'par', 600, 'agricultura', 'proteccion', 'general', NULL),
    ('allwain-demo-list-item-farm-05', 'allwain-demo-shopping-list-farm', 4, 'Revision de motocultor', 1.000, 'servicio', 8500, 'servicios', 'taller', 'service', NULL)
  ) AS value("id", "shoppingListId", "position", "productName", "quantity", "unit", "targetUnitPriceAmount", "category", "subcategory", "productKind", "notes")
)
INSERT INTO "AllwainShoppingListItem" (
  "id", "shoppingListId", "position", "productName", "quantity", "unit",
  "targetUnitPriceAmount", "category", "subcategory", "productKind", "notes",
  "qualityDecision", "qualityScore", "createdAt", "updatedAt"
)
SELECT demo_items."id", demo_items."shoppingListId", demo_items."position",
       demo_items."productName", demo_items."quantity", demo_items."unit",
       demo_items."targetUnitPriceAmount", demo_items."category", demo_items."subcategory",
       demo_items."productKind", demo_items."notes", 'approve', 95,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM demo_items
WHERE EXISTS (
  SELECT 1 FROM "AllwainShoppingList" list WHERE list."id" = demo_items."shoppingListId"
)
ON CONFLICT ("id") DO NOTHING;

WITH ranked_sellers AS (
  SELECT users."id", users."name",
         ROW_NUMBER() OVER (ORDER BY users."createdAt" ASC, users."id" ASC) AS position
  FROM "User" users
  JOIN "AllwainSellerProfile" profile ON profile."userId" = users."id"
  WHERE users."deletedAt" IS NULL
    AND users."status" = 'active'
    AND users."email" LIKE '%@newmersive.local'
    AND profile."status" = 'active'
), demo_proposals AS (
  SELECT * FROM (VALUES
    ('allwain-demo-list-proposal-weekly-full', 'allwain-demo-shopping-list-weekly-local', 1, 'Propuesta completa para la compra semanal', 'Todos los productos, preparados juntos y con reparto local.', 57.00, 5, 'full'),
    ('allwain-demo-list-proposal-weekly-part', 'allwain-demo-shopping-list-weekly-local', 2, 'Propuesta parcial de fruta local', 'Naranjas y tomates directos de productor local.', 18.80, 2, 'partial'),
    ('allwain-demo-list-proposal-office-part', 'allwain-demo-shopping-list-office', 1, 'Propuesta parcial para la oficina', 'Cafe, leche y agua en una sola entrega.', 156.20, 3, 'partial'),
    ('allwain-demo-list-proposal-home-part', 'allwain-demo-shopping-list-home', 2, 'Propuesta de electrodomesticos', 'Lavadora y frigorifico con entrega concertada.', 1019.00, 2, 'partial')
  ) AS value("id", "shoppingListId", "sellerPosition", "title", "description", "price", "itemCount", "coverageKind")
)
INSERT INTO "Offer" (
  "id", "title", "description", "owner", "ownerUserId", "price", "meta",
  "allwainType", "allwainStatus", "shoppingListId", "currency", "unit",
  "category", "productKind", "locationLabel", "commercialModel", "createdAt", "updatedAt"
)
SELECT proposal."id", proposal."title", proposal."description", 'allwain', seller."id",
       proposal."price", jsonb_build_object(
         'demo', true,
         'checkoutEnabled', false,
         'proposalKind', 'shopping_list',
         'shoppingListId', proposal."shoppingListId",
         'itemCount', proposal."itemCount",
         'coveredItemCount', proposal."itemCount",
         'coverageKind', proposal."coverageKind",
         'deliveryEstimate', 'Entrega acordada en 48 horas',
         'unit', 'lista',
         'currency', 'EUR'
       ), 'proposal', 'active', proposal."shoppingListId", 'EUR', 'lista',
       'multi_categoria', 'general', list."locationLabel", 'marketplace',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM demo_proposals proposal
JOIN ranked_sellers seller ON seller.position = proposal."sellerPosition"
JOIN "AllwainShoppingList" list ON list."id" = proposal."shoppingListId"
ON CONFLICT ("id") DO NOTHING;

WITH proposal_lines AS (
  SELECT * FROM (VALUES
    ('allwain-demo-list-line-weekly-full-01', 'allwain-demo-list-proposal-weekly-full', 'allwain-demo-list-item-weekly-01', 0, 'Naranjas valencianas', 10.000, 'kg', 110, 1100),
    ('allwain-demo-list-line-weekly-full-02', 'allwain-demo-list-proposal-weekly-full', 'allwain-demo-list-item-weekly-02', 1, 'Tomate valenciano', 4.000, 'kg', 220, 880),
    ('allwain-demo-list-line-weekly-full-03', 'allwain-demo-list-proposal-weekly-full', 'allwain-demo-list-item-weekly-03', 2, 'Leche', 6.000, 'l', 140, 840),
    ('allwain-demo-list-line-weekly-full-04', 'allwain-demo-list-proposal-weekly-full', 'allwain-demo-list-item-weekly-04', 3, 'Cafe molido', 2.000, 'pack', 470, 940),
    ('allwain-demo-list-line-weekly-full-05', 'allwain-demo-list-proposal-weekly-full', 'allwain-demo-list-item-weekly-05', 4, 'Aceite de oliva', 2.000, 'l', 970, 1940),
    ('allwain-demo-list-line-weekly-part-01', 'allwain-demo-list-proposal-weekly-part', 'allwain-demo-list-item-weekly-01', 0, 'Naranjas valencianas', 10.000, 'kg', 108, 1080),
    ('allwain-demo-list-line-weekly-part-02', 'allwain-demo-list-proposal-weekly-part', 'allwain-demo-list-item-weekly-02', 1, 'Tomate valenciano', 4.000, 'kg', 200, 800),
    ('allwain-demo-list-line-office-part-01', 'allwain-demo-list-proposal-office-part', 'allwain-demo-list-item-office-01', 0, 'Cafe en grano', 8.000, 'pack', 850, 6800),
    ('allwain-demo-list-line-office-part-02', 'allwain-demo-list-proposal-office-part', 'allwain-demo-list-item-office-02', 1, 'Leche', 36.000, 'l', 135, 4860),
    ('allwain-demo-list-line-office-part-03', 'allwain-demo-list-proposal-office-part', 'allwain-demo-list-item-office-06', 5, 'Agua mineral', 12.000, 'pack', 330, 3960),
    ('allwain-demo-list-line-home-part-01', 'allwain-demo-list-proposal-home-part', 'allwain-demo-list-item-home-01', 0, 'Lavadora eficiente', 1.000, 'ud', 39900, 39900),
    ('allwain-demo-list-line-home-part-02', 'allwain-demo-list-proposal-home-part', 'allwain-demo-list-item-home-02', 1, 'Frigorifico combi', 1.000, 'ud', 62000, 62000)
  ) AS value("id", "offerId", "shoppingListItemId", "position", "productName", "quantity", "unit", "unitPriceAmount", "subtotalAmount")
)
INSERT INTO "AllwainShoppingListProposalItem" (
  "id", "shoppingListId", "shoppingListItemId", "offerId", "sellerUserId",
  "position", "productName", "quantity", "unit", "unitPriceAmount",
  "subtotalAmount", "currency", "isSubstitution", "createdAt", "updatedAt"
)
SELECT line."id", item."shoppingListId", line."shoppingListItemId", line."offerId",
       offer."ownerUserId", line."position", line."productName", line."quantity",
       line."unit", line."unitPriceAmount", line."subtotalAmount", 'EUR', false,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM proposal_lines line
JOIN "Offer" offer ON offer."id" = line."offerId"
JOIN "AllwainShoppingListItem" item ON item."id" = line."shoppingListItemId"
ON CONFLICT ("id") DO NOTHING;
