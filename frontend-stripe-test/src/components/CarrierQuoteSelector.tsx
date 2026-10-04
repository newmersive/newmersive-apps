import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, Truck } from "lucide-react-native";

import {
  apiAuthPost,
  type AllwainCarrierQuote,
  type AllwainOffer,
} from "../config/api";
import { colors } from "../theme/colors";
import { formatCurrency } from "../utils/format";

type Address = {
  addressLine1: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phone?: string;
};

export default function CarrierQuoteSelector({
  offer,
  quantity,
  address,
  selectedQuoteId,
  onSelect,
}: {
  offer: AllwainOffer;
  quantity: number;
  address: Address;
  selectedQuoteId?: string | null;
  onSelect: (quote: AllwainCarrierQuote | null) => void;
}) {
  const [quotes, setQuotes] = useState<AllwainCarrierQuote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quote() {
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      address.addressLine1.trim().length < 4 ||
      address.postalCode.trim().length < 3 ||
      address.city.trim().length < 2
    ) {
      setError("Completa calle, código postal y localidad para calcular el envío.");
      return;
    }
    setBusy(true);
    setError(null);
    onSelect(null);
    try {
      const response = await apiAuthPost<{
        quoteRequestId: string;
        quotes: AllwainCarrierQuote[];
      }>("/allwain/shipping/quotes", {
        offerId: offer.id,
        quantity,
        addressLine1: address.addressLine1.trim(),
        postalCode: address.postalCode.trim(),
        city: address.city.trim(),
        countryCode: address.countryCode || "ES",
        phone: address.phone?.trim() || undefined,
      });
      const nextQuotes = response.quotes || [];
      if (!nextQuotes.length) throw new Error("No hay servicios disponibles para esta dirección.");
      setQuotes(nextQuotes);
      onSelect(nextQuotes[0]);
    } catch (quoteError: any) {
      setQuotes([]);
      setError(quoteError?.message || "No pudimos calcular el transporte.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.quoteButton, busy && styles.disabled]}
        onPress={() => void quote()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Truck size={18} color={colors.primary} />
        )}
        <Text style={styles.quoteButtonText}>
          {busy ? "Calculando..." : quotes.length ? "Volver a calcular" : "Calcular transporte"}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {quotes.map((item) => {
        const selected = item.id === selectedQuoteId;
        return (
          <TouchableOpacity
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onSelect(item)}
          >
            <View style={styles.copy}>
              <Text style={styles.name} numberOfLines={1}>
                {item.carrierName || "Mensajería"} · {item.serviceName}
              </Text>
              <Text style={styles.meta}>
                {item.leadTimeHours
                  ? `Entrega estimada en ${Math.max(1, Math.ceil(item.leadTimeHours / 24))} día(s)`
                  : "Seguimiento incluido cuando esté disponible"}
              </Text>
            </View>
            <Text style={styles.price}>
              {formatCurrency(item.amount / 100, item.currency)}
            </Text>
            <View style={[styles.check, selected && styles.checkSelected]}>
              {selected ? <Check size={14} color="#FFFFFF" /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
      {selectedQuoteId ? (
        <Text style={styles.notice}>
          Precio reservado para estos datos. Si cambias dirección o cantidad, vuelve a calcularlo.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  quoteButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.card,
  },
  quoteButtonText: { color: colors.primary, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  option: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: "#FFF7F4" },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: colors.text, fontWeight: "900", fontSize: 13 },
  meta: { color: colors.mutedText, fontWeight: "600", fontSize: 11 },
  price: { color: colors.text, fontWeight: "900", fontSize: 14 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: { color: colors.danger, fontWeight: "700", fontSize: 12, lineHeight: 17 },
  notice: { color: colors.mutedText, fontWeight: "600", fontSize: 11, lineHeight: 16 },
});
