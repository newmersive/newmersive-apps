import React from "react";
import { ScrollView, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { colors } from "../../theme/colors";

type Deal = {
  id: string;
  name: string;
  price: string;
  saving: string;
};

const deals: Deal[] = [
  { id: "d1", name: "Compra conjunta de acero", price: "289 €", saving: "Ahorro estimado: 14 %" },
  { id: "d2", name: "Lote de cableado premium", price: "150 €", saving: "Ahorro estimado: 22 €" },
  { id: "d3", name: "Energía verde trimestral", price: "45 € / MWh", saving: "Ahorro estimado: 8 %" },
];

export default function DealsScreen() {
  function showDeal(deal: Deal) {
    Alert.alert("Oferta", `${deal.name}\nPrecio: ${deal.price}\n${deal.saving}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Ofertas destacadas</Text>
      {deals.map((deal) => (
        <TouchableOpacity
          key={deal.id}
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => showDeal(deal)}
        >
          <Text style={styles.title}>{deal.name}</Text>
          <Text style={styles.price}>{deal.price}</Text>
          <Text style={styles.saving}>{deal.saving}</Text>
        </TouchableOpacity>
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
    padding: 20,
    paddingBottom: 32,
  },
  heading: {
    color: colors.dark,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  title: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
  },
  price: {
    color: colors.dark,
    fontWeight: "800",
    marginBottom: 4,
  },
  saving: {
    color: "rgba(64,64,65,0.7)",
    fontWeight: "700",
  },
});
