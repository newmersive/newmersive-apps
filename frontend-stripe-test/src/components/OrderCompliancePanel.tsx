import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  PackageCheck,
  PenLine,
} from "lucide-react-native";

import {
  API_BASE_URL,
  apiAuthGet,
  apiAuthPost,
  type AllwainOrder,
  type AllwainOrderCompliance,
} from "../config/api";
import { colors } from "../theme/colors";
import { downloadAuthenticatedFile } from "../utils/downloadAuthenticatedFile";
import { formatMinorCurrency } from "../utils/format";
import { BigActionButton, EmptyState, StatusChip } from "./design-system";

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    pending_profile: "Faltan datos",
    pending_rule: "En revisión",
    manual_review: "Revisión fiscal",
    determined: "Determinado",
    available: "Disponibles",
    not_started: "Pendiente",
    lot_required: "Falta lote",
    lot_assigned: "Lote asignado",
    recalled: "Retirado",
    not_required: "No necesario",
    draft: "Preparando",
    locked: "Registrado",
    settled: "Liquidado",
    partially_refunded: "Reembolso parcial",
    refunded: "Reembolsado",
    quality: "Calidad",
    not_delivered: "No entregado",
    wrong_quantity: "Cantidad incorrecta",
    rejected_delivery: "Entrega rechazada",
    payment: "Pago",
    cancellation: "Cancelación",
    other: "Otro",
    open: "Abierta",
    investigating: "En revisión",
    resolved: "Resuelta",
    rejected: "Rechazada",
    closed: "Cerrada",
  };
  return labels[value] || value.replace(/_/g, " ");
}

