import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppAlert as Alert } from "../../utils/appAlert";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Inbox,
  MailCheck,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  X,
} from "lucide-react-native";

import { apiAuthGet, apiAuthPatch, apiAuthPost } from "../../config/api";
import { colors } from "../../theme/colors";
import { EmptyState } from "../../components/design-system";

type SupportOverview = {
  readiness: {
    mailbox: string;
    inboxEnabled: boolean;
    inboxConfigured: boolean;
    automationMode: "disabled" | "assist" | "safe_auto";
    externalAiEnabled: boolean;
    email: {
      mode: "disabled" | "test" | "live";
      smtpConfigured: boolean;
      ready: boolean;
    };
  };
  control: { automationPaused: boolean; updatedAt?: string | null };
  tickets: Record<string, number>;
  deliveries: Record<string, number>;
  latestSync?: {
    status: string;
    imported: number;
    completedAt: string;
    error?: string | null;
  } | null;
  recentFailures: {
    id: string;
    email: string;
    subject: string;
    attempts: number;
    error?: string | null;
    createdAt: string;
  }[];
};

type SupportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  bodyText: string;
  status: string;
  aiGenerated: boolean;
  createdAt: string;
};

type SupportTicket = {
  id: string;
  requesterEmail: string;
  requesterName?: string | null;
  subject: string;
  category: string;
  priority: string;
  riskLevel: string;
  status: string;
  aiSummary?: string | null;
  automationDisposition: string;
  lastMessageAt: string;
  messages?: SupportMessage[];
  _count?: { messages: number };
};

function shortDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function count(values: Record<string, number> | undefined, keys: string[]) {
  return keys.reduce((total, key) => total + Number(values?.[key] || 0), 0);
}

function label(value: string) {
  const labels: Record<string, string> = {
    open: "Nuevo",
    in_review: "En revisión",
    waiting_user: "Esperando respuesta",
    resolved: "Resuelto",
    closed: "Cerrado",
    urgent: "Urgente",
    high: "Alta",
    normal: "Normal",
    low: "Baja",
    payment: "Pagos",
    account: "Cuenta",
    security: "Seguridad",
    legal: "Legal y privacidad",
    connector: "Conector",
    seller: "Vendedor",
    buyer: "Comprador",
    notifications: "Avisos",
    other: "Otro",
  };
  return labels[value] || value.replace(/_/g, " ");
}

