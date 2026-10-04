import React from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../theme/colors";

const BRAND_LOGO = require("../assets/logos/Logotipo_Allwain_02.png");
const CORAL_MARK = require("../assets/logos/Imagotipo_Allwain_02.png");
const DARK_MARK = require("../assets/logos/Imagotipo_Allwain_01.png");
const USE_NATIVE_DRIVER = Platform.OS !== "web";

type BrandSplashProps = {
  status?: string;
};

export default function BrandSplash({
  status = "Preparando tu espacio",
}: BrandSplashProps) {
  const insets = useSafeAreaInsets();
  const reveal = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let mounted = true;
    let pulseAnimation: Animated.CompositeAnimation | null = null;

    const startAnimations = (reduceMotion: boolean) => {
      if (!mounted) return;

      if (reduceMotion) {
        reveal.setValue(1);
        pulse.setValue(0.65);
        return;
      }

      Animated.timing(reveal, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();

      pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 760,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 760,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]),
      );
      pulseAnimation.start();
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then(startAnimations)
      .catch(() => startAnimations(false));

    return () => {
      mounted = false;
      reveal.stopAnimation();
      pulseAnimation?.stop();
    };
  }, [pulse, reveal]);

  const brandOpacity = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });
  const brandTranslateY = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [7, 0],
  });
  const progressOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });
  const progressScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 1],
  });

  return (
    <View style={styles.container} testID="allwain-brand-splash">
      <Image
        source={CORAL_MARK}
        style={[styles.backgroundMark, styles.backgroundMarkTop]}
        resizeMode="contain"
        accessible={false}
      />
      <Image
        source={DARK_MARK}
        style={[styles.backgroundMark, styles.backgroundMarkBottom]}
        resizeMode="contain"
        accessible={false}
      />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View
          style={[
            styles.brandStage,
            {
              opacity: brandOpacity,
              transform: [{ translateY: brandTranslateY }],
            },
          ]}
        >
          <Image
            source={BRAND_LOGO}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Allwain"
          />
          <Text style={styles.tagline}>Compra, vende y conecta.</Text>
          <Text style={styles.subline}>Todo en una sola cuenta.</Text>

          <View style={styles.roles} accessibilityLabel="Comprar, vender y conectar">
            <View style={styles.roleTrack} />
            <RoleNode label="Comprar" style={styles.buyerNode} />
            <RoleNode label="Vender" style={styles.sellerNode} />
            <RoleNode label="Conectar" style={styles.connectorNode} />
          </View>
        </Animated.View>

        <View
          style={[styles.statusArea, { bottom: 26 + insets.bottom }]}
          accessibilityRole="progressbar"
          accessibilityLabel={status}
        >
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  opacity: progressOpacity,
                  transform: [{ scaleX: progressScale }],
                },
              ]}
            />
          </View>
          <Text style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function RoleNode({
  label,
  style,
}: {
  label: string;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.roleItem}>
      <View style={[styles.roleNode, style]} />
      <Text style={styles.roleLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  backgroundMark: {
    position: "absolute",
  },
  backgroundMarkTop: {
    width: 330,
    height: 270,
    top: -94,
    right: -118,
    opacity: 0.1,
  },
  backgroundMarkBottom: {
    width: 285,
    height: 234,
    bottom: -112,
    left: -112,
    opacity: 0.045,
  },
  brandStage: {
    flex: 1,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 26,
  },
  logo: {
    width: 232,
    height: 52,
  },
  tagline: {
    marginTop: 26,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.25,
  },
  subline: {
    marginTop: 4,
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  roles: {
    width: 250,
    marginTop: 34,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  roleTrack: {
    position: "absolute",
    top: 6,
    left: 34,
    right: 34,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#DDD5D1",
  },
  roleItem: {
    width: 64,
    alignItems: "center",
  },
  roleNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  buyerNode: {
    borderColor: colors.text,
    backgroundColor: colors.card,
  },
  sellerNode: {
    borderColor: colors.seller,
    backgroundColor: colors.seller,
  },
  connectorNode: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  roleLabel: {
    marginTop: 8,
    color: colors.mutedText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  statusArea: {
    position: "absolute",
    right: 24,
    bottom: 26,
    left: 24,
    alignItems: "center",
  },
  progressTrack: {
    width: 96,
    height: 3,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "#E6DDD9",
  },
  progressBar: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  status: {
    marginTop: 10,
    color: colors.mutedText,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 0.25,
    textAlign: "center",
  },
});
