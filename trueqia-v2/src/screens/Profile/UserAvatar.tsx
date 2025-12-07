import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../../config/theme";

interface Props {
  name?: string;
  email?: string;
  avatarUrl?: string;
  size?: number;
}

function getInitials(name?: string, email?: string) {
  const base = name || email || "TQ";
  const parts = base.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function UserAvatar({ name, email, avatarUrl, size = 64 }: Props) {
  const initials = getInitials(name, email);

  return (
    <View style={[styles.wrapper, { width: size, height: size, borderRadius: size / 2 }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={styles.initials}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    backgroundColor: "#F4F6FC",
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    resizeMode: "cover",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EDFA",
  },
  initials: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 18,
  },
});

