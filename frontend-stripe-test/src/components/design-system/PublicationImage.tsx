import React, { useEffect, useState } from "react";
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ImageIcon } from "lucide-react-native";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import { API_BASE_URL } from "../../config/api";
import {
  bundledAllwainCardImageSource,
  inferredAllwainCardImageSource,
} from "../../data/cardImages";
import { resolvePublicationImageSource } from "../../utils/publicationImageSource";
import { radii } from "./foundations";

type PublicationImageProps = {
  imageUrl?: string | null;
  source?: ImageSourcePropType | null;
  imageAlt?: string | null;
  illustrative?: boolean;
  variant?: "thumbnail" | "hero";
};

export function PublicationImage({
  imageUrl,
  source,
  imageAlt,
  illustrative = false,
  variant = "thumbnail",
}: PublicationImageProps) {
  const { t } = useAppTranslation();
  const token = useAuthStore((state) => state.token);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [imageUrl, source]);

  const bundledSource = bundledAllwainCardImageSource({
    apiBaseUrl: API_BASE_URL,
    imageUrl,
    source,
  });
  const illustrativeSource = bundledSource || (!imageUrl && !source ? inferredAllwainCardImageSource(imageAlt) : null);
  const resolvedSource = resolvePublicationImageSource({
    apiBaseUrl: API_BASE_URL,
    imageUrl: illustrativeSource ? null : imageUrl,
    source: illustrativeSource || source,
    token,
  });

  const label = illustrative
    ? variant === "hero"
      ? t("card.illustrativeImage")
      : t("card.illustrativeShort")
    : null;

  return (
    <View style={[styles.frame, variant === "hero" ? styles.hero : styles.thumbnail]}>
      {resolvedSource && !failed ? (
        <Image
          accessibilityLabel={imageAlt || undefined}
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={resolvedSource}
          style={styles.image}
        />
      ) : (
        <View style={styles.fallback}>
          <ImageIcon size={variant === "hero" ? 34 : 22} color={colors.mutedText} />
        </View>
      )}
      {label ? (
        <View style={styles.labelFrame}>
          <Text numberOfLines={1} style={styles.label}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: radii.control,
    backgroundColor: "#ECECE8",
  },
  thumbnail: { width: "100%", height: "100%" },
  hero: { width: "100%", aspectRatio: 16 / 9 },
  image: { width: "100%", height: "100%" },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  labelFrame: {
    position: "absolute",
    left: 4,
    bottom: 4,
    maxWidth: "92%",
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  label: { color: colors.text, fontSize: 8, lineHeight: 10, fontWeight: "800" },
});
