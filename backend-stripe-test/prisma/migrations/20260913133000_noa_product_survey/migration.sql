-- NOA-only answers. Shared identities; no changes to Allwain or TrueQIA records.
CREATE TABLE "NoaAccountConsent" (
  "userId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoaAccountConsent_pkey" PRIMARY KEY ("userId", "version"),
  CONSTRAINT "NoaAccountConsent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NoaAccountConsent_locale_check" CHECK ("locale" IN ('es','en','fr','it','zh','ar'))
);

CREATE TABLE "NoaProductSurvey" (
  "userId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoaProductSurvey_pkey" PRIMARY KEY ("userId", "schemaVersion"),
  CONSTRAINT "NoaProductSurvey_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NoaProductSurvey_locale_check" CHECK ("locale" IN ('es','en','fr','it','zh','ar')),
  CONSTRAINT "NoaProductSurvey_answers_check" CHECK (jsonb_typeof("answers")='object')
);
