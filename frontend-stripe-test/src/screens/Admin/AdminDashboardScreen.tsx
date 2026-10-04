import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppAlert as Alert } from "../../utils/appAlert";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  Inbox,
  RefreshCw,
  Repeat2,
  ShieldAlert,
  ShoppingBag,
  Users,
} from "lucide-react-native";
import {
  AllwainRecurringPlan,
  apiAuthGet,
  apiAuthPatch,
  apiAuthPost,
} from "../../config/api";
import { colors } from "../../theme/colors";
import { formatMinorCurrency } from "../../utils/format";
import { EmptyState } from "../../components/design-system";
import type { RootStackParamList } from "../../navigation/types";
import { useAuthStore } from "../../store/auth.store";
import { SupportPanel } from "./SupportPanel";
import { DisputeAccountingPanel } from "./DisputeAccountingPanel";

type AdminTab = "now" | "orders" | "payments" | "users" | "support";
type AdminDashboardResponse = {
  admin: boolean;
  totals: {
    users: number;
    offers: number;
    contracts: number;
    allwainScanRequests: number;
  };
};
type AdminUser = {
  id: string;
  name?: string;
  email: string;
  role: string;
  createdAt?: string;
};
type PaymentOrder = {
  id: string;
  buyerUserId: string;
  buyerName: string;
  sellerUserId: string;
  sellerName: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  settlementStatus: string;
  taxStatus: string;
  documentStatus: string;
  traceabilityStatus: string;
  totalAmount: number;
  sellerAmount: number;
  platformFeeAmount: number;
  connectorFeeAmount: number;
  connectorUserId?: string | null;
  connectorName?: string | null;
  currency: string;
  createdAt: string;
};
type SellerAccount = {
  userId: string;
  name: string;
  email?: string | null;
  status: string;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
};
type ReconciliationRun = {
  id: string;
  status: string;
  startedAt: string;
};
type AdminPaymentOverview = {
  financialSummary?: {
    asOf: string;
    byCurrency: Array<{
      currency: string;
      grossAmount: number;
      refundedAmount: number;
      sellerTransferNetAmount: number | null;
      connectorTransferNetAmount: number | null;
      pendingRefundCount: number;
      uncertainTransferCount: number;
      warnings: string[];
    }>;
  };
  sellers: {
    total: number;
    enabled: number;
    requiresInformation: number;
    pending: number;
    items: SellerAccount[];
  };
  orders: {
    total: number;
    archived?: number;
    byStatus: Record<string, number>;
    paidPayments: number;
    grossAmount: number;
    platformFeeAmount: number;
    sellerAmount: number;
    connectorFeeAmount: number;
    refundedAmount: number;
    currency: string;
    items: PaymentOrder[];
  };
  disputes: {
    byStatus: Record<string, number>;
    items: {
      id: string;
      orderId: string;
      status: string;
      amount: number;
      currency: string;
      reason?: string | null;
      updatedAt: string;
    }[];
  };
  payouts: {
    byStatus: Record<string, number>;
    items: {
      id: string;
      status: string;
      amount: number;
      currency: string;
      failureCode?: string | null;
      updatedAt: string;
    }[];
  };
  reconciliation: { items: ReconciliationRun[] };
};
type AdminIncident = {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  createdAt: string;
};
type ReportedReview = {
  id: string;
  rating: number;
  comment?: string | null;
  reportReason?: string | null;
};

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  return (
    <View
      style={[
        styles.metric,
        tone === "warning" && styles.metricWarning,
        tone === "danger" && styles.metricDanger,
        tone === "success" && styles.metricSuccess,
      ]}
    >
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function statusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    open: "Abierta",
    in_review: "En revisión",
    resolved: "Resuelta",
    rejected: "Rechazada",
    paid: "Pagado",
    completed: "Completado",
    pending: "Pendiente",
    active: "Activa",
    paused: "En pausa",
    requires_action: "Requiere acción",
    requires_information: "Faltan datos",
    enabled: "Habilitado",
    succeeded: "Correcto",
    mismatch: "Con diferencias",
    failed: "Fallido",
    user: "Usuario",
    buyer: "Comprador",
    company: "Empresa",
    admin: "Administrador",
  };
  return (
    labels[String(value || "")] ||
    String(value || "Sin estado").replace(/_/g, " ")
  );
}

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

