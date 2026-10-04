import { useCallback } from "react";

import { useAuthStore } from "../store/auth.store";
import { translate, type TranslationKey } from ".";

export function useAppTranslation() {
  const locale = useAuthStore((state) => state.locale);
  const t = useCallback(
    (key: TranslationKey, replacements?: Record<string, string | number>) =>
      translate(locale, key, replacements),
    [locale],
  );
  return { locale, t };
}
