import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import RootNavigator from "./src/navigation/RootNavigator";
import { colors } from "./src/theme/colors";

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.salmon,
    card: colors.salmon,
    text: colors.dark,
    border: colors.line,
  },
};

export default function App() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <RootNavigator />
    </NavigationContainer>
  );
}
