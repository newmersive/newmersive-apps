import type { ImageSourcePropType, ImageURISource } from "react-native";

export const ALLWAIN_BUNDLED_CARD_IMAGES = {
  "ai-service": require("../../assets/card-images/ai-service.jpg"),
  bicycle: require("../../assets/card-images/bicycle.jpg"),
  car: require("../../assets/card-images/car.jpg"),
  coffee: require("../../assets/card-images/coffee.jpg"),
  "cold-brew": require("../../assets/card-images/cold-brew.jpg"),
  design: require("../../assets/card-images/design.jpg"),
  general: require("../../assets/card-images/general.jpg"),
  honey: require("../../assets/card-images/honey.jpg"),
  laptop: require("../../assets/card-images/laptop.jpg"),
  "olive-oil": require("../../assets/card-images/olive-oil.jpg"),
  oranges: require("../../assets/card-images/oranges.jpg"),
  packaging: require("../../assets/card-images/packaging.jpg"),
  plumbing: require("../../assets/card-images/plumbing.jpg"),
  "professional-service": require("../../assets/card-images/professional-service.jpg"),
  rice: require("../../assets/card-images/rice.jpg"),
  television: require("../../assets/card-images/television.jpg"),
  tomatoes: require("../../assets/card-images/tomatoes.jpg"),
  "vehicle-service": require("../../assets/card-images/vehicle-service.jpg"),
  "washing-machine": require("../../assets/card-images/washing-machine.jpg"),
} as const satisfies Record<string, ImageSourcePropType>;

export type AllwainBundledCardImageKey = keyof typeof ALLWAIN_BUNDLED_CARD_IMAGES;

const CONTENT_IMAGE_RULES: ReadonlyArray<[RegExp, AllwainBundledCardImageKey]> = [
  [/naranj|mandarin|clementin|orange/i, "oranges"],
  [/televisi|televisor|smart\s*tv/i, "television"],
  [/lavadora|washing/i, "washing-machine"],
  [/bicic|bike/i, "bicycle"],
  [/port[aá]til|laptop|ordenador|computer/i, "laptop"],
  [/tomat/i, "tomatoes"],
  [/miel|honey/i, "honey"],
  [/aceite.*oliva|olive oil/i, "olive-oil"],
  [/arroz|rice/i, "rice"],
  [/cold\s*brew/i, "cold-brew"],
  [/caf[eé]|coffee/i, "coffee"],
  [/fontaner|plumb/i, "plumbing"],
  [/veh[ií]cul|coche|car\b|t-roc/i, "car"],
  [/dise[nñ]|design/i, "design"],
  [/embalaje|packag/i, "packaging"],
  [/inteligencia artificial|\bia\b|\bai\b/i, "ai-service"],
];

export function inferredAllwainCardImageSource(
  content?: string | null,
): ImageSourcePropType | null {
  const match = CONTENT_IMAGE_RULES.find(([pattern]) => pattern.test(content || ""));
  return match ? ALLWAIN_BUNDLED_CARD_IMAGES[match[1]] : null;
}

function firstSourceUri(source?: ImageSourcePropType | null) {
  if (!source || typeof source === "number") return null;
  const candidate = Array.isArray(source) ? source[0] : source;
  return typeof (candidate as ImageURISource | undefined)?.uri === "string"
    ? (candidate as ImageURISource).uri!
    : null;
}

/**
 * Curated catalogue images are versioned application assets. Resolve them to
 * the bundled copy so a missing media mount cannot leave every offer blank.
 * Captured/user images keep using their authenticated API URL.
 */
export function bundledAllwainCardImageSource({
  apiBaseUrl,
  imageUrl,
  source,
}: {
  apiBaseUrl: string;
  imageUrl?: string | null;
  source?: ImageSourcePropType | null;
}): ImageSourcePropType | null {
  const value = imageUrl || firstSourceUri(source);
  if (!value) return null;

  try {
    const api = new URL(apiBaseUrl);
    const target = new URL(value, `${api.toString().replace(/\/+$/, "")}/`);
    if (target.origin !== api.origin) return null;

    const apiPrefix = api.pathname.replace(/\/+$/, "");
    const match = target.pathname.match(
      new RegExp(`^${apiPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/allwain/media/card-images/([a-z-]+)\\.jpg$`, "i"),
    );
    const key = match?.[1]?.toLowerCase() as AllwainBundledCardImageKey | undefined;
    return key && key in ALLWAIN_BUNDLED_CARD_IMAGES
      ? ALLWAIN_BUNDLED_CARD_IMAGES[key]
      : null;
  } catch {
    return null;
  }
}
