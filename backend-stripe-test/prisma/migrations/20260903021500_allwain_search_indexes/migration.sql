CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Offer_title_trgm_idx"
  ON "Offer" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Offer_description_trgm_idx"
  ON "Offer" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Offer_category_trgm_idx"
  ON "Offer" USING GIN ("category" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Offer_locationLabel_trgm_idx"
  ON "Offer" USING GIN ("locationLabel" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AllwainScanRequest_title_trgm_idx"
  ON "AllwainScanRequest" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AllwainScanRequest_description_trgm_idx"
  ON "AllwainScanRequest" USING GIN ("description" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AllwainScanRequest_locationLabel_trgm_idx"
  ON "AllwainScanRequest" USING GIN ("locationLabel" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_brand_trgm_idx"
  ON "Product" USING GIN ("brand" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "AllwainSellerProfile_displayName_trgm_idx"
  ON "AllwainSellerProfile" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "AllwainSellerProfile_locationLabel_trgm_idx"
  ON "AllwainSellerProfile" USING GIN ("locationLabel" gin_trgm_ops);
