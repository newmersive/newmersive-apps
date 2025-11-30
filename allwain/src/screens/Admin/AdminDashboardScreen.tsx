import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { apiAuthGet } from "../../config/api";
import { colors } from "../../theme/colors";

export default function AdminDashboardScreen() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [d, u, e] = await Promise.all([
        apiAuthGet("/admin/dashboard"),
        apiAuthGet("/admin/users"),
        apiAuthGet("/admin/ai/activity"),
      ]);
      setDashboard(d);
      setUsers(u.users || []);
      setEvents(e.events || []);
    } catch (err) {
      console.log("ADMIN LOAD ERROR:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Panel Admin (Allwain)</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={loadAll} activeOpacity={0.9}>
        <Text style={styles.primaryButtonText}>Recargar datos</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} color={colors.dark} />}

      {dashboard && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dashboard</Text>
          <Text style={styles.sectionText}>Admin: {dashboard.admin}</Text>
        </View>
      )}

      {users.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Usuarios</Text>
          {users.map((u) => (
            <Text key={u.id} style={styles.sectionText}>
              • {u.email} ({u.role})
            </Text>
          ))}
        </View>
      )}

      {events.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eventos IA</Text>
          {events.map((ev) => (
            <Text key={ev.id} style={styles.sectionText}>
              • [{ev.severity}] {ev.userEmail}: {ev.reason}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.salmon },
  content: { padding: 24, paddingBottom: 32 },
  title: { fontSize: 24, color: colors.dark, fontWeight: "800", marginBottom: 12 },
  primaryButton: {
    backgroundColor: colors.dark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "800" },
  loader: { marginTop: 12 },
  section: {
    marginTop: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionTitle: { fontWeight: "800", color: colors.dark, marginBottom: 6 },
  sectionText: { color: colors.dark, fontWeight: "600", opacity: 0.9 },
});
