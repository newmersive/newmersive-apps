import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeft, VideoOff } from "lucide-react-native";

import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";

type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;

export default function VideoCallScreen({ navigation }: Props) {
  const { t } = useAppTranslation();
  return (
    <View style={styles.screen}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <ArrowLeft size={22} color={colors.text} />
      </TouchableOpacity>
      <VideoOff size={34} color={colors.primary} />
      <Text style={styles.title}>{t("video.unsupportedTitle")}</Text>
      <Text style={styles.body}>
        {t("video.unsupportedBody")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 22,
    backgroundColor: colors.background,
  },
  backButton: {
    position: "absolute",
    top: 18,
    left: 14,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", textAlign: "center" },
  body: { color: colors.mutedText, fontSize: 14, lineHeight: 20, fontWeight: "600", textAlign: "center" },
});
