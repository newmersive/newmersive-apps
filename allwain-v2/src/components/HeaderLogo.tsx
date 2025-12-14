import React from "react";
import { Image, StyleSheet, View } from "react-native";

export default function HeaderLogo({ source }: { source: any }) {
  return (
    <View style={styles.container}>
      <Image source={source} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 32,
    width: 140,
  },
});
