import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlertCircle,
  Check,
  Pencil,
  ShoppingBag,
  Sparkles,
  Store,
  X,
} from "lucide-react-native";

import { BigActionButton, StatusChip } from "../../components/design-system";
import { colors } from "../../theme/colors";
import { interpretDeliveryWindow } from "../../utils/deliveryIntelligence";

export type GuideAction = {
  id: string;
  type: "create_offer" | "create_request";
  status: "draft" | "ready" | "requires_seller";
  title: string;
  missingFields: string[];
  missingLabels: string[];
  canExecute: boolean;
  fields: Record<string, unknown>;
};

type Props = {
  action: GuideAction;
  sellerEnabled: boolean;
  busy: boolean;
  onChange: (action: GuideAction) => void;
  onReview: (action: GuideAction) => void;
  onPublish: (action: GuideAction) => void;
  onActivateSeller: () => void;
  onCancel: () => void;
};

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(".", ",");
}

function summaryValue(value: unknown, fallback = "Por completar") {
  const text = textValue(value).trim();
  return text || fallback;
}

function measuredValue(amount: unknown, unit: unknown) {
  const amountText = textValue(amount).trim();
  const unitText = textValue(unit).trim();
  return amountText && unitText ? `${amountText} ${unitText}` : "Por completar";
}

function priceValue(price: unknown, unit: unknown) {
  const priceText = textValue(price).trim();
  const unitText = textValue(unit).trim();
  return priceText && unitText ? `${priceText} € / ${unitText}` : "Por completar";
}

function deliverySummary(method: unknown, address: unknown) {
  const addressText = textValue(address).trim();
  return method && addressText ? `${deliveryLabel(method)} · ${addressText}` : "Por completar";
}

function deliveryLabel(value: unknown) {
  if (value === "shipping") return "Envío";
  if (value === "pickup") return "Recogida";
  if (value === "in_person") return "En persona";
  return "Por completar";
}

function understoodDeliveryLabel(value: unknown) {
  return interpretDeliveryWindow(textValue(value))?.label || null;
}