export function SupportPanel() {
  const [overview, setOverview] = useState<SupportOverview | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [reply, setReply] = useState("");
  const [resolveAfterReply, setResolveAfterReply] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<{
    smtp: { ok: boolean };
    imap: { ok: boolean };
  } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextTickets] = await Promise.all([
        apiAuthGet<SupportOverview>("/admin/allwain/support"),
        apiAuthGet<{ items: SupportTicket[] }>(
          "/admin/allwain/support/tickets?limit=100",
        ),
      ]);
      setOverview(nextOverview);
      setTickets(nextTickets.items || []);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo actualizar el soporte.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const visibleTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (
        status === "active" &&
        !["open", "in_review", "waiting_user"].includes(ticket.status)
      ) {
        return false;
      }
      if (status !== "active" && status !== "all" && ticket.status !== status) {
        return false;
      }
      if (!normalized) return true;
      return `${ticket.subject} ${ticket.requesterEmail} ${ticket.requesterName || ""} ${ticket.aiSummary || ""}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [query, status, tickets]);

  async function openTicket(ticketId: string) {
    setBusy(`ticket:${ticketId}`);
    setError(null);
    try {
      const detail = await apiAuthGet<SupportTicket>(
        `/admin/allwain/support/tickets/${ticketId}`,
      );
      setSelected(detail);
      setReply("");
      setResolveAfterReply(false);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo abrir el caso.");
    } finally {
      setBusy(null);
    }
  }

  async function runSync() {
    setBusy("sync");
    setError(null);
    try {
      await apiAuthPost("/admin/allwain/support/sync", { limit: 50 }, 45_000);
      await load(true);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo sincronizar el buzón.");
    } finally {
      setBusy(null);
    }
  }

  async function verifyConnections() {
    setBusy("verify");
    setError(null);
    try {
      const result = await apiAuthPost<{
        smtp: { ok: boolean };
        imap: { ok: boolean };
      }>("/admin/allwain/support/verify", {}, 30_000);
      setConnection(result);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo comprobar el correo.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleAutomation() {
    if (!overview) return;
    const paused = !overview.control.automationPaused;
    setBusy("automation");
    setError(null);
    try {
      await apiAuthPatch("/admin/allwain/support/control", { paused });
      await load(true);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo cambiar la automatización.");
    } finally {
      setBusy(null);
    }
  }

  async function sendReply() {
    if (!selected || reply.trim().length < 3) return;
    setBusy("reply");
    setError(null);
    try {
      await apiAuthPost(
        `/admin/allwain/support/tickets/${selected.id}/reply`,
        { body: reply.trim(), resolve: resolveAfterReply },
        30_000,
      );
      await load(true);
      await openTicket(selected.id);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo enviar la respuesta.");
    } finally {
      setBusy(null);
    }
  }

  async function takeTicket() {
    if (!selected) return;
    setBusy("take");
    setError(null);
    try {
      await apiAuthPatch(`/admin/allwain/support/tickets/${selected.id}`, {
        status: "in_review",
        assignToMe: true,
      });
      await load(true);
      await openTicket(selected.id);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo asignar el caso.");
    } finally {
      setBusy(null);
    }
  }

  async function retryDelivery(id: string) {
    setBusy(`retry:${id}`);
    setError(null);
    try {
      await apiAuthPost(`/admin/allwain/email-deliveries/${id}/retry`, {});
      await load(true);
    } catch (nextError: any) {
      setError(nextError?.message || "No se pudo reintentar el envío.");
    } finally {
      setBusy(null);
    }
  }

  const activeTickets = count(overview?.tickets, [
    "open",
    "in_review",
    "waiting_user",
  ]);
  const failedEmails = Number(overview?.deliveries.failed || 0);
  const mailReady = Boolean(overview?.readiness.email.ready);
  const inboxReady = Boolean(overview?.readiness.inboxConfigured);

  if (selected) {
    return (
      <View style={styles.panel}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setSelected(null)}
            accessibilityLabel="Cerrar caso"
          >
            <X size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.copy}>
            <Text style={styles.title}>{selected.subject}</Text>
            <Text style={styles.meta}>
              {selected.requesterName || "Usuario"} · {selected.requesterEmail}
            </Text>
          </View>
        </View>

        <View style={styles.chips}>
          <Text style={styles.chip}>{label(selected.status)}</Text>
          <Text style={styles.chip}>{label(selected.priority)}</Text>
          <Text style={selected.riskLevel === "high" ? styles.riskChip : styles.chip}>
            {selected.riskLevel === "high" ? "Revisión humana" : label(selected.category)}
          </Text>
        </View>

        {(selected.messages || []).map((message) => (
          <View
            key={message.id}
            style={[
              styles.message,
              message.direction === "outbound" && styles.messageOutbound,
            ]}
          >
            <Text style={styles.messageWho}>
              {message.direction === "outbound"
                ? message.aiGenerated
                  ? "Asistente de soporte"
                  : "Equipo Allwain"
                : selected.requesterName || selected.requesterEmail}
            </Text>
            <Text style={styles.messageText}>{message.bodyText}</Text>
            <Text style={styles.meta}>{shortDate(message.createdAt)}</Text>
          </View>
        ))}

        {selected.status === "open" ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => void takeTicket()}
            disabled={busy === "take"}
          >
            <ShieldAlert size={18} color={colors.text} />
            <Text style={styles.secondaryButtonText}>Asignarme y revisar</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionTitle}>Responder</Text>
        <TextInput
          value={reply}
          onChangeText={setReply}
          multiline
          maxLength={12_000}
          placeholder="Escribe una respuesta clara y verificable"
          placeholderTextColor={colors.mutedText}
          style={styles.replyInput}
        />
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setResolveAfterReply((current) => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: resolveAfterReply }}
        >
          <View style={[styles.checkbox, resolveAfterReply && styles.checkboxChecked]}>
            {resolveAfterReply ? <CheckCircle2 size={16} color="#FFFFFF" /> : null}
          </View>
          <Text style={styles.checkText}>Marcar como resuelto tras responder</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, reply.trim().length < 3 && styles.buttonDisabled]}
          onPress={() => void sendReply()}
          disabled={busy === "reply" || reply.trim().length < 3}
        >
          {busy === "reply" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Send size={18} color="#FFFFFF" />
          )}
          <Text style={styles.primaryButtonText}>Enviar desde soporte@allwain.es</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{activeTickets}</Text>
          <Text style={styles.metricLabel}>Casos activos</Text>
        </View>
        <View style={[styles.metric, failedEmails > 0 && styles.metricDanger]}>
          <Text style={styles.metricValue}>{failedEmails}</Text>
          <Text style={styles.metricLabel}>Emails fallidos</Text>
        </View>
      </View>

      <View style={styles.healthCard}>
        <View style={styles.healthHeader}>
          <MailCheck size={22} color={mailReady && inboxReady ? colors.success : colors.warning} />
          <View style={styles.copy}>
            <Text style={styles.title}>{overview?.readiness.mailbox || "soporte@allwain.es"}</Text>
            <Text style={styles.meta}>
              Salida {mailReady ? "preparada" : "pendiente"} · Entrada {inboxReady ? "preparada" : "pendiente"}
            </Text>
          </View>
        </View>
        <View style={styles.chips}>
          <Text style={styles.chip}>Modo {overview?.readiness.email.mode || "disabled"}</Text>
          <Text style={styles.chip}>
            {overview?.readiness.externalAiEnabled ? "IA privada activa" : "Reglas seguras locales"}
          </Text>
          {connection ? (
            <Text style={connection.smtp.ok && connection.imap.ok ? styles.okChip : styles.riskChip}>
              {connection.smtp.ok && connection.imap.ok ? "Conexión correcta" : "Revisar conexión"}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => void verifyConnections()}
            disabled={busy === "verify"}
          >
            <MailCheck size={17} color={colors.text} />
            <Text style={styles.secondaryButtonText}>Comprobar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => void runSync()}
            disabled={busy === "sync"}
          >
            <RefreshCw size={17} color={colors.text} />
            <Text style={styles.secondaryButtonText}>Recibir ahora</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.automationCard}>
        <Bot size={22} color={colors.primary} />
        <View style={styles.copy}>
          <Text style={styles.title}>Asistente de soporte</Text>
          <Text style={styles.meta}>
            Solo responde automáticamente dudas públicas de bajo riesgo. Pagos, identidad, seguridad, privacidad y asuntos legales esperan revisión humana.
          </Text>
        </View>
        <TouchableOpacity
          style={overview?.control.automationPaused ? styles.playButton : styles.pauseButton}
          onPress={() =>
            Alert.alert(
              overview?.control.automationPaused ? "Activar respuestas seguras" : "Pausar automatización",
              overview?.control.automationPaused
                ? "Solo se responderán consultas de ayuda clasificadas como seguras. Todo quedará auditado."
                : "Los nuevos casos seguirán entrando, pero ninguna respuesta saldrá automáticamente.",
              [
                { text: "Volver", style: "cancel" },
                { text: "Confirmar", onPress: () => void toggleAutomation() },
              ],
            )
          }
          disabled={busy === "automation"}
        >
          {overview?.control.automationPaused ? (
            <PlayCircle size={18} color="#FFFFFF" />
          ) : (
            <PauseCircle size={18} color="#FFFFFF" />
          )}
          <Text style={styles.primaryButtonText}>
            {overview?.control.automationPaused ? "Activar" : "Pausar"}
          </Text>
        </TouchableOpacity>
      </View>

      {overview?.latestSync ? (
        <Text style={styles.meta}>
          Última recepción: {shortDate(overview.latestSync.completedAt)} · {overview.latestSync.imported} nuevo(s)
        </Text>
      ) : null}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar asunto, nombre o email"
        placeholderTextColor={colors.mutedText}
        autoCapitalize="none"
        style={styles.searchInput}
      />
      <View style={styles.filters}>
        {[
          ["active", "Pendientes"],
          ["resolved", "Resueltos"],
          ["all", "Todos"],
        ].map(([value, text]) => (
          <TouchableOpacity
            key={value}
            style={[styles.filter, status === value && styles.filterActive]}
            onPress={() => setStatus(value)}
          >
            <Text style={[styles.filterText, status === value && styles.filterTextActive]}>
              {text}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {!loading && visibleTickets.length === 0 ? (
        <EmptyState
          title="No hay casos en esta vista"
          body="Los correos nuevos aparecerán aquí y conservarán todo su historial."
          demo={{
            title: "Ayuda con mi pedido",
            meta: "Nuevo · Revisión humana",
            detail: "Una situación, su historial y la siguiente acción.",
            leading: <Inbox size={20} color={colors.primary} />,
          }}
        />
      ) : null}
      {visibleTickets.map((ticket) => (
        <TouchableOpacity
          key={ticket.id}
          style={styles.ticketCard}
          onPress={() => void openTicket(ticket.id)}
          disabled={busy === `ticket:${ticket.id}`}
        >
          <View style={styles.copy}>
            <Text style={styles.title}>{ticket.subject}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {ticket.requesterName || ticket.requesterEmail} · {shortDate(ticket.lastMessageAt)}
            </Text>
            <Text style={styles.summary} numberOfLines={2}>
              {ticket.aiSummary || ticket.messages?.[0]?.bodyText || "Consulta recibida"}
            </Text>
            <View style={styles.chips}>
              <Text style={styles.chip}>{label(ticket.status)}</Text>
              <Text style={ticket.riskLevel === "high" ? styles.riskChip : styles.chip}>
                {ticket.riskLevel === "high" ? "Revisión humana" : label(ticket.category)}
              </Text>
              <Text style={styles.chip}>{ticket._count?.messages || 0} mensaje(s)</Text>
            </View>
          </View>
          {busy === `ticket:${ticket.id}` ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <ChevronRight size={22} color={colors.mutedText} />
          )}
        </TouchableOpacity>
      ))}

      {overview?.recentFailures?.length ? (
        <>
          <Text style={styles.sectionTitle}>Envíos que necesitan atención</Text>
          {overview.recentFailures.map((delivery) => (
            <View key={delivery.id} style={styles.failureCard}>
              <ShieldAlert size={20} color={colors.danger} />
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>{delivery.subject}</Text>
                <Text style={styles.meta} numberOfLines={1}>{delivery.email}</Text>
              </View>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => void retryDelivery(delivery.id)}
                disabled={busy === `retry:${delivery.id}`}
                accessibilityLabel="Reintentar envío"
              >
                <RotateCcw size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    minHeight: 78,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    justifyContent: "center",
    padding: 13,
    gap: 3,
  },
  metricDanger: { borderColor: "#D9A29A", backgroundColor: "#FFF0EE" },
  metricValue: { color: colors.text, fontSize: 22, fontWeight: "900" },
  metricLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  healthCard: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 13,
    gap: 10,
  },
  healthHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  automationCard: {
    borderWidth: 1,
    borderColor: "#F2B7A8",
    borderRadius: 8,
    backgroundColor: "#FFF5F2",
    padding: 13,
    gap: 10,
    alignItems: "flex-start",
  },
  ticketCard: {
    minHeight: 106,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  failureCard: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: "#D9A29A",
    borderRadius: 8,
    backgroundColor: "#FFF0EE",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: colors.text, fontWeight: "900", fontSize: 15, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 6 },
  meta: { color: colors.mutedText, fontWeight: "600", fontSize: 12, lineHeight: 17 },
  summary: { color: colors.text, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "800",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  okChip: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "#EEF8F3",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  riskChip: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "900",
    backgroundColor: "#FFF0EE",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "900" },
  playButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pauseButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.danger,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "900" },
  buttonDisabled: { opacity: 0.45 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 13,
    fontWeight: "700",
  },
  filters: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  filter: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center" },
  filterActive: { backgroundColor: colors.text },
  filterText: { color: colors.text, fontWeight: "800", fontSize: 12 },
  filterTextActive: { color: "#FFFFFF" },
  message: {
    width: "92%",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 12,
    gap: 7,
  },
  messageOutbound: { alignSelf: "flex-end", borderColor: "#F2B7A8", backgroundColor: "#FFF5F2" },
  messageWho: { color: colors.primary, fontWeight: "900", fontSize: 12 },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  replyInput: {
    minHeight: 130,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    color: colors.text,
    padding: 13,
    textAlignVertical: "top",
    fontSize: 14,
    lineHeight: 20,
  },
  checkRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkText: { color: colors.text, fontWeight: "700", flex: 1 },
  error: {
    color: colors.danger,
    backgroundColor: "#FFF0EE",
    borderColor: "#F3C6BF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontWeight: "800",
  },
});
