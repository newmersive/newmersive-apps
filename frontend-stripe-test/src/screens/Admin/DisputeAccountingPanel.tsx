import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { fetchAllwainAdminDispute, fetchAllwainAdminDisputes } from "../../config/adminDisputes";
import type { AdminDisputeDetail, AdminDisputePage, AdminDisputeRecord, AdminDisputeScope } from "../../config/adminDisputes";
import { createDisputeRequestGuard, disputeAccountingLabel, disputeDate, disputeEvidence, disputeMoney,
  disputeProviderLabel, disputeTotalLabels } from "../../utils/adminDisputes";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";

function Action({ label, onPress, disabled = false, expanded }: { label: string; onPress: () => void; disabled?: boolean; expanded?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, expanded }}
    onPress={onPress} disabled={disabled} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{label}</Text>
  </TouchableOpacity>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>;
}

function Evidence({ record }: { record: AdminDisputeRecord }) {
  const evidence = disputeEvidence(record);
  return <View style={styles.stack}>
    <Text style={styles.value}>{evidence.label}</Text>
    {evidence.warning ? <Text style={styles.warning}>{evidence.warning}</Text> : null}
    {!record.accounting.observationMatched && record.accounting.quality !== "unobserved"
      ? <Text style={styles.warning}>La observación no coincide con el estado actual. Revisa la evidencia antes de interpretar los importes.</Text> : null}
    {record.accounting.status === "loss_allocation_review"
      ? <Text style={styles.warning}>La pérdida está pendiente de asignación. Estos registros no determinan su imputación comercial o fiscal.</Text> : null}
    {evidence.issues.map((issue, i) => <Text key={`${i}:${issue}`} style={styles.warning}>{issue}</Text>)}
  </View>;
}

