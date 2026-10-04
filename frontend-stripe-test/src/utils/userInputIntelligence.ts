const EMAIL_DOMAIN_CORRECTIONS: Record<string, string> = {
  "gamil.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlook.con": "outlook.com",
  "yahoo.con": "yahoo.com",
};

export function suggestEmailCorrection(value: string) {
  const email = value.trim().toLowerCase();
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return null;
  const domain = email.slice(separator + 1);
  const correctedDomain = EMAIL_DOMAIN_CORRECTIONS[domain];
  return correctedDomain ? `${email.slice(0, separator)}@${correctedDomain}` : null;
}

