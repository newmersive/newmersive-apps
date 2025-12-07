import React, { useEffect, useState } from "react";
import { View, Text, Button, ActivityIndicator, ScrollView } from "react-native";
import { apiAuthGet } from "../../config/api";

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
    <ScrollView style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 24 }}>Panel Admin (Allwain)</Text>

      <View style={{ height: 12 }} />
      <Button title="Recargar datos" onPress={loadAll} />

      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}

      {dashboard && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: "600" }}>Dashboard:</Text>
          <Text>Admin: {dashboard.admin}</Text>
        </View>
      )}

      {users.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: "600" }}>Usuarios:</Text>
          {users.map((u) => (
            <Text key={u.id}>
              - {u.email} ({u.role})
            </Text>
          ))}
        </View>
      )}

      {events.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: "600" }}>Eventos IA:</Text>
          {events.map((ev) => (
            <Text key={ev.id}>
              - [{ev.severity}] {ev.userEmail}: {ev.reason}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