function Detail({ detail }: { detail: AdminDisputeDetail }) {
  const { record, movements } = detail;
  const [tracking, setTracking] = useState(false);
  const evidence = disputeEvidence(record);
  return <View style={styles.stack}>
    <Text selectable style={styles.subtitle}>{record.stripeDisputeId}</Text>
    <View style={styles.fields}>
      <Field label="Estado del registro" value={disputeProviderLabel(record.status)} />
      <Field label="Estado del proveedor observado" value={disputeProviderLabel(record.accounting.providerStatus)} />
      <Field label="Estado contable" value={disputeAccountingLabel(record.accounting.status)} />
      <Field label="Importe disputado" value={disputeMoney(record.amount, record.currency)} />
      <Field label="Pedido" value={record.orderId} />
      <Field label="Pago" value={record.paymentId || "Sin registrar"} />
      <Field label="Cargo Stripe" value={record.stripeChargeId || "Sin registrar"} />
      <Field label="Motivo del proveedor" value={record.reason || "Sin registrar"} />
      <Field label="Fecha límite de evidencia" value={record.evidenceDueAt ? disputeDate(record.evidenceDueAt) : "Sin fecha registrada"} />
      <Field label="Última observación contable" value={disputeDate(record.accounting.observedAt)} />
      <Field label="Próximo reintento de observación" value={record.accounting.retryAfter ? disputeDate(record.accounting.retryAfter) : "Sin fecha registrada"} />
      <Field label="Consulta local" value={disputeDate(detail.readAt)} />
    </View>
    {record.archived ? <Text style={styles.badge}>Archivada</Text> : null}
    <Evidence record={record} />
    <Text accessibilityRole="header" style={styles.subtitle}>Importes registrados</Text>
    <Text style={styles.meta}>Movimientos contables registrados; no representan saldo actual de Stripe ni fondos disponibles para beneficiarios.</Text>
    <View style={styles.fields}>{disputeTotalLabels.map(([key, label]) =>
      <Field key={key} label={label} value={disputeMoney(evidence.totals?.[key], record.currency)} />)}</View>
    <Text accessibilityRole="header" style={styles.subtitle}>Movimientos y asientos</Text>
    {!movements.length ? <Text style={styles.meta}>No hay movimientos registrados para esta disputa.</Text> : movements.map(movement =>
      <View key={movement.id} style={styles.card}>
        <Text style={styles.subtitle}>{movement.reportingCategory === "dispute" ? "Retirada por disputa" : movement.reportingCategory === "dispute_reversal" ? "Restitución por disputa" : "Movimiento por revisar"}</Text>
        <Field label="Transacción de saldo Stripe" value={movement.stripeBalanceTransactionId} />
        <Field label="Cuenta Stripe" value={movement.stripeAccountId} />
        <Text style={styles.meta}>{movement.stripeMode === "test" ? "Modo TEST" : "Modo por revisar"}</Text>
        <View style={styles.fields}>
          <Field label="Principal (con signo)" value={disputeMoney(movement.amount, movement.currency)} />
          <Field label="Comisión (con signo)" value={disputeMoney(movement.fee, movement.currency)} />
          <Field label="Variación Stripe" value={disputeMoney(movement.net, movement.currency)} />
          <Field label="Creado" value={disputeDate(movement.created)} />
          <Field label="Fecha de disponibilidad registrada" value={disputeDate(movement.availableOn)} />
          <Field label="Disponibilidad observada" value={movement.availableStatus === "available" ? "Disponible según la observación" : movement.availableStatus === "pending" ? "Pendiente según la observación" : "Sin comprobar"} />
        </View>
        <Text style={movement.journalComplete ? styles.value : styles.warning}>{movement.journalComplete ? "Asientos completos" : "Asientos por revisar"}</Text>
        {!movement.journal.length ? <Text style={styles.meta}>No hay asientos vinculados.</Text> : movement.journal.map(entry =>
          <View key={entry.id} style={styles.journal}>
            <Field label="Cuenta contable" value={entry.accountCode} />
            <Text style={styles.value}>{entry.direction === "debit" ? "Debe" : entry.direction === "credit" ? "Haber" : "Dirección por revisar"} · {disputeMoney(entry.amount, entry.currency)}</Text>
            <Text style={styles.meta}>{entry.component === "principal" ? "Principal" : entry.component === "fee" ? "Comisión" : "Componente sin comprobar"} · {disputeDate(entry.occurredAt)}</Text>
            <Field label="Referencia" value={`${entry.referenceType}: ${entry.referenceId}`} />
          </View>)}
      </View>)}
    <Action label={tracking ? "Ocultar seguimiento de disputa" : "Mostrar seguimiento de disputa"} expanded={tracking} onPress={() => setTracking(value => !value)} />
    {tracking ? <View style={styles.card} role="region" accessibilityLabel="Seguimiento de disputa">
      <Text accessibilityRole="header" style={styles.subtitle}>Seguimiento de disputa</Text>
      <Field label="Revisión contable" value={String(record.accounting.revision)} />
      <Field label="Hash del estado contable" value={record.accounting.stateHash || "Sin comprobar"} />
      <Field label="Código del último fallo" value={record.accounting.failureCode || "Sin fallo registrado"} />
      <Field label="Registro creado" value={disputeDate(record.createdAt)} />
      <Field label="Registro actualizado" value={disputeDate(record.updatedAt)} />
      <Field label="Cierre registrado" value={record.closedAt ? disputeDate(record.closedAt) : "Sin fecha registrada"} />
      {movements.map(movement => <View key={movement.id} style={styles.journal}>
        <Field label="Transacción de saldo Stripe" value={movement.stripeBalanceTransactionId} />
        <Field label="Hash de la evidencia del movimiento" value={movement.snapshotHash} />
      </View>)}
    </View> : null}
  </View>;
}

