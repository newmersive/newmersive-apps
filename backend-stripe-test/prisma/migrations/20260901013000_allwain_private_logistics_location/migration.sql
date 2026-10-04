ALTER TABLE "AllwainSellerProfile"
  ADD COLUMN "locationLabel" TEXT,
  ADD COLUMN "pickupAddress" TEXT,
  ADD COLUMN "locationLatApprox" DOUBLE PRECISION,
  ADD COLUMN "locationLngApprox" DOUBLE PRECISION;

ALTER TABLE "AllwainDeliveryAssignment"
  ADD COLUMN "pickupAddress" JSONB,
  ADD COLUMN "deliveryAddress" JSONB,
  ADD COLUMN "pickupLatApprox" DOUBLE PRECISION,
  ADD COLUMN "pickupLngApprox" DOUBLE PRECISION,
  ADD COLUMN "deliveryLatApprox" DOUBLE PRECISION,
  ADD COLUMN "deliveryLngApprox" DOUBLE PRECISION,
  ADD COLUMN "routeDistanceKm" DOUBLE PRECISION;
