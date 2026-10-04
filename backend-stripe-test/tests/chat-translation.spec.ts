import assert from "node:assert";
import { describe, it } from "node:test";

import {
  CHAT_TRANSLATION_LOCALES,
  normalizeChatTranslationLocale,
} from "../src/services/chat-translation.service";

describe("Allwain chat translation locales", () => {
  it("accepts every supported UI locale and normalizes regional variants", () => {
    assert.deepEqual(CHAT_TRANSLATION_LOCALES, ["es", "en", "fr", "it", "zh", "ar"]);
    assert.equal(normalizeChatTranslationLocale("es-ES"), "es");
    assert.equal(normalizeChatTranslationLocale("en_GB"), "en");
    assert.equal(normalizeChatTranslationLocale("fr-FR"), "fr");
    assert.equal(normalizeChatTranslationLocale("it-IT"), "it");
    assert.equal(normalizeChatTranslationLocale("zh-CN"), "zh");
    assert.equal(normalizeChatTranslationLocale("ar-SA"), "ar");
  });

  it("rejects unsupported and empty locale values", () => {
    assert.throws(
      () => normalizeChatTranslationLocale("de-DE"),
      /UNSUPPORTED_TRANSLATION_LOCALE/,
    );
    assert.throws(
      () => normalizeChatTranslationLocale(""),
      /UNSUPPORTED_TRANSLATION_LOCALE/,
    );
  });
});
