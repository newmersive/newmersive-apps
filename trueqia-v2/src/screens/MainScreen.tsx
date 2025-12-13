import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import HomeScreen from "./HomeScreen";
import SponsorScreen from "./SponsorScreen";
import { useAuthStore } from "../store/auth.store";

type Tab = "home" | "sponsor";

export default function MainScreen({ navigation }: any) {
  const [tab, setTab] = useState<Tab>("home");
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const handleLogout = async () => {
    await logout("Has cerrado sesión");
  };

  const goCreateOffer = () => {
    navigation?.navigate?.("CreateOffer");
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Bienvenido a TrueQIA</Text>
        <Text style={styles.subtitle}>
          Sesión iniciada como: {user?.name ?? user?.email ?? "pionero"}
        </Text>

        <View style={styles.headerButtonsRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={goCreateOffer}>
            <Text style={styles.primaryButtonText}>+ CREAR OFERTA</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout}>
            <Text style={styles.secondaryButtonText}>CERRAR SESIÓN</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, tab === "home" && styles.tabButtonActive]}
          onPress={() => setTab("home")}
        >
          <Text style={[styles.tabText, tab === "home" && styles.tabTextActive]}>Inicio</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, tab === "sponsor" && styles.tabButtonActive]}
          onPress={() => setTab("sponsor")}
        >
          <Text style={[styles.tabText, tab === "sponsor" && styles.tabTextActive]}>Sponsors</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {tab === "home" ? (
          <HomeScreen />
        ) : (
          <ScrollView>
            <SponsorScreen />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
    opacity: 0.8,
  },
  headerButtonsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111111",
    fontWeight: "600",
    fontSize: 13,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#007AFF11",
    borderColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#007AFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
});
