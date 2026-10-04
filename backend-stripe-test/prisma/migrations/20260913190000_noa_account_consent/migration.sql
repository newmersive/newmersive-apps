-- Additive NOA-only account notice evidence; no change to shared identities.
CREATE TABLE "NoaAccountConsent" (
  "userId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoaAccountConsent_pkey" PRIMARY KEY ("userId", "version"),
  CONSTRAINT "NoaAccountConsent_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NoaAccountConsent_locale_check" CHECK ("locale" IN ('es','en','fr','it','zh','ar'))
);
