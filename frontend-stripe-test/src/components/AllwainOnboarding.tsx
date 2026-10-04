import React from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AllwainParticipation } from "../config/api";
import { colors } from "../theme/colors";
import AllwainRoleTour, { type AllwainIntent, type AllwainRoleTourHandle } from "./AllwainRoleTour";

export const ALLWAIN_ONBOARDING_VERSION = 4;

export default function AllwainOnboarding({
  userId,
  experience,
  onComplete,
}: {
  userId: string;
  experience: AllwainParticipation["experience"];
  onComplete: (intent: AllwainIntent) => void | Promise<void>;
}) {
  const [visible, setVisible] = React.useState(
    experience.onboardingVersion < ALLWAIN_ONBOARDING_VERSION,
  );
  const storageKey = `allwain:onboarding:${ALLWAIN_ONBOARDING_VERSION}:${userId}`;
  const tourRef = React.useRef<AllwainRoleTourHandle>(null);

  React.useEffect(() => {
    setVisible(experience.onboardingVersion < ALLWAIN_ONBOARDING_VERSION);
  }, [experience.onboardingVersion, userId]);

  async function finish(intent: AllwainIntent) {
    await onComplete(intent);
    await AsyncStorage.setItem(storageKey, new Date().toISOString()).catch(
      () => undefined,
    );
    setVisible(false);
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => void tourRef.current?.finish()}>
      <View style={styles.screen}>
        <View style={styles.frame}>
          <AllwainRoleTour ref={tourRef} onFinish={finish} allowEarlyFinish />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? "#E9E9E7" : colors.background,
  },
  frame: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    backgroundColor: colors.background,
  },
});
