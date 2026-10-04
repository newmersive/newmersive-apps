CREATE FUNCTION "allwain_checkout_presentation_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."metadata"->'checkoutPresentation' IS NOT NULL AND
    NEW."metadata"->'checkoutPresentation' IS DISTINCT FROM OLD."metadata"->'checkoutPresentation' THEN
    RAISE EXCEPTION 'ALLWAIN_CHECKOUT_PRESENTATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AllwainPayment_checkout_presentation_immutable"
  BEFORE UPDATE ON "AllwainPayment"
  FOR EACH ROW EXECUTE FUNCTION "allwain_checkout_presentation_immutable"();
