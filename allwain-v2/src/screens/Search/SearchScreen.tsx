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
    backgroundColor: "#ffe9e2",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  heading: {
    color: "#1b1b1b",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  subheading: {
    color: "#1b1b1b",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1b1b1b",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f0c6b8",
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f0c6b8",
    color: "#1b1b1b",
  },
  button: {
    backgroundColor: "#1b1b1b",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: "#ffffff",
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
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f0c6b8",
  },
  highlighted: {
    borderColor: "#1b1b1b",
    borderWidth: 1.2,
    backgroundColor: "#fff5f1",
  },
  actionTitle: { color: "#1b1b1b", fontWeight: "800", marginBottom: 4 },
  actionBody: { color: "#6c6c6c", fontWeight: "700" },
  resultCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f0c6b8",
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  resultTitle: {
    color: "#1b1b1b",
    fontWeight: "700",
    fontSize: 16,
  },
  resultPrice: {
    color: "#1b1b1b",
    fontWeight: "800",
  },
  resultCompany: {
    color: "#6c6c6c",
    fontWeight: "600",
  },
});
