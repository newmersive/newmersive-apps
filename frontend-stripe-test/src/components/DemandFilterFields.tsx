import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { demandFilterCopy } from "../i18n/demandFilterCopy";
import type { DiscoveryQuery } from "../utils/discoveryFilters";
import { colors } from "../theme/colors";

export default function DemandFilterFields({ value, onChange, lists = false, own = false }: { value: DiscoveryQuery; onChange: (value: DiscoveryQuery) => void; lists?: boolean; own?: boolean }) {
  const { locale } = useAppTranslation();
  const c = demandFilterCopy[locale];
  function choice(field: "responseStatus" | "deliveryChannel", options: string[]) {
    return <View style={styles.choices}>{options.map(option => <TouchableOpacity key={option} accessibilityRole="button" accessibilityState={{ selected: (value[field] || "") === option }} onPress={() => onChange({ ...value, [field]: option })} style={[styles.choice, (value[field] || "") === option && styles.selected]}><Text style={styles.choiceText}>{option ? c[option as keyof typeof c] : c.all}</Text></TouchableOpacity>)}</View>;
  }
  return <View style={styles.fields}>
    <Text style={styles.hint}>{c.priceHint}</Text>
    {!own ? <><Text style={styles.label}>{c.response}</Text>{choice("responseStatus", ["", "none", "active", "any", "selected", "withdrawn", "expired"])}</> : null}
    {lists ? <>
      <Text style={styles.label}>{c.channel}</Text>{choice("deliveryChannel", ["", "pickup", "seller", "carrier", "local_connector"])}
      <Text style={styles.label}>{c.deadline}</Text>
      <View style={styles.choices}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !value.proposalDeadlineBefore }} onPress={() => onChange({ ...value, proposalDeadlineBefore: "", proposalDeadlineAfter: "" })} style={[styles.choice, !value.proposalDeadlineBefore && styles.selected]}><Text style={styles.choiceText}>{c.all}</Text></TouchableOpacity>
        {[3, 7, 30].map(days => {
          const date = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
          const selected = value.proposalDeadlineBefore === date;
          return <TouchableOpacity key={days} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onChange({ ...value, proposalDeadlineBefore: date, proposalDeadlineAfter: "" })} style={[styles.choice, selected && styles.selected]}><Text style={styles.choiceText}>{c.days.replace("{n}", String(days))}</Text></TouchableOpacity>;
        })}
      </View>
      <Text style={styles.hint}>{c.deadlineHint}</Text>
    </> : null}
  </View>;
}
const styles = StyleSheet.create({ fields: { gap: 8 }, label: { color: colors.text, fontWeight: "800", fontSize: 13 }, hint: { color: colors.mutedText, fontSize: 12, lineHeight: 17 }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, choice: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, padding: 10, minHeight: 44, justifyContent: "center" }, selected: { borderColor: colors.primary, backgroundColor: colors.highlight }, choiceText: { color: colors.text, fontSize: 12, fontWeight: "700" } });