export default function OrderCompliancePanel({
  order,
  isSeller,
  token,
}: {
  order: AllwainOrder;
  isSeller: boolean;
  token?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AllwainOrderCompliance | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentType, setIncidentType] = useState("quality");
  const [incidentReason, setIncidentReason] = useState("");
  const [incidentResolution, setIncidentResolution] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [lotOrigin, setLotOrigin] = useState("");
  const [recallLotId, setRecallLotId] = useState<string | null>(null);
  const [recallReason, setRecallReason] = useState("");
  const [recallInstructions, setRecallInstructions] = useState("");
  const [recallConfirmed, setRecallConfirmed] = useState(false);
  const [signatureNames, setSignatureNames] = useState<Record<string, string>>({});
  const [signatureConfirmed, setSignatureConfirmed] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAuthGet<AllwainOrderCompliance>(
        `/allwain/compliance/orders/${order.id}`,
      );
      if (response.orderId !== order.id)
        throw new Error("El pedido recibido no coincide.");
      setData(response);
    } catch (loadError: any) {
      setError(
        loadError?.message || "No pudimos cargar los documentos del pedido.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!data) await load();
  }

  async function downloadDocument(id: string, title: string) {
    if (!token) return;
    setBusy(`document:${id}`);
    setError(null);
    try {
      await downloadAuthenticatedFile({
        url: `${API_BASE_URL}/allwain/compliance/documents/${id}/pdf`,
        token,
        filename: `${title}-${order.id}.pdf`,
      });
      setNotice("Documento preparado.");
    } catch (downloadError: any) {
      setError(downloadError?.message || "No pudimos preparar el documento.");
    } finally {
      setBusy(null);
    }
  }

  async function signDocument(id: string) {
    const typedName = String(signatureNames[id] || "").trim();
    if (!typedName) {
      setError("Escribe tu nombre completo para firmar.");
      return;
    }
    if (!signatureConfirmed[id]) {
      setError("Confirma que has revisado el documento.");
      return;
    }
    setBusy(`sign:${id}`);
    setError(null);
    setNotice(null);
    try {
      const signed = await apiAuthPost<{
        id: string;
        signatureStatus: string;
      }>(`/allwain/compliance/documents/${id}/sign`, {
        confirm: true,
        typedName,
      });
      if (signed.id !== id || signed.signatureStatus !== "signed") {
        throw new Error("El servidor no confirmó la firma.");
      }
      setSignatureNames((current) => ({ ...current, [id]: "" }));
      setSignatureConfirmed((current) => ({ ...current, [id]: false }));
      setNotice("Documento firmado y registrado.");
      await load();
    } catch (signatureError: any) {
      setError(signatureError?.message || "No pudimos registrar la firma.");
    } finally {
      setBusy(null);
    }
  }

  async function reportIncident() {
    if (!incidentReason.trim()) {
      setError("Cuéntanos qué ha ocurrido.");
      return;
    }
    setBusy("incident");
    setError(null);
    setNotice(null);
    try {
      const created = await apiAuthPost<{ id: string; status: string }>(
        `/allwain/compliance/orders/${order.id}/incidents`,
        {
          type: incidentType,
          reason: incidentReason.trim(),
          requestedResolution: incidentResolution.trim() || undefined,
        },
      );
      if (!created.id || created.status !== "open") {
        throw new Error("El servidor no confirmó la incidencia.");
      }
      setIncidentReason("");
      setIncidentResolution("");
      setIncidentOpen(false);
      setNotice("Incidencia registrada.");
      await load();
    } catch (incidentError: any) {
      setError(incidentError?.message || "No pudimos registrar la incidencia.");
    } finally {
      setBusy(null);
    }
  }

  async function assignLot() {
    if (!lotCode.trim()) {
      setError("Escribe el código del lote.");
      return;
    }
    setBusy("lot");
    setError(null);
    setNotice(null);
    try {
      const lot = await apiAuthPost<{ id: string }>(
        "/allwain/compliance/lots",
        {
          offerId: order.offerId,
          code: lotCode.trim(),
          originCountry: "ES",
          originRegion: lotOrigin.trim() || undefined,
          unit: order.unit,
        },
      );
      if (!lot.id) throw new Error("El servidor no confirmó el lote.");
      const allocation = await apiAuthPost<{ id: string }>(
        `/allwain/compliance/orders/${order.id}/lots`,
        { lotId: lot.id, quantity: order.quantity },
      );
      if (!allocation.id)
        throw new Error("El servidor no confirmó la asignación.");
      setLotCode("");
      setLotOrigin("");
      setNotice("Lote asignado al pedido.");
      await load();
    } catch (lotError: any) {
      const messages: Record<string, string> = {
        LOT_UNAVAILABLE: "Este lote está retirado o caducado.",
        ORDER_TRACEABILITY_RESTRICTED: "El pedido tiene una retirada pendiente de revisión.",
        LOT_QUANTITY_EXCEEDED: "La cantidad supera lo disponible en este lote.",
        LOT_SOURCE_LOCKED: "Este lote ya está vinculado a pedidos y no puede cambiar de producto o unidad.",
        LOT_ALLOCATION_LOCKED: "La cantidad de este lote ya quedó registrada y no puede sobrescribirse.",
        INVALID_LOT_PRODUCT: "El lote pertenece a otro producto.",
        INVALID_LOT_UNIT: "La unidad del lote no coincide con la del producto.",
        INVALID_LOT_QUANTITY: "Revisa la cantidad pendiente y utiliza hasta tres decimales.",
      };
      setError(messages[lotError?.code] || messages[lotError?.message] || "No pudimos asignar el lote.");
    } finally {
      setBusy(null);
    }
  }

  async function recallLot(lotId: string) {
    if (!recallReason.trim()) {
      setError("Explica por qué debe retirarse el lote.");
      return;
    }
    if (!recallConfirmed) {
      setError("Confirma que quieres avisar a todos los compradores afectados.");
      return;
    }
    setBusy(`recall:${lotId}`);
    setError(null);
    setNotice(null);
    try {
      const recall = await apiAuthPost<{
        id: string;
        status: string;
        affectedOrderCount: number;
        affectedBuyerCount: number;
      }>(`/allwain/compliance/lots/${lotId}/recall`, {
        reason: recallReason.trim(),
        instructions: recallInstructions.trim() || undefined,
      });
      if (!recall.id || recall.status !== "active") {
        throw new Error("El servidor no confirmó la retirada del lote.");
      }
      setRecallLotId(null);
      setRecallReason("");
      setRecallInstructions("");
      setRecallConfirmed(false);
      setNotice(
        `Retirada registrada. ${recall.affectedBuyerCount} comprador${recall.affectedBuyerCount === 1 ? "" : "es"} avisado${recall.affectedBuyerCount === 1 ? "" : "s"}.`,
      );
      await load();
    } catch (recallError: any) {
      setError(recallError?.message || "No pudimos retirar el lote.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.toggle} onPress={() => void toggle()}>
        <View style={styles.toggleCopy}>
          <FileText size={19} color={colors.primary} />
          <Text style={styles.toggleText}>Documentos e incidencias</Text>
        </View>
        {open ? (
          <ChevronUp size={20} color={colors.text} />
        ) : (
          <ChevronDown size={20} color={colors.text} />
        )}
      </TouchableOpacity>

      {open ? (
        <View style={styles.content}>
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
          {data ? (
            <>
              <View style={styles.statusRow}>
                <StatusChip
                  label={`Fiscal: ${statusLabel(data.statuses.tax)}`}
                  tone={
                    data.statuses.tax === "determined" ? "success" : "warning"
                  }
                />
                <StatusChip
                  label={`Lote: ${statusLabel(data.statuses.traceability)}`}
                  tone={
                    data.statuses.traceability === "lot_required"
                      ? "warning"
                      : "neutral"
                  }
                />
                <StatusChip
                  label={`Liquidación: ${statusLabel(data.statuses.settlement)}`}
                  tone="neutral"
                />
              </View>

              <Text style={styles.heading}>Documentos</Text>
              {data.documents.length ? (
                data.documents.map((document) => (
                  <View key={document.id} style={styles.documentBlock}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() =>
                        void downloadDocument(document.id, document.title)
                      }
                      disabled={busy === `document:${document.id}`}
                    >
                      <FileText size={18} color={colors.primary} />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle}>{document.title}</Text>
                        <Text style={styles.rowMeta}>
                          {new Date(
                            document.issuedAt || Date.now(),
                          ).toLocaleDateString("es-ES")}{" "}
                          · {formatMinorCurrency(document.totalAmount, document.currency)}
                        </Text>
                      </View>
                      {document.signatureStatus === "signed" ? (
                        <CheckCircle2 size={19} color={colors.success} />
                      ) : busy === `document:${document.id}` ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                    {document.canSign ? (
                      <View style={styles.signatureBox}>
                        <View style={styles.headingRow}>
                          <PenLine size={18} color={colors.primary} />
                          <Text style={styles.heading}>Tu firma es necesaria</Text>
                        </View>
                        <Text style={styles.help}>
                          Abre el documento, comprueba sus datos y firma con tu nombre completo.
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={signatureNames[document.id] || ""}
                          onChangeText={(value) =>
                            setSignatureNames((current) => ({
                              ...current,
                              [document.id]: value,
                            }))
                          }
                          placeholder="Nombre y apellidos"
                          placeholderTextColor={colors.mutedText}
                          autoCapitalize="words"
                        />
                        <View style={styles.confirmRow}>
                          <Text style={styles.confirmText}>
                            He revisado el documento y confirmo su contenido
                          </Text>
                          <Switch
                            value={Boolean(signatureConfirmed[document.id])}
                            onValueChange={(value) =>
                              setSignatureConfirmed((current) => ({
                                ...current,
                                [document.id]: value,
                              }))
                            }
                            trackColor={{ false: colors.cardBorder, true: colors.primary }}
                            thumbColor={colors.card}
                          />
                        </View>
                        <BigActionButton
                          label="Firmar documento"
                          busy={busy === `sign:${document.id}`}
                          disabled={!signatureConfirmed[document.id]}
                          onPress={() => void signDocument(document.id)}
                        />
                      </View>
                    ) : document.signatureRequired && document.signatureStatus === "pending" ? (
                      <Text style={styles.signaturePending}>
                        Pendiente de firma de la otra parte.
                      </Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <EmptyState
                  title="Aún no hay documentos"
                  body="Los justificantes aparecerán al avanzar el pago y la entrega."
                  demo={{
                    title: "Justificante de compra",
                    meta: "Pendiente de emisión · Ejemplo",
                    detail: "Cada documento real quedará unido al pedido, al pago y a su firma cuando proceda.",
                    leading: <FileText size={19} color={colors.primary} />,
                  }}
                />
              )}

              {isSeller && data.statuses.traceability === "lot_required" ? (
                <View style={styles.formSection}>
                  <View style={styles.headingRow}>
                    <PackageCheck size={19} color={colors.primary} />
                    <Text style={styles.heading}>Asignar lote</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={lotCode}
                    onChangeText={setLotCode}
                    placeholder="Código del lote"
                    placeholderTextColor={colors.mutedText}
                  />
                  <TextInput
                    style={styles.input}
                    value={lotOrigin}
                    onChangeText={setLotOrigin}
                    placeholder="Zona de origen (opcional)"
                    placeholderTextColor={colors.mutedText}
                  />
                  <BigActionButton
                    label="Asignar al pedido"
                    busy={busy === "lot"}
                    onPress={() => void assignLot()}
                  />
                </View>
              ) : null}
              {data.lots.map((allocation) => {
                const recalled = allocation.lot.status === "recalled";
                return (
                  <View key={allocation.id} style={styles.lotBlock}>
                    <View style={styles.row}>
                      {recalled ? (
                        <AlertTriangle size={18} color={colors.danger} />
                      ) : (
                        <PackageCheck size={18} color={colors.success} />
                      )}
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle}>
                          Lote {allocation.lot.code} · {recalled ? "Retirado" : "Asignado"}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {allocation.quantity} {allocation.unit}
                          {allocation.lot.originRegion
                            ? ` · ${allocation.lot.originRegion}`
                            : ""}
                        </Text>
                      </View>
                    </View>
                    {allocation.lot.recall ? (
                      <View style={styles.recallWarning}>
                        <Text style={styles.recallTitle}>No uses ni consumas este producto</Text>
                        <Text style={styles.rowMeta}>{allocation.lot.recall.reason}</Text>
                        {allocation.lot.recall.instructions ? (
                          <Text style={styles.rowMeta}>{allocation.lot.recall.instructions}</Text>
                        ) : null}
                      </View>
                    ) : null}
                    {isSeller && !recalled && recallLotId !== allocation.lot.id ? (
                      <TouchableOpacity
                        style={styles.recallButton}
                        onPress={() => {
                          setError(null);
                          setRecallLotId(allocation.lot.id);
                          setRecallConfirmed(false);
                        }}
                      >
                        <Text style={styles.recallButtonText}>Retirar este lote</Text>
                      </TouchableOpacity>
                    ) : null}
                    {isSeller && recallLotId === allocation.lot.id ? (
                      <View style={styles.formSection}>
                        <Text style={styles.recallTitle}>Avisar a todos los compradores</Text>
                        <Text style={styles.help}>
                          Allwain localizará cada pedido vinculado a este lote, bloqueará su estado normal y dejará constancia auditable.
                        </Text>
                        <TextInput
                          style={[styles.input, styles.multiline]}
                          value={recallReason}
                          onChangeText={setRecallReason}
                          placeholder="Motivo de la retirada"
                          placeholderTextColor={colors.mutedText}
                          multiline
                          textAlignVertical="top"
                        />
                        <TextInput
                          style={styles.input}
                          value={recallInstructions}
                          onChangeText={setRecallInstructions}
                          placeholder="Qué debe hacer el comprador (opcional)"
                          placeholderTextColor={colors.mutedText}
                        />
                        <View style={styles.confirmRow}>
                          <Text style={styles.confirmText}>
                            Confirmo la retirada y el aviso a los afectados
                          </Text>
                          <Switch
                            value={recallConfirmed}
                            onValueChange={setRecallConfirmed}
                            trackColor={{ false: colors.cardBorder, true: colors.primary }}
                            thumbColor={colors.card}
                          />
                        </View>
                        <BigActionButton
                          label="Confirmar retirada"
                          tone="dark"
                          busy={busy === `recall:${allocation.lot.id}`}
                          disabled={!recallConfirmed}
                          onPress={() => void recallLot(allocation.lot.id)}
                        />
                        <TouchableOpacity
                          style={styles.cancel}
                          onPress={() => {
                            setRecallLotId(null);
                            setRecallReason("");
                            setRecallInstructions("");
                            setRecallConfirmed(false);
                          }}
                          disabled={busy === `recall:${allocation.lot.id}`}
                        >
                          <Text style={styles.cancelText}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <View style={styles.headingRow}>
                <AlertTriangle size={19} color={colors.primary} />
                <Text style={styles.heading}>Incidencias</Text>
              </View>
              {data.incidents.map((incident) => (
                <View key={incident.id} style={styles.row}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>
                      {statusLabel(incident.type)} ·{" "}
                      {statusLabel(incident.status)}
                    </Text>
                    <Text style={styles.rowMeta}>{incident.reason}</Text>
                  </View>
                </View>
              ))}
              {!incidentOpen ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setIncidentOpen(true)}
                >
                  <Text style={styles.secondaryButtonText}>
                    Comunicar un problema
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.formSection}>
                  <View style={styles.pickerFrame}>
                    <Picker
                      selectedValue={incidentType}
                      onValueChange={(value) => setIncidentType(String(value))}
                      style={styles.picker}
                    >
                      <Picker.Item label="Calidad" value="quality" />
                      <Picker.Item label="No entregado" value="not_delivered" />
                      <Picker.Item
                        label="Cantidad incorrecta"
                        value="wrong_quantity"
                      />
                      <Picker.Item
                        label="Entrega rechazada"
                        value="rejected_delivery"
                      />
                      <Picker.Item label="Pago" value="payment" />
                      <Picker.Item label="Cancelación" value="cancellation" />
                      <Picker.Item label="Otro" value="other" />
                    </Picker>
                  </View>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    value={incidentReason}
                    onChangeText={setIncidentReason}
                    placeholder="¿Qué ha ocurrido?"
                    placeholderTextColor={colors.mutedText}
                    multiline
                    textAlignVertical="top"
                  />
                  <TextInput
                    style={styles.input}
                    value={incidentResolution}
                    onChangeText={setIncidentResolution}
                    placeholder="¿Qué solución esperas? (opcional)"
                    placeholderTextColor={colors.mutedText}
                  />
                  <BigActionButton
                    label="Enviar incidencia"
                    busy={busy === "incident"}
                    onPress={() => void reportIncident()}
                  />
                  <TouchableOpacity
                    style={styles.cancel}
                    onPress={() => setIncidentOpen(false)}
                    disabled={busy === "incident"}
                  >
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 8,
  },
  toggle: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  toggleText: { color: colors.text, fontWeight: "900" },
  content: { gap: 10, paddingBottom: 4 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  heading: { color: colors.text, fontSize: 14, fontWeight: "900" },
  row: {
    minHeight: 54,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  documentBlock: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  signatureBox: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0D59B",
    borderRadius: 8,
    backgroundColor: "#FFF9EB",
    padding: 12,
    marginBottom: 10,
  },
  signaturePending: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "700",
    paddingBottom: 10,
  },
  lotBlock: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  rowMeta: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  help: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  formSection: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 10,
  },
  recallWarning: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    backgroundColor: "#FFF0EE",
    padding: 10,
    gap: 4,
    marginBottom: 8,
  },
  recallTitle: { color: colors.text, fontWeight: "900", lineHeight: 19 },
  recallButton: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  recallButtonText: { color: colors.danger, fontWeight: "900" },
  confirmRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  confirmText: { flex: 1, minWidth: 0, color: colors.text, fontWeight: "800" },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  multiline: { minHeight: 82 },
  pickerFrame: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  picker: { color: colors.text, backgroundColor: colors.background },
  secondaryButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: colors.text, fontWeight: "900" },
  cancel: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.mutedText, fontWeight: "800" },
  notice: { color: colors.success, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 18 },
});
