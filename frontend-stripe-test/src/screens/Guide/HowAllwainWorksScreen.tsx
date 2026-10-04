import React from "react";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import AllwainRoleTour, { type AllwainIntent } from "../../components/AllwainRoleTour";
import type { RootStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "HowAllwainWorks">;

export default function HowAllwainWorksScreen({ navigation, route }: Props) {
  const setAppMode = useAuthStore((state) => state.setAppMode);

  function closeTour() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  }

  async function finish(intent: AllwainIntent) {
    await setAppMode(intent);
    closeTour();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.frame}>
        <AllwainRoleTour
          initialPage={route.params?.initialPage}
          onFinish={finish}
          onClose={closeTour}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", backgroundColor: "#E9E9E7" },
  frame: { flex: 1, width: "100%", maxWidth: 760, backgroundColor: colors.background },
});
