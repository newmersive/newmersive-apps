import React from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { colors } from "../../config/theme";

type Trade = {
  id: string;
  title: string;
  description: string;
  tokens: number;
};

const trades: Trade[] = [
  {
    id: "1",
    title: "Clases de guitarra",
    description: "Intercambio por clases de inglés",
    tokens: 25,
  },
  {
    id: "2",
    title: "Diseño de logo",
    description: "Busco consultoría de marketing",
    tokens: 40,
  },
  {
    id: "3",
    title: "Sesión de fotos",
    description: "Trueque por edición de video",
    tokens: 32,
  },
];

export default function TradesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trueques destacados</Text>
      <FlatList
        data={trades}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
            <Text style={styles.tokens}>{`~${item.tokens} tokens`}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  description: {
    color: colors.muted,
    marginBottom: 8,
  },
  tokens: {
    color: colors.primary,
    fontWeight: "700",
  },
});
