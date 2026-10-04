CREATE TABLE "AllwainEconomicPolicy" (
    "version" INTEGER PRIMARY KEY CHECK ("version" > 0),
    "saleFeeBps" INTEGER NOT NULL CHECK ("saleFeeBps" BETWEEN 0 AND 10000),
    "savingsFeeBps" INTEGER NOT NULL CHECK ("savingsFeeBps" BETWEEN 0 AND 10000),
    "localDeliveryAmount" INTEGER NOT NULL CHECK ("localDeliveryAmount" BETWEEN 0 AND 100000),
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL CHECK (length(trim("reason")) BETWEEN 10 AND 1000),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AllwainEconomicPolicy_effectiveAt_key" ON "AllwainEconomicPolicy"("effectiveAt");
CREATE INDEX "AllwainEconomicPolicy_effectiveAt_idx" ON "AllwainEconomicPolicy"("effectiveAt");
ALTER TABLE "Contract" ADD COLUMN "economicPolicySnapshot" JSONB;
ALTER TABLE "AllwainOrder" ADD COLUMN "economicPolicySnapshot" JSONB;
ALTER TABLE "AllwainRecurringPlan" ADD COLUMN "economicPolicySnapshot" JSONB;

CREATE FUNCTION "allwain_economic_policy_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Economic policies are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "allwain_economic_policy_immutable" BEFORE UPDATE OR DELETE ON "AllwainEconomicPolicy"
FOR EACH ROW EXECUTE FUNCTION "allwain_economic_policy_immutable"();

CREATE FUNCTION "allwain_economic_snapshot_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."economicPolicySnapshot" IS NOT NULL AND
     OLD."economicPolicySnapshot" IS DISTINCT FROM NEW."economicPolicySnapshot" THEN
    RAISE EXCEPTION 'Accepted economic policy snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "allwain_contract_economic_snapshot" BEFORE UPDATE ON "Contract"
FOR EACH ROW EXECUTE FUNCTION "allwain_economic_snapshot_immutable"();
CREATE TRIGGER "allwain_order_economic_snapshot" BEFORE UPDATE ON "AllwainOrder"
FOR EACH ROW EXECUTE FUNCTION "allwain_economic_snapshot_immutable"();
CREATE TRIGGER "allwain_recurring_economic_snapshot" BEFORE UPDATE ON "AllwainRecurringPlan"
FOR EACH ROW EXECUTE FUNCTION "allwain_economic_snapshot_immutable"();
