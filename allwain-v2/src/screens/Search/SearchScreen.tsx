import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiAuthGet, AllwainOffer } from "../../config/api";
import { colors } from "../../theme/colors";

type Product = {
  id: string;
  name: string;
  brand?: string;
  description?: string;
  ean?: string;
};

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [offers, setOffers] = useState<AllwainOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);

  const parseProducts = (data: any): Product[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data as Product[];
    if (Array.isArray(data.items)) return data.items as Product[];
    if (data.product) return [data.product as Product];
    return [];
  };

  const parseOffers = (data: any): AllwainOffer[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data as AllwainOffer[];
    if (Array.isArray(data.items)) return data.items as AllwainOffer[];
    return [];
  };

  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Introduce un EAN o texto para buscar");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setNoResults(false);
      setProduct(null);
      setOffers([]);

      const productResponse = await apiAuthGet<any>(
        `/allwain/products?ean=${encodeURIComponent(trimmedQuery)}`,
      );
      const foundProducts = parseProducts(productResponse);
      const foundProduct = foundProducts[0];

      if (!foundProduct) {
        setNoResults(true);
        return;
      }

      setProduct(foundProduct);

      const offersResponse = await apiAuthGet<any>(
        `/allwain/offers?productId=${encodeURIComponent(foundProduct.id)}`,
      );
      const parsedOffers = parseOffers(offersResponse);
      setOffers(parsedOffers);

      if (!parsedOffers.length) {
        setNoResults(true);
      }
    } catch (err: any) {
      setError(err?.message || "No se pudo completar la búsqueda");
    } finally {
      setLoading(false);
    }
  };

  const renderOffer = ({ item }: { item: AllwainOffer }) => (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultTitle}>{item.title}</Text>
        {typeof item.price === "number" ? (
          <Text style={styles.resultPrice}>€{item.price.toFixed(2)}</Text>
        ) : null}
      </View>
      {item.description ? (
        <Text style={styles.resultBody}>{item.description}</Text>
      ) : null}
      {item.tokens ? (
        <Text style={styles.resultMeta}>Tokens: {item.tokens}</Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Encuentra el mejor precio</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Producto o EAN</Text>
        <TextInput
          style={styles.input}
          placeholder="Introduce un EAN o texto"
          placeholderTextColor={colors.mutedText}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.9}
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text style={styles.buttonText}>Buscar</Text>
          )}
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {loading && !product ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Buscando productos…</Text>
        </View>
      ) : null}

      {noResults && !loading ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>
            No se han encontrado productos para esta búsqueda.
          </Text>
        </View>
      ) : null}

      {product ? (
        <View style={styles.productCard}>
          <Text style={styles.subheading}>Producto encontrado</Text>
          <Text style={styles.productTitle}>{product.name}</Text>
          {product.brand ? (
            <Text style={styles.productMeta}>Marca: {product.brand}</Text>
          ) : null}
          {product.ean ? (
            <Text style={styles.productMeta}>EAN: {product.ean}</Text>
          ) : null}
          {product.description ? (
            <Text style={styles.productDesc}>{product.description}</Text>
          ) : null}
        </View>
      ) : null}

      {product ? (
        <View style={styles.offersSection}>
          <Text style={styles.subheading}>Ofertas disponibles</Text>
          <FlatList
            data={offers}
            keyExtractor={(item) => item.id}
            renderItem={renderOffer}
            scrollEnabled={false}
            ListEmptyComponent={
              <Text style={styles.stateText}>
                No hay ofertas activas para este producto.
              </Text>
            }
            contentContainerStyle={{ gap: 10 }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 14,
  },
  label: { color: colors.mutedText, fontWeight: "700", marginBottom: 6 },
  subheading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
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
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: { color: colors.buttonText, fontWeight: "800", fontSize: 15 },
  error: { color: colors.danger, fontWeight: "700", marginTop: 8 },
  stateBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
    marginBottom: 10,
  },
  stateText: { color: colors.text, fontWeight: "700" },
  productCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  productTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  productMeta: { color: colors.mutedText, fontWeight: "700", marginBottom: 4 },
  productDesc: { color: colors.text, fontWeight: "600" },
  offersSection: { gap: 10 },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  resultTitle: { color: colors.text, fontWeight: "700", fontSize: 16 },
  resultPrice: { color: colors.text, fontWeight: "800" },
  resultBody: { color: colors.text, fontWeight: "600", marginTop: 2 },
  resultMeta: { color: colors.mutedText, fontWeight: "700", marginTop: 4 },
});