export default function AdminDashboardScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [tab, setTab] = useState<AdminTab>("now");
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [payments, setPayments] = useState<AdminPaymentOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [incidents, setIncidents] = useState<AdminIncident[]>([]);
  const [reviews, setReviews] = useState<ReportedReview[]>([]);
  const [recurringPlans, setRecurringPlans] = useState<AllwainRecurringPlan[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      apiAuthGet<AdminDashboardResponse>("/admin/dashboard"),
      apiAuthGet<AdminPaymentOverview>("/admin/allwain/payments"),
      apiAuthGet<{ users?: AdminUser[] }>("/admin/users"),
      apiAuthGet<{ items?: AdminIncident[] }>(
        "/allwain/compliance/admin/incidents?limit=50",
      ),
      apiAuthGet<{ items?: ReportedReview[] }>(
        "/allwain/reputation/admin/reviews?limit=50",
      ),
      apiAuthGet<{ items?: AllwainRecurringPlan[] }>(
        "/admin/allwain/recurring-plans?limit=100",
      ),
    ]);
    const [
      dashboardResult,
      paymentResult,
      usersResult,
      incidentsResult,
      reviewsResult,
      recurringResult,
    ] = results;
    if (dashboardResult.status === "fulfilled") {
      setDashboard(dashboardResult.value);
    }
    if (paymentResult.status === "fulfilled") setPayments(paymentResult.value);
    if (usersResult.status === "fulfilled") {
      setUsers(usersResult.value.users || []);
    }
    if (incidentsResult.status === "fulfilled") {
      setIncidents(incidentsResult.value.items || []);
    }
    if (reviewsResult.status === "fulfilled") {
      setReviews(reviewsResult.value.items || []);
    }
    if (recurringResult.status === "fulfilled") {
      setRecurringPlans(recurringResult.value.items || []);
    }
    if (results.some((result) => result.status === "rejected")) {
      setError(
        "Parte del panel no pudo actualizarse. Los datos disponibles siguen visibles.",
      );
    }
    setUpdatedAt(new Date());
    if (!silent) setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
      const timer = setInterval(() => void loadAll(true), 15_000);
      return () => clearInterval(timer);
    }, [loadAll]),
  );

  const openIncidents = incidents.filter((item) =>
    ["open", "in_review"].includes(item.status),
  );
  const recurringAttention = recurringPlans.filter(
    (item) => item.status === "requires_action",
  );
  const latestReconciliation = payments?.reconciliation.items[0] || null;
  const reconciliationNeedsAttention = Boolean(
    latestReconciliation &&
      !["matched", "succeeded", "completed"].includes(
        latestReconciliation.status,
      ),
  );
  const attentionTotal =
    openIncidents.length +
    reviews.length +
    recurringAttention.length +
    Number(payments?.sellers.requiresInformation || 0) +
    Number(reconciliationNeedsAttention);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      `${user.name || ""} ${user.email} ${user.role}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, users]);

  function openPrivateMessage(targetUserId: string, targetName: string) {
    if (!targetUserId || targetUserId === currentUserId) return;
    navigation.navigate("ChatThread", {
      targetUserId,
      targetName,
      title: "Mensaje privado",
    });
  }

  async function runReconciliation() {
    setBusy("reconciliation");
    setError(null);
    try {
      await apiAuthPost("/admin/allwain/reconciliation", {});
      await loadAll(true);
    } catch (err: any) {
      setError(err?.message || "No se pudo conciliar Stripe con Allwain.");
    } finally {
      setBusy(null);
    }
  }

  function confirmReconciliation() {
    Alert.alert(
      "Comprobar movimientos",
      "Se compararán pedidos, pagos, transferencias y reembolsos con Stripe. No se moverá dinero.",
      [
        { text: "Volver", style: "cancel" },
        { text: "Comprobar", onPress: () => void runReconciliation() },
      ],
    );
  }

  async function takeIncident(incident: AdminIncident) {
    setBusy(`incident:${incident.id}`);
    setError(null);
    try {
      const updated = await apiAuthPatch<AdminIncident>(
        `/allwain/compliance/admin/incidents/${incident.id}`,
        { status: "in_review" },
      );
      setIncidents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err: any) {
      setError(err?.message || "No se pudo poner la incidencia en revisión.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>ADMINISTRACIÓN ALLWAIN</Text>
          <Text style={styles.title}>Qué necesita atención</Text>
          <Text style={styles.updated}>
            {updatedAt
              ? `Actualizado ${updatedAt.toLocaleTimeString("es-ES")}`
              : "Conectando..."}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          accessibilityLabel="Actualizar panel"
          onPress={() => void loadAll()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <RefreshCw size={22} color={colors.text} />
          )}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.tabs}>
        {(
          [
            ["now", "Ahora", ShieldAlert],
            ["orders", "Pedidos", ShoppingBag],
            ["payments", "Cobros", CreditCard],
            ["users", "Usuarios", Users],
            ["support", "Soporte", Inbox],
          ] as const
        ).map(([value, label, Icon]) => (
          <TouchableOpacity
            key={value}
            style={[styles.tab, tab === value && styles.tabActive]}
            onPress={() => setTab(value)}
            accessibilityState={{ selected: tab === value }}
          >
            <Icon
              size={18}
              color={tab === value ? "#FFFFFF" : colors.text}
            />
            <Text
              style={[styles.tabText, tab === value && styles.tabTextActive]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "now" ? (
        <>
          <View style={styles.metrics}>
            <Metric
              label="Requieren atención"
              value={attentionTotal}
              tone={attentionTotal ? "danger" : "success"}
            />
            <Metric label="Usuarios" value={dashboard?.totals.users || 0} />
            <Metric label="Ofertas" value={dashboard?.totals.offers || 0} />
            <Metric label="Pedidos" value={payments?.orders.total || 0} />
          </View>

          <Text style={styles.sectionTitle}>Prioridad de hoy</Text>
          {attentionTotal === 0 ? (
            <View style={styles.emptyState}>
              <CheckCircle2 size={24} color="#176B4D" />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Todo bajo control</Text>
                <Text style={styles.rowMeta}>No hay alertas abiertas.</Text>
              </View>
            </View>
          ) : null}

          {openIncidents.map((incident) => (
            <View key={incident.id} style={styles.alertCard}>
              <AlertTriangle size={22} color={colors.danger} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{incident.reason}</Text>
                <Text style={styles.rowMeta}>
                  Pedido {incident.orderId.slice(0, 8)} ·{" "}
                  {statusLabel(incident.status)} · {shortDate(incident.createdAt)}
                </Text>
              </View>
              {incident.status === "open" ? (
                <TouchableOpacity
                  style={styles.smallAction}
                  onPress={() => void takeIncident(incident)}
                  disabled={busy === `incident:${incident.id}`}
                >
                  <Text style={styles.smallActionText}>Revisar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {payments?.sellers.requiresInformation ? (
            <View style={styles.alertCard}>
              <CreditCard size={22} color="#9A5A00" />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>
                  Vendedores con cobros incompletos
                </Text>
                <Text style={styles.rowMeta}>
                  {payments.sellers.requiresInformation} cuenta(s) necesitan
                  completar datos en Stripe.
                </Text>
              </View>
            </View>
          ) : null}

          {recurringAttention.map((plan) => (
            <View key={plan.id} style={styles.alertCard}>
              <Repeat2 size={22} color="#9A5A00" />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Cobro recurrente pendiente</Text>
                <Text style={styles.rowMeta}>
                  {plan.quantity} {plan.unit} ·{" "}
                  {formatMinorCurrency(
                    plan.maximumChargeAmount,
                    plan.currency,
                  )}{" "}
                  máximo
                </Text>
              </View>
            </View>
          ))}

          {reviews.map((review) => (
            <View key={review.id} style={styles.alertCard}>
              <ShieldAlert size={22} color={colors.danger} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Opinión denunciada</Text>
                <Text style={styles.rowMeta} numberOfLines={2}>
                  {review.rating}/5 ·{" "}
                  {review.reportReason || review.comment || "Sin detalle"}
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {tab === "orders" ? (
        <>
          <View style={styles.metrics}>
            <Metric label="Activos" value={payments?.orders.total || 0} />
            <Metric label="Archivados" value={payments?.orders.archived || 0} />
            <Metric
              label="Pagos completados"
              value={payments?.orders.paidPayments || 0}
              tone="success"
            />
            <Metric
              label="Incidencias"
              value={openIncidents.length}
              tone={openIncidents.length ? "warning" : "default"}
            />
          </View>
          <Text style={styles.sectionTitle}>Pedidos recientes</Text>
          {!payments?.orders.items.length ? (
            <EmptyState
              title="Todavía no hay pedidos reales"
              body="Cuando llegue el primero aparecerá aquí con pago, fiscalidad, entrega y trazabilidad."
              demo={{
                title: "Pedido 15 kg de naranjas",
                meta: "17,00 € · Pago confirmado",
                detail: "Comprador → agricultor · Preparación pendiente",
                leading: <ShoppingBag size={20} color={colors.primary} />,
              }}
            />
          ) : null}
          {(payments?.orders.items || []).map((order) => (
            <View key={order.id} style={styles.dataCard}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>
                  Pedido {order.id.slice(0, 8)}
                </Text>
                <Text style={styles.amount}>
                  {formatMinorCurrency(order.totalAmount, order.currency)}
                </Text>
              </View>
              <Text style={styles.rowMeta}>
                {order.buyerName} → {order.sellerName}
              </Text>
              <View style={styles.chips}>
                {[
                  order.paymentStatus,
                  order.fulfillmentStatus,
                  order.taxStatus,
                  order.traceabilityStatus,
                ].map((status, index) => (
                  <Text key={`${status}:${index}`} style={styles.chip}>
                    {statusLabel(status)}
                  </Text>
                ))}
              </View>
              <Text style={styles.rowMeta}>{shortDate(order.createdAt)}</Text>
              <View style={styles.messageActions}>
                {order.buyerUserId !== currentUserId ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar mensaje privado a ${order.buyerName}`}
                    style={styles.messageAction}
                    onPress={() =>
                      openPrivateMessage(order.buyerUserId, order.buyerName)
                    }
                  >
                    <MessageCircle size={17} color={colors.primary} />
                    <Text style={styles.messageActionText}>Mensaje al comprador</Text>
                  </TouchableOpacity>
                ) : null}
                {order.sellerUserId !== currentUserId ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar mensaje privado a ${order.sellerName}`}
                    style={styles.messageAction}
                    onPress={() =>
                      openPrivateMessage(order.sellerUserId, order.sellerName)
                    }
                  >
                    <MessageCircle size={17} color={colors.primary} />
                    <Text style={styles.messageActionText}>Mensaje al vendedor</Text>
                  </TouchableOpacity>
                ) : null}
                {order.connectorUserId &&
                order.connectorUserId !== currentUserId ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Enviar mensaje privado a ${order.connectorName || "el Conector"}`}
                    style={styles.messageAction}
                    onPress={() =>
                      openPrivateMessage(
                        order.connectorUserId!,
                        order.connectorName || "Conector Allwain",
                      )
                    }
                  >
                    <MessageCircle size={17} color={colors.primary} />
                    <Text style={styles.messageActionText}>Mensaje al Conector</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {tab === "payments" ? (
        <>
          {!payments?.financialSummary ? <Text style={styles.rowMeta}>Resumen de importes no disponible.</Text> :
            payments.financialSummary.byCurrency.length === 0 ? <Text style={styles.rowMeta}>No hay movimientos de pago registrados.</Text> :
            payments.financialSummary.byCurrency.map(row => <View key={row.currency}>
              <Text style={styles.sectionTitle}>Movimientos {row.currency}</Text>
              <View style={styles.metrics}>
                <Metric label="Cobrado" value={formatMinorCurrency(row.grossAmount, row.currency)} />
                <Metric label="Reembolsado" value={formatMinorCurrency(row.refundedAmount, row.currency)} />
                <Metric label="Transferido neto a vendedores" value={row.sellerTransferNetAmount === null ? "Revisar" : formatMinorCurrency(row.sellerTransferNetAmount, row.currency)} />
                <Metric label="Transferido neto a conectores" value={row.connectorTransferNetAmount === null ? "Revisar" : formatMinorCurrency(row.connectorTransferNetAmount, row.currency)} />
              </View>
              <Text style={styles.rowMeta}>Histórico completo. Transferencias a cuentas Stripe, no ingresos bancarios.</Text>
              {row.pendingRefundCount || row.uncertainTransferCount || row.warnings.length ?
                <Text style={styles.rowMeta}>{row.pendingRefundCount} devoluciones pendientes · {row.uncertainTransferCount} transferencias por comprobar{row.warnings.length ? ". Importes por revisar." : "."}</Text> : null}
            </View>)}

          <DisputeAccountingPanel />

          <View style={styles.sectionHeader}>
            <View style={styles.headerCopy}>
              <Text style={styles.sectionTitle}>Conciliación</Text>
              <Text style={styles.rowMeta}>
                {latestReconciliation
                  ? `${statusLabel(latestReconciliation.status)} · ${shortDate(
                      latestReconciliation.startedAt,
                    )}`
                  : "Aún no hay comprobaciones"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={confirmReconciliation}
              disabled={busy === "reconciliation"}
            >
              <Text style={styles.primaryActionText}>
                {busy === "reconciliation" ? "Comprobando..." : "Comprobar"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Vendedores y cobros</Text>
          {!payments?.sellers.items.length ? (
            <EmptyState
              title="Todavía no hay vendedores con cobros"
              body="Las cuentas verificadas por Stripe aparecerán aquí."
              demo={{
                title: "Agricultor de Foios",
                meta: "Identidad verificada · Banco activo",
                detail: "El panel mostrará capacidades, cobros y cualquier dato pendiente.",
                leading: <CreditCard size={20} color={colors.primary} />,
              }}
            />
          ) : null}
          {(payments?.sellers.items || []).map((seller) => (
            <View key={seller.userId} style={styles.dataCard}>
              <View style={styles.rowHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{seller.name}</Text>
                  <Text style={styles.rowMeta}>
                    {seller.email || "Sin email visible"}
                  </Text>
                </View>
                <Text style={styles.chip}>{statusLabel(seller.status)}</Text>
              </View>
              <Text style={styles.rowMeta}>
                Cobros {seller.transfersEnabled ? "activos" : "pendientes"} ·
                Banco {seller.payoutsEnabled ? " activo" : " pendiente"}
              </Text>
              {seller.userId !== currentUserId ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Enviar mensaje privado a ${seller.name}`}
                  style={styles.messageAction}
                  onPress={() => openPrivateMessage(seller.userId, seller.name)}
                >
                  <MessageCircle size={17} color={colors.primary} />
                  <Text style={styles.messageActionText}>Enviar mensaje privado</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      {tab === "users" ? (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar nombre, email o perfil"
            placeholderTextColor={colors.mutedText}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          <Text style={styles.sectionTitle}>
            {filteredUsers.length} usuarios
          </Text>
          {!filteredUsers.length ? (
            <EmptyState
              title={query.trim() ? "No hay coincidencias" : "Todavía no hay usuarios"}
              body={query.trim() ? "Prueba con otro nombre, email o perfil." : "Los nuevos registros aparecerán aquí."}
              demo={{
                title: "Usuario Allwain",
                meta: "Comprador · Vendedor · Conector",
                detail: "Una identidad puede activar los tres espacios sin crear cuentas duplicadas.",
                leading: <Users size={20} color={colors.primary} />,
              }}
            />
          ) : null}
          {filteredUsers.map((user) => (
            <View key={user.id} style={styles.dataCard}>
              <View style={styles.rowHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>
                    {user.name || "Usuario Allwain"}
                  </Text>
                  <Text style={styles.rowMeta}>{user.email}</Text>
                </View>
                <Text style={styles.chip}>{statusLabel(user.role)}</Text>
              </View>
              {user.createdAt ? (
                <Text style={styles.rowMeta}>
                  Alta {shortDate(user.createdAt)}
                </Text>
              ) : null}
              {user.id !== currentUserId ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Enviar mensaje privado a ${user.name || "este usuario"}`}
                  style={styles.messageAction}
                  onPress={() =>
                    openPrivateMessage(
                      user.id,
                      user.name || "Usuario Allwain",
                    )
                  }
                >
                  <MessageCircle size={17} color={colors.primary} />
                  <Text style={styles.messageActionText}>Enviar mensaje privado</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      {tab === "support" ? <SupportPanel /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    padding: 18,
    paddingBottom: 48,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 3 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900" },
  updated: { color: colors.mutedText, fontWeight: "600", fontSize: 12 },
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
  error: {
    color: colors.danger,
    backgroundColor: "#FFF0EE",
    borderColor: "#F3C6BF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontWeight: "800",
  },
  tabs: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  tabActive: { backgroundColor: colors.text },
  tabText: { color: colors.text, fontSize: 11, fontWeight: "900" },
  tabTextActive: { color: "#FFFFFF" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 82,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    justifyContent: "center",
    padding: 13,
    gap: 4,
  },
  metricWarning: { borderColor: "#D5A052", backgroundColor: "#FFF8E8" },
  metricDanger: { borderColor: "#D9A29A", backgroundColor: "#FFF0EE" },
  metricSuccess: { borderColor: "#8EBEAA", backgroundColor: "#EEF8F3" },
  metricValue: { color: colors.text, fontSize: 22, fontWeight: "900" },
  metricLabel: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 7,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  emptyState: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#8EBEAA",
    backgroundColor: "#EEF8F3",
    padding: 14,
  },
  alertCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D9B8A1",
    backgroundColor: colors.card,
    padding: 13,
  },
  dataCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 13,
    gap: 8,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.text, fontWeight: "900", lineHeight: 20 },
  rowMeta: {
    color: colors.mutedText,
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 17,
  },
  amount: { color: colors.primary, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "800",
  },
  messageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  messageAction: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  messageActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  smallAction: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: colors.text,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallActionText: { color: "#FFFFFF", fontWeight: "900" },
  primaryAction: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.button,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryActionText: { color: colors.buttonText, fontWeight: "900" },
  searchInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    fontWeight: "700",
  },
});
