import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../theme/colors";

type SearchItem = {
  id: string;
  name: string;
  price: string;
  company: string;
};

const mockResults: SearchItem[] = [
  { id: "1", name: "Acero galvanizado", price: "320 €", company: "Empresa A" },
  { id: "2", name: "Cableado industrial", price: "180 €", company: "Empresa B" },
  { id: "3", name: "Energía renovable", price: "48 € / MWh", company: "Empresa A" },
  { id: "4", name: "Transporte marítimo", price: "1.120 €", company: "Empresa B" },
];

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const navigation = useNavigation<any>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>¿Qué estás buscando?</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Buscar productos o servicios"
          placeholderTextColor="#8c8c8c"
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity style={styles.button} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Buscar mejor precio</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionCard, styles.highlighted]}
          onPress={() => navigation.navigate("Escanear")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Escanear</Text>
          <Text style={styles.actionBody}>
            Lanza el flujo demo conectado al backend y ve el resultado.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("Resultado")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Ver último resultado</Text>
          <Text style={styles.actionBody}>Abre la vista con el resultado del demo.</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subheading}>Resultados sugeridos</Text>
      {mockResults.map((item) => (
        <View key={item.id} style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>{item.name}</Text>
            <Text style={styles.resultPrice}>{item.price}</Text>
          </View>
          <Text style={styles.resultCompany}>{item.company}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  subheading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.button,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: "800",
    fontSize: 15,
  },
  actionsRow: {
    flexDirection: "row",
    columnGap: 12,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  highlighted: {
    borderColor: colors.button,
    borderWidth: 1.2,
    backgroundColor: "#fff7f3",
  },
  actionTitle: { color: colors.text, fontWeight: "800", marginBottom: 4 },
  actionBody: { color: "#6c6c6c", fontWeight: "700" },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  resultTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  resultPrice: {
    color: colors.text,
    fontWeight: "800",
  },
  resultCompany: {
    color: "#6c6c6c",
    fontWeight: "600",
  },
});
