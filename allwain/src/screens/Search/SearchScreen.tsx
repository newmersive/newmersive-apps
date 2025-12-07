import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../theme/colors";
import { AppStackParamList, AppTabParamList } from "../../navigation/types";

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

type SearchNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<AppTabParamList, "Buscar">,
  NativeStackNavigationProp<AppStackParamList>
>;

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const navigation = useNavigation<SearchNavigationProp>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>¿Qué estás buscando?</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Buscar productos o servicios"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
        />
        <TouchableOpacity style={styles.button} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Buscar mejor precio</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("Scan")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Escanear</Text>
          <Text style={styles.actionBody}>Lanza el flujo demo conectado al backend</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate("DemoLanding")}
          activeOpacity={0.9}
        >
          <Text style={styles.actionTitle}>Demo AI pricing</Text>
          <Text style={styles.actionBody}>Prueba el flujo guiado sin salir de Allwain</Text>
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
    shadowColor: colors.dark,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
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
  actionsRow: {
    flexDirection: "row",
    columnGap: 12,
    marginBottom: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionTitle: { color: colors.dark, fontWeight: "800", marginBottom: 4 },
  actionBody: { color: colors.muted, fontWeight: "700" },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
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
    color: colors.muted,
    fontWeight: "600",
  },
});