function DisputeSession({ userId }: { userId: string }) {
  const active = useRef(true);
  const [guard] = useState(() => createDisputeRequestGuard(() => {
    const session = useAuthStore.getState();
    return active.current && session.user?.id === userId && session.user.role === "admin" && !!session.token;
  }));
  const [scope, setScope] = useState<AdminDisputeScope>("attention");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const [page, setPage] = useState<AdminDisputePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminDisputeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    active.current = true;
    return () => { active.current = false; guard.invalidate(); };
  }, [guard]));
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((session, previous) => {
      if (session.user?.id !== previous.user?.id || session.user?.role !== previous.user?.role || !session.token) guard.invalidate();
    });
    return () => { active.current = false; guard.invalidate(); unsubscribe(); };
  }, [guard]);

  const clearDetail = useCallback(() => {
    guard.invalidateDetail(); setSelected(null); setDetail(null); setDetailError(null); setDetailLoading(false);
  }, [guard]);

  const loadList = useCallback(async () => {
    const ticket = guard.beginList();
    clearDetail(); setPage(null); setError(null); setLoading(true);
    try {
      const result = await fetchAllwainAdminDisputes(scope, cursor);
      if (guard.listCurrent(ticket)) setPage(result);
    } catch (err) {
      if (guard.listCurrent(ticket)) setError(err instanceof Error ? err.message : "No se pudieron consultar las disputas.");
    } finally {
      if (guard.listCurrent(ticket)) setLoading(false);
    }
  }, [guard, clearDetail, scope, cursor]);
  useEffect(() => { void loadList(); return () => guard.invalidate(); }, [loadList, guard]);

  const loadDetail = async (id: string) => {
    const ticket = guard.beginDetail();
    setSelected(id); setDetail(null); setDetailError(null); setDetailLoading(true);
    try {
      const result = await fetchAllwainAdminDispute(id);
      if (guard.detailCurrent(ticket)) setDetail(result);
    } catch (err) {
      if (guard.detailCurrent(ticket)) setDetailError(err instanceof Error ? err.message : "No se pudo consultar el detalle.");
    } finally {
      if (guard.detailCurrent(ticket)) setDetailLoading(false);
    }
  };

  const changeScope = (value: AdminDisputeScope) => {
    if (value === scope) return;
    guard.invalidate(); clearDetail(); setPage(null); setError(null); setLoading(true); setScope(value); setCursors([null]);
  };
  const changePage = (next: boolean) => {
    if (loading || !page || (next ? !page.nextCursor : cursors.length <= 1)) return;
    guard.invalidate(); clearDetail(); setPage(null); setError(null); setLoading(true);
    setCursors(next ? [...cursors, page.nextCursor] : cursors.slice(0, -1));
  };

  return <View style={styles.panel} role="region" accessibilityLabel="Contabilidad de disputas" testID="dispute-accounting">
    <Text accessibilityRole="header" style={styles.title}>Contabilidad de disputas</Text>
    <Text style={styles.meta}>Consulta de registros locales. Incluye disputas archivadas. Actualizar consulta los datos guardados, sin ejecutar operaciones financieras.</Text>
    <Text style={styles.label}>Disputas</Text>
    <View style={styles.pickerWrap}><Picker accessibilityLabel="Disputas" selectedValue={scope}
      onValueChange={value => changeScope(value as AdminDisputeScope)} style={styles.picker}>
      <Picker.Item label="Solo con atención" value="attention" /><Picker.Item label="Todas" value="all" />
    </Picker></View>
    <Action label="Actualizar disputas" onPress={() => void loadList()} disabled={loading} />
    {loading ? <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.meta}>Consultando disputas…</Text></View> : null}
    {error ? <View style={styles.stack} accessibilityLiveRegion="assertive"><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Text style={styles.meta}>No se muestra una consulta anterior como si estuviera actualizada.</Text>
      {cursors.length > 1 ? <Action label="Volver a la primera página de disputas" onPress={() => {
        guard.invalidate(); clearDetail(); setError(null); setLoading(true); setCursors([null]);
      }} /> : null}</View> : null}
    {page ? <>
      <Text style={styles.meta}>{page.total} disputas · Página {cursors.length} · Consulta local: {disputeDate(page.readAt)}</Text>
      {!page.items.length ? <Text style={styles.meta}>{scope === "attention" ? "No hay disputas que requieran atención en esta consulta." : "No hay disputas en esta consulta."}</Text> : page.items.map(record =>
        <View key={record.id} style={[styles.card, selected === record.id && styles.selected]}>
          <Text selectable style={styles.subtitle}>{record.stripeDisputeId}</Text>
          {record.archived ? <Text style={styles.badge}>Archivada</Text> : null}
          <Field label="Pedido" value={record.orderId} />
          <Field label="Importe disputado" value={disputeMoney(record.amount, record.currency)} />
          <Field label="Estado del registro" value={disputeProviderLabel(record.status)} />
          <Field label="Estado del proveedor observado" value={disputeProviderLabel(record.accounting.providerStatus)} />
          <Field label="Estado contable" value={disputeAccountingLabel(record.accounting.status)} />
          <Text style={styles.meta}>{disputeEvidence(record).label}</Text>
          <Action label={`Ver disputa ${record.stripeDisputeId}`} onPress={() => void loadDetail(record.id)} />
          {selected === record.id ? <View style={styles.detail} role="region" accessibilityLabel="Detalle contable de disputa" testID="dispute-accounting-detail">
            <Text accessibilityRole="header" style={styles.title}>Detalle contable de disputa</Text>
            <Action label="Cerrar detalle de disputa" onPress={clearDetail} />
            {detailLoading ? <Text accessibilityLiveRegion="polite" style={styles.meta}>Consultando detalle…</Text> : null}
            {detailError ? <View style={styles.stack}><Text accessibilityRole="alert" style={styles.error}>{detailError}</Text>
              <Action label="Reintentar detalle de disputa" onPress={() => void loadDetail(record.id)} /></View> : null}
            {detail ? <Detail detail={detail} /> : null}
          </View> : null}
        </View>)}
      <View style={styles.actions}>
        <Action label="Página anterior de disputas" disabled={loading || cursors.length <= 1} onPress={() => changePage(false)} />
        <Action label="Página siguiente de disputas" disabled={loading || !page.nextCursor} onPress={() => changePage(true)} />
      </View>
    </> : null}
  </View>;
}

