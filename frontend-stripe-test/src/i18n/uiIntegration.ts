import type { AppLocale } from ".";

type AccessCopy = { website: string; heading: string; intro: string; passwordHelp: string; separator: string };

export const accessCopy: Record<AppLocale, AccessCopy> = {
  es: { website: "Volver a la web", heading: "Tu espacio en Allwain", intro: "Compra, vende o conecta desde una misma cuenta.", passwordHelp: "Al menos 12 caracteres.", separator: "o continúa con" },
  en: { website: "Back to the website", heading: "Your space in Allwain", intro: "Buy, sell or connect with one account.", passwordHelp: "At least 12 characters.", separator: "or continue with" },
  fr: { website: "Retour au site", heading: "Votre espace Allwain", intro: "Achetez, vendez ou mettez en relation avec un seul compte.", passwordHelp: "Au moins 12 caractères.", separator: "ou continuez avec" },
  it: { website: "Torna al sito", heading: "Il tuo spazio Allwain", intro: "Compra, vendi o metti in contatto con un solo account.", passwordHelp: "Almeno 12 caratteri.", separator: "oppure continua con" },
  zh: { website: "返回网站", heading: "你的 Allwain 空间", intro: "使用同一账户购买、销售或建立联系。", passwordHelp: "至少 12 个字符。", separator: "或使用以下方式继续" },
  ar: { website: "العودة إلى الموقع", heading: "مساحتك في Allwain", intro: "اشترِ أو بِع أو صِل بين الآخرين من حساب واحد.", passwordHelp: "12 حرفًا على الأقل.", separator: "أو تابع باستخدام" },
};
