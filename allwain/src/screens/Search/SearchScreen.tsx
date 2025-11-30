import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>¿Qué estás buscando?</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Buscar productos o servicios"
          placeholderTextColor="rgba(64,64,65,0.55)"
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity style={styles.button} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Buscar mejor precio</Text>
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
    backgroundColor: colors.salmon,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  heading: {
    color: colors.dark,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  subheading: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(64,64,65,0.18)",
    color: colors.dark,
  },
  button: {
    backgroundColor: colors.dark,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 15,
  },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  resultTitle: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 16,
  },
  resultPrice: {
    color: colors.dark,
    fontWeight: "800",
  },
  resultCompany: {
    color: "rgba(64,64,65,0.7)",
    fontWeight: "600",
  },
});