function Field({
  label,
  value,
  onChange,
  numeric = false,
  multiline = false,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  numeric?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={textValue(value)}
        onChangeText={onChange}
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function GuideActionCard({
  action,
  sellerEnabled,
  busy,
  onChange,
  onReview,
  onPublish,
  onActivateSeller,
  onCancel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draftFields, setDraftFields] = useState<Record<string, unknown>>({
    ...action.fields,
  });
  const isOffer = action.type === "create_offer";
  const fields = editing ? draftFields : action.fields;
  const canPublish = action.canExecute || (action.status === "requires_seller" && sellerEnabled);

  useEffect(() => {
    setDraftFields({ ...action.fields });
    setEditing(false);
  }, [action.fields, action.id, action.status]);

  function update(key: string, value: unknown) {
    setDraftFields((current) => ({ ...current, [key]: value }));
  }

  function startEditing() {
    setDraftFields({ ...action.fields });
    setEditing(true);
  }

  function closeEditing() {
    setDraftFields({ ...action.fields });
    setEditing(false);
  }

  const statusLabel =
    action.status === "ready"
      ? "Listo para publicar"
      : action.status === "requires_seller"
        ? "Activa Vendedor"
        : "Faltan datos";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.actionIcon, isOffer ? styles.offerIcon : styles.requestIcon]}>
          {isOffer ? (
            <Store size={21} color="#FFFFFF" />
          ) : (
            <ShoppingBag size={21} color={colors.primary} />
          )}
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{isOffer ? "BORRADOR DE OFERTA" : "BORRADOR DE PETICIÓN"}</Text>
          <Text style={styles.title}>{action.title}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={editing ? "Cerrar edición" : "Editar borrador"}
          style={styles.iconButton}
          onPress={editing ? closeEditing : startEditing}
        >
          {editing ? <X size={20} color={colors.text} /> : <Pencil size={19} color={colors.text} />}
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <StatusChip
          label={statusLabel}
          tone={action.status === "ready" ? "success" : action.status === "draft" ? "warning" : "brand"}
        />
        {action.missingLabels.length ? (
          <Text style={styles.missingText} numberOfLines={2}>
            Falta: {action.missingLabels.join(", ")}
          </Text>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editor}>
          {isOffer ? (
            <>
              <Field label="Producto o servicio" value={fields.title} onChange={(value) => update("title", value)} />
              <Field
                label="Descripción"
                value={fields.description}
                onChange={(value) => update("description", value)}
                multiline
              />
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <Field label="Precio (€)" value={fields.price} onChange={(value) => update("price", value)} numeric />
                </View>
                <View style={styles.column}>
                  <Field label="Cantidad disponible" value={fields.availableQuantity} onChange={(value) => update("availableQuantity", value)} numeric />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Unidad de venta</Text>
              <View style={styles.choiceRow}>
                {["ud", "kg", "l", "h"].map((unit) => (
                  <Choice key={unit} label={unit} selected={fields.unit === unit} onPress={() => update("unit", unit)} />
                ))}
              </View>
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <Field label="Pedido mínimo" value={fields.minQuantity} onChange={(value) => update("minQuantity", value)} numeric />
                </View>
                <View style={styles.column}>
                  <Field label="Aumenta de" value={fields.quantityStep} onChange={(value) => update("quantityStep", value)} numeric />
                </View>
              </View>
              <Field
                label="Cuándo puedes entregarlo"
                value={fields.deliveryEstimate}
                onChange={(value) => update("deliveryEstimate", value)}
                placeholder="Ej. en 2 días laborables"
              />
              <Text style={styles.fieldLabel}>Qué estás ofreciendo</Text>
              <View style={styles.choiceRow}>
                <Choice label="Producto" selected={fields.productKind === "goods"} onPress={() => update("productKind", "goods")} />
                <Choice label="Alimento" selected={fields.productKind === "food"} onPress={() => update("productKind", "food")} />
                <Choice label="Servicio" selected={fields.productKind === "service"} onPress={() => update("productKind", "service")} />
              </View>
              {fields.productKind === "food" ? (
                <>
                  <Field label="Tipo de alimento" value={fields.foodCategory} onChange={(value) => update("foodCategory", value)} placeholder="Ej. fruta fresca" />
                  <Text style={styles.fieldLabel}>¿Es producción propia?</Text>
                  <View style={styles.choiceRow}>
                    <Choice label="Sí" selected={fields.ownProduction === true} onPress={() => update("ownProduction", true)} />
                    <Choice label="No" selected={fields.ownProduction === false} onPress={() => update("ownProduction", false)} />
                  </View>
                  <View style={styles.twoColumns}>
                    <View style={styles.column}>
                      <Field label="País de origen" value={fields.originCountry} onChange={(value) => update("originCountry", value.toUpperCase().slice(0, 2))} placeholder="ES" />
                    </View>
                    <View style={styles.column}>
                      <Field label="Zona de origen" value={fields.originRegion} onChange={(value) => update("originRegion", value)} placeholder="Valencia" />
                    </View>
                  </View>
                  <Field label="Responsable del producto" value={fields.responsibleOperator} onChange={(value) => update("responsibleOperator", value)} />
                </>
              ) : null}
            </>
          ) : (
            <>
              <Field label="Qué necesitas" value={fields.productName} onChange={(value) => update("productName", value)} />
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <Field label="Cantidad" value={fields.quantity} onChange={(value) => update("quantity", value)} numeric />
                </View>
                <View style={styles.column}>
                  <Field label="Precio máximo (€)" value={fields.targetPrice} onChange={(value) => update("targetPrice", value)} numeric />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Unidad</Text>
              <View style={styles.choiceRow}>
                {["ud", "kg", "l", "h"].map((unit) => (
                  <Choice key={unit} label={unit} selected={fields.unit === unit} onPress={() => update("unit", unit)} />
                ))}
              </View>
              <Field
                label="Cuándo lo necesitas"
                value={fields.deliveryWindow}
                onChange={(value) => update("deliveryWindow", value)}
                placeholder="Ej. mañana por la tarde"
              />
              <DeliveryUnderstanding rawValue={fields.deliveryWindow} />
              <Text style={styles.fieldLabel}>Cómo quieres recibirlo</Text>
              <View style={styles.choiceRow}>
                <Choice label="Envío" selected={fields.deliveryMethod === "shipping"} onPress={() => update("deliveryMethod", "shipping")} />
                <Choice label="Recogida" selected={fields.deliveryMethod === "pickup"} onPress={() => update("deliveryMethod", "pickup")} />
                <Choice label="En persona" selected={fields.deliveryMethod === "in_person"} onPress={() => update("deliveryMethod", "in_person")} />
              </View>
              <Field label="Zona o dirección" value={fields.deliveryAddress} onChange={(value) => update("deliveryAddress", value)} />
              <Field label="Indicaciones" value={fields.deliveryNotes} onChange={(value) => update("deliveryNotes", value)} multiline />
            </>
          )}
          <BigActionButton
            label="Guardar cambios"
            icon={<Check size={20} color="#FFFFFF" />}
            onPress={() => {
              const nextAction = { ...action, fields: { ...draftFields } };
              onChange(nextAction);
              setEditing(false);
              onReview(nextAction);
            }}
            busy={busy}
          />
        </View>
      ) : (
        <View style={styles.summary}>
          {isOffer ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Precio</Text>
                <Text style={styles.summaryStrong}>{priceValue(fields.price, fields.unit)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Disponible</Text>
                <Text style={styles.summaryValue}>{measuredValue(fields.availableQuantity, fields.unit)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Pedido mínimo</Text>
                <Text style={styles.summaryValue}>{measuredValue(fields.minQuantity, fields.unit)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Entrega</Text>
                <Text style={styles.summaryValue}>{summaryValue(fields.deliveryEstimate)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Cantidad</Text>
                <Text style={styles.summaryStrong}>{measuredValue(fields.quantity, fields.unit)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Para</Text>
                <Text style={styles.summaryValue}>
                  {understoodDeliveryLabel(fields.deliveryWindow) || summaryValue(fields.deliveryWindow)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Entrega</Text>
                <Text style={styles.summaryValue}>{deliverySummary(fields.deliveryMethod, fields.deliveryAddress)}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {!editing ? (
        <View style={styles.actions}>
          {action.status === "requires_seller" && !sellerEnabled ? (
            <BigActionButton
              label="Activar Vendedor"
              icon={<Store size={20} color="#FFFFFF" />}
              onPress={onActivateSeller}
            />
          ) : canPublish ? (
            <BigActionButton
              label={isOffer ? "Publicar oferta" : "Publicar petición"}
              icon={<Check size={20} color="#FFFFFF" />}
              onPress={() => onPublish(action)}
              busy={busy}
            />
          ) : (
            <BigActionButton
              label="Completar datos"
              icon={<Pencil size={20} color="#FFFFFF" />}
              onPress={startEditing}
            />
          )}
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelText}>Descartar borrador</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {action.missingLabels.length && !editing ? (
        <View style={styles.hint}>
          <AlertCircle size={17} color="#7A5612" />
          <Text style={styles.hintText}>Allwain no publicará hasta que estén completos los datos necesarios.</Text>
        </View>
      ) : null}
    </View>
  );
}

function DeliveryUnderstanding({ rawValue }: { rawValue: unknown }) {
  const interpreted = interpretDeliveryWindow(textValue(rawValue));
  if (!rawValue && !interpreted) {
    return null;
  }

  return (
    <View style={styles.understandingCard}>
      <Sparkles size={16} color={colors.primary} />
      <View style={styles.understandingCopy}>
        <Text style={styles.understandingKicker}>ALLWAIN LO CONVIERTE EN FECHA</Text>
        <Text style={styles.understandingTitle}>
          {interpreted?.label || "Aún necesito una fecha más clara"}
        </Text>
        <Text style={styles.understandingText}>
          {interpreted
            ? `Esto se guardará en el acuerdo para organizar pedidos y entregas. Confianza ${interpreted.confidence} %.`
            : "Prueba con algo como mañana por la tarde, antes del viernes o de 17 a 20."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 14,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  actionIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  offerIcon: { backgroundColor: colors.seller },
  requestIcon: { backgroundColor: colors.highlight },
  headerCopy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  title: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  missingText: { flex: 1, minWidth: 150, color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  summary: { borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 8, gap: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  summaryLabel: { color: colors.mutedText, fontSize: 13, fontWeight: "700" },
  summaryValue: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700", textAlign: "right" },
  summaryStrong: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "right" },
  editor: { gap: 11 },
  field: { gap: 5 },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: "#FFFFFF", color: colors.text, fontSize: 14 },
  multilineInput: { minHeight: 78, textAlignVertical: "top" },
  twoColumns: { flexDirection: "row", gap: 9 },
  column: { flex: 1, minWidth: 0 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: { minHeight: 42, minWidth: 54, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.highlight },
  choiceText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  choiceTextSelected: { color: colors.primary },
  actions: { gap: 8 },
  cancelButton: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.mutedText, fontSize: 13, fontWeight: "800" },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: 7, backgroundColor: "#FFF4DB", borderRadius: 8, padding: 10 },
  hintText: { flex: 1, color: "#7A5612", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  understandingCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#FFD0C6",
    borderRadius: 8,
    backgroundColor: "#FFF7F4",
    padding: 10,
  },
  understandingCopy: { flex: 1, minWidth: 0 },
  understandingKicker: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  understandingTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "900", marginTop: 2 },
  understandingText: { color: colors.mutedText, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
});
