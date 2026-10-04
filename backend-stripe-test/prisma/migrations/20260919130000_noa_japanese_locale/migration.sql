ALTER TABLE "NoaAccountConsent" DROP CONSTRAINT "NoaAccountConsent_locale_check";
ALTER TABLE "NoaAccountConsent" ADD CONSTRAINT "NoaAccountConsent_locale_check" CHECK ("locale" IN ('es','en','fr','it','zh','ar','ja'));
ALTER TABLE "NoaProductSurvey" DROP CONSTRAINT "NoaProductSurvey_locale_check";
ALTER TABLE "NoaProductSurvey" ADD CONSTRAINT "NoaProductSurvey_locale_check" CHECK ("locale" IN ('es','en','fr','it','zh','ar','ja'));
