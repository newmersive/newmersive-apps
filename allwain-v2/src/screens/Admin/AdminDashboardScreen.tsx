import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Panel Admin (Allwain)</Text>

      <View style={{ height: 12 }} />
      <Button title="Recargar datos" onPress={loadAll} />

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}

      {dashboard && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Dashboard:</Text>
          <Text style={styles.text}>Admin: {dashboard.admin}</Text>
        </View>
      )}

      {users.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Usuarios:</Text>
          {users.map((u) => (
            <Text key={u.id} style={styles.text}>
              - {u.email} ({u.role})
            </Text>
          ))}
        </View>
      )}

      {events.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Eventos IA:</Text>
          {events.map((ev) => (
            <Text key={ev.id} style={styles.text}>
              - [{ev.severity}] {ev.userEmail}: {ev.reason}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.background },
  title: { fontSize: 24, color: colors.text, fontWeight: "700" },
  block: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  blockTitle: { fontWeight: "700", color: colors.text, marginBottom: 6 },
  text: { color: colors.mutedText, fontWeight: "600" },
});
