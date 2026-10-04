CREATE TABLE "AllwainShoppingList" (
  "id" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "sourceShoppingListId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "allowSubstitutions" BOOLEAN NOT NULL DEFAULT false,
  "needByText" TEXT,
  "proposalDeadlineAt" TIMESTAMP(3),
  "preferredDeliveryChannel" TEXT,
  "deliveryAddress" JSONB,
  "deliveryWindow" JSONB,
  "recurrence" JSONB,
  "locationLabel" TEXT,
  "locationLatApprox" DOUBLE PRECISION,
  "locationLngApprox" DOUBLE PRECISION,
  "selectedOfferId" TEXT,
  "selectedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainShoppingList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainShoppingList_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingList_sourceShoppingListId_fkey" FOREIGN KEY ("sourceShoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingList_status_check" CHECK ("status" IN ('draft', 'published', 'awarded', 'closed', 'canceled', 'archived')),
  CONSTRAINT "AllwainShoppingList_visibility_check" CHECK ("visibility" IN ('public', 'private')),
  CONSTRAINT "AllwainShoppingList_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "AllwainShoppingList_coordinates_check" CHECK (
    ("locationLatApprox" IS NULL OR ("locationLatApprox" BETWEEN -90 AND 90)) AND
    ("locationLngApprox" IS NULL OR ("locationLngApprox" BETWEEN -180 AND 180))
  ),
  CONSTRAINT "AllwainShoppingList_version_check" CHECK ("version" > 0)
);

CREATE TABLE "AllwainShoppingListItem" (
  "id" TEXT NOT NULL,
  "shoppingListId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "productName" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "targetUnitPriceAmount" INTEGER,
  "category" TEXT,
  "subcategory" TEXT,
  "productKind" TEXT,
  "notes" TEXT,
  "qualityReviewId" TEXT,
  "qualityDecision" TEXT,
  "qualityScore" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainShoppingListItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainShoppingListItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingListItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "AllwainShoppingListItem_position_check" CHECK ("position" >= 0),
  CONSTRAINT "AllwainShoppingListItem_target_price_check" CHECK ("targetUnitPriceAmount" IS NULL OR "targetUnitPriceAmount" >= 0),
  CONSTRAINT "AllwainShoppingListItem_quality_score_check" CHECK ("qualityScore" IS NULL OR "qualityScore" BETWEEN 0 AND 100)
);

