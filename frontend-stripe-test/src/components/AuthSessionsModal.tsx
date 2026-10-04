import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LogOut, ShieldCheck, X } from "lucide-react-native";
import { apiAuthDelete, apiAuthGet, apiAuthPost } from "../config/api";
import { colors } from "../theme/colors";

type AuthSession = {
  id: string;
  sourceApp: "allwain" | "trueqia" | "admin" | "course";
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSignedOut: () => Promise<void> | void;
};

const APP_LABELS: Record<AuthSession["sourceApp"], string> = {
  allwain: "Allwain",
  trueqia: "TrueQIA",
  admin: "Administración",
  course: "Newmersive Robot Lab",
};

function readableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AuthSessionsModal({ visible, onClose, onSignedOut }: Props) {
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAuthGet<{ items: AuthSession[] }>("/auth/sessions");
      setSessions(response.items || []);
    } catch (cause: any) {
      setError(cause?.message || "No se pudieron consultar tus sesiones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
    else {
      setConfirmId(null);
      setError(null);
    }
  }, [load, visible]);

  async function revoke(session: AuthSession) {
    setBusyId(session.id);
    setError(null);
    try {
      const result = await apiAuthDelete<{ ok: true; currentRevoked: boolean }>(
        `/auth/sessions/${encodeURIComponent(session.id)}`,
      );
      if (result.currentRevoked) {
        await onSignedOut();
        return;
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setConfirmId(null);
    } catch (cause: any) {
      setError(cause?.message || "No se pudo cerrar esa sesión.");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAll() {
    setBusyId("all");
    setError(null);
    try {
      await apiAuthPost<{ ok: true }>("/auth/logout-all", {});
      await onSignedOut();
    } catch (cause: any) {
      setError(cause?.message || "No se pudieron cerrar todas las sesiones.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Dispositivos con sesión</Text>
            <Text style={styles.subtitle}>Cierra cualquier acceso que no reconozcas.</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Cerrar"
            style={styles.iconButton}
            onPress={onClose}
            disabled={busyId !== null}
          >
            <X size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.securityNote}>
            <ShieldCheck size={22} color={colors.success} />
            <Text style={styles.securityText}>
              Las sesiones caducan automáticamente. Aquí puedes cerrarlas antes.
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Comprobando sesiones...</Text>
            </View>
          ) : null}

          {!loading && sessions.length === 0 && !error ? (
            <Text style={styles.muted}>No hay otras sesiones activas.</Text>
          ) : null}

          {sessions.map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <View style={styles.sessionCopy}>
                  <Text style={styles.sessionTitle}>{APP_LABELS[session.sourceApp]}</Text>
                  <Text style={styles.muted}>Último uso: {readableDate(session.lastUsedAt)}</Text>
                  <Text style={styles.detail}>Iniciada: {readableDate(session.createdAt)}</Text>
                </View>
                {session.current ? (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeText}>Esta sesión</Text>
                  </View>
                ) : null}
              </View>

              {confirmId === session.id ? (
                <View style={styles.confirmPanel}>
                  <Text style={styles.confirmText}>
                    {session.current
                      ? "Saldrás de Allwain en este dispositivo."
                      : "Este dispositivo tendrá que identificarse de nuevo."}
                  </Text>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => setConfirmId(null)}
                      disabled={busyId !== null}
                    >
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dangerButton}
                      onPress={() => void revoke(session)}
                      disabled={busyId !== null}
                    >
                      {busyId === session.id ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.dangerButtonText}>Cerrar sesión</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.sessionAction}
                  onPress={() => setConfirmId(session.id)}
                  disabled={busyId !== null}
                >
                  <LogOut size={17} color={colors.danger} />
                  <Text style={styles.sessionActionText}>Cerrar esta sesión</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {confirmId === "all" ? (
            <View style={styles.confirmPanelAll}>
              <Text style={styles.confirmTitle}>Cerrar todas las sesiones</Text>
              <Text style={styles.confirmText}>
                Tendrás que identificarte de nuevo en todos tus dispositivos.
              </Text>
              <View style={styles.confirmActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setConfirmId(null)}
                  disabled={busyId !== null}
                >
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dangerButton}
                  onPress={() => void revokeAll()}
                  disabled={busyId !== null}
                >
                  {busyId === "all" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.dangerButtonText}>Cerrar todas</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.allButton}
              onPress={() => setConfirmId("all")}
              disabled={loading || busyId !== null || sessions.length === 0}
            >
              <Text style={styles.allButtonText}>Cerrar sesión en todos los dispositivos</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  headerCopy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 14, lineHeight: 20 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
  },
  content: { padding: 20, paddingBottom: 40, gap: 12, width: "100%", maxWidth: 760, alignSelf: "center" },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "#EDF6EF",
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  securityText: { flex: 1, color: colors.text, fontWeight: "700", lineHeight: 20 },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  muted: { color: colors.mutedText, lineHeight: 20 },
  detail: { color: colors.mutedText, fontSize: 12, lineHeight: 18 },
  sessionCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, padding: 15, gap: 13, borderRadius: 8 },
  sessionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sessionCopy: { flex: 1, gap: 3 },
  sessionTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  currentBadge: { backgroundColor: colors.highlight, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  currentBadgeText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  sessionAction: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 11 },
  sessionActionText: { color: colors.danger, fontWeight: "900" },
  confirmPanel: { gap: 10, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 12 },
  confirmPanelAll: { gap: 12, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, borderRadius: 8 },
  confirmTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  confirmText: { color: colors.mutedText, lineHeight: 20 },
  confirmActions: { flexDirection: "row", gap: 10 },
  cancelButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8 },
  cancelText: { color: colors.text, fontWeight: "900" },
  dangerButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger, borderRadius: 8 },
  dangerButtonText: { color: "#FFFFFF", fontWeight: "900" },
  allButton: { minHeight: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.danger, borderRadius: 8, paddingHorizontal: 12 },
  allButtonText: { color: colors.danger, fontWeight: "900", textAlign: "center" },
  error: { color: colors.danger, fontWeight: "800", lineHeight: 20 },
});