export function DisputeAccountingPanel() {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const focused = useIsFocused();
  if (!focused || user?.role !== "admin" || !token) return null;
  return <DisputeSession key={user.id} userId={user.id} />;
}

const styles = StyleSheet.create({
  panel: { gap: 12, paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder, minWidth: 0 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 16, fontWeight: "600", color: colors.text, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 19, color: colors.mutedText, flexShrink: 1 },
  label: { fontSize: 12, lineHeight: 18, color: colors.mutedText },
  value: { fontSize: 14, lineHeight: 20, color: colors.text, flexShrink: 1 },
  warning: { fontSize: 13, lineHeight: 19, color: "#805815" },
  error: { fontSize: 14, lineHeight: 20, color: colors.danger },
  badge: { alignSelf: "flex-start", fontSize: 12, color: colors.text, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  card: { gap: 10, padding: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, backgroundColor: colors.card, minWidth: 0 },
  selected: { borderColor: colors.brandDark },
  detail: { gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.cardBorder, minWidth: 0 },
  stack: { gap: 10, minWidth: 0 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 12, minWidth: 0 },
  field: { flexShrink: 1, minWidth: 0, gap: 3 },
  journal: { gap: 6, borderTopWidth: 1, borderColor: colors.cardBorder, paddingTop: 10, minWidth: 0 },
  pickerWrap: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, overflow: "hidden", backgroundColor: colors.card },
  picker: { width: "100%", color: colors.text, minHeight: 44 },
  button: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: colors.brandDark, borderRadius: 8, alignSelf: "flex-start", justifyContent: "center", maxWidth: "100%" },
  buttonText: { color: colors.brandDark, fontWeight: "600", fontSize: 13, flexShrink: 1 },
  disabled: { opacity: 0.45 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  loading: { flexDirection: "row", gap: 10, alignItems: "center" },
});