CREATE TABLE "AllwainShoppingListProposalItem" (
  "id" TEXT NOT NULL,
  "shoppingListId" TEXT NOT NULL,
  "shoppingListItemId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "sellerUserId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "productName" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPriceAmount" INTEGER NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "isSubstitution" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AllwainShoppingListProposalItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AllwainShoppingListProposalItem_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingListProposalItem_shoppingListItemId_fkey" FOREIGN KEY ("shoppingListItemId") REFERENCES "AllwainShoppingListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingListProposalItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingListProposalItem_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AllwainShoppingListProposalItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "AllwainShoppingListProposalItem_unit_price_check" CHECK ("unitPriceAmount" > 0),
  CONSTRAINT "AllwainShoppingListProposalItem_subtotal_check" CHECK ("subtotalAmount" > 0),
  CONSTRAINT "AllwainShoppingListProposalItem_position_check" CHECK ("position" >= 0),
  CONSTRAINT "AllwainShoppingListProposalItem_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

ALTER TABLE "Offer" ADD COLUMN "shoppingListId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "shoppingListId" TEXT;
ALTER TABLE "AllwainRecurringPlan" ADD COLUMN "shoppingListId" TEXT;
ALTER TABLE "AllwainOrder" ADD COLUMN "shoppingListId" TEXT;
ALTER TABLE "AllwainOrderLine"
  ADD COLUMN "shoppingListItemId" TEXT,
  ADD COLUMN "shoppingListProposalItemId" TEXT;

ALTER TABLE "AllwainShoppingList"
  ADD CONSTRAINT "AllwainShoppingList_selectedOfferId_fkey" FOREIGN KEY ("selectedOfferId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainRecurringPlan"
  ADD CONSTRAINT "AllwainRecurringPlan_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainOrder"
  ADD CONSTRAINT "AllwainOrder_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "AllwainShoppingList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllwainOrderLine"
  ADD CONSTRAINT "AllwainOrderLine_shoppingListItemId_fkey" FOREIGN KEY ("shoppingListItemId") REFERENCES "AllwainShoppingListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AllwainOrderLine_shoppingListProposalItemId_fkey" FOREIGN KEY ("shoppingListProposalItemId") REFERENCES "AllwainShoppingListProposalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AllwainShoppingList_selectedOfferId_key" ON "AllwainShoppingList"("selectedOfferId");
CREATE INDEX "AllwainShoppingList_buyerUserId_status_updatedAt_idx" ON "AllwainShoppingList"("buyerUserId", "status", "updatedAt");
CREATE INDEX "AllwainShoppingList_sourceShoppingListId_createdAt_idx" ON "AllwainShoppingList"("sourceShoppingListId", "createdAt");
CREATE INDEX "AllwainShoppingList_visibility_status_publishedAt_idx" ON "AllwainShoppingList"("visibility", "status", "publishedAt");
CREATE INDEX "AllwainShoppingList_proposalDeadlineAt_status_idx" ON "AllwainShoppingList"("proposalDeadlineAt", "status");
CREATE INDEX "AllwainShoppingList_locationLabel_status_idx" ON "AllwainShoppingList"("locationLabel", "status");

CREATE UNIQUE INDEX "AllwainShoppingListItem_shoppingListId_position_key" ON "AllwainShoppingListItem"("shoppingListId", "position");
CREATE INDEX "AllwainShoppingListItem_shoppingListId_productKind_category_idx" ON "AllwainShoppingListItem"("shoppingListId", "productKind", "category");
CREATE INDEX "AllwainShoppingListItem_productName_idx" ON "AllwainShoppingListItem"("productName");

CREATE UNIQUE INDEX "AllwainShoppingListProposalItem_offerId_shoppingListItemId_key" ON "AllwainShoppingListProposalItem"("offerId", "shoppingListItemId");
CREATE INDEX "AllwainShoppingListProposalItem_shoppingListId_sellerUserId_idx" ON "AllwainShoppingListProposalItem"("shoppingListId", "sellerUserId");
CREATE INDEX "AllwainShoppingListProposalItem_shoppingListItemId_idx" ON "AllwainShoppingListProposalItem"("shoppingListItemId");
CREATE INDEX "AllwainShoppingListProposalItem_offerId_position_idx" ON "AllwainShoppingListProposalItem"("offerId", "position");

CREATE UNIQUE INDEX "Offer_shoppingListId_ownerUserId_key" ON "Offer"("shoppingListId", "ownerUserId");
CREATE INDEX "Offer_shoppingListId_allwainStatus_createdAt_idx" ON "Offer"("shoppingListId", "allwainStatus", "createdAt");
CREATE INDEX "Contract_shoppingListId_status_createdAt_idx" ON "Contract"("shoppingListId", "status", "createdAt");
CREATE INDEX "AllwainRecurringPlan_shoppingListId_status_nextRunAt_idx" ON "AllwainRecurringPlan"("shoppingListId", "status", "nextRunAt");
CREATE INDEX "AllwainOrder_shoppingListId_createdAt_idx" ON "AllwainOrder"("shoppingListId", "createdAt");
CREATE UNIQUE INDEX "AllwainOrderLine_orderId_shoppingListItemId_key" ON "AllwainOrderLine"("orderId", "shoppingListItemId");
CREATE INDEX "AllwainOrderLine_shoppingListProposalItemId_idx" ON "AllwainOrderLine"("shoppingListProposalItemId");
