import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CheckCircle2, Star } from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPost,
  type AllwainOrderReviewState,
  type AllwainReview,
} from "../config/api";
import { colors } from "../theme/colors";

function roleLabel(role: string) {
  if (role === "seller") return "vendedor";
  if (role === "connector") return "Conector";
  return "comprador";
}

export default function OrderReviewPanel({ orderId }: { orderId: string }) {
  const [state, setState] = useState<AllwainOrderReviewState | null>(null);
  const [ratingByUser, setRatingByUser] = useState<Record<string, number>>({});
  const [commentByUser, setCommentByUser] = useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setState(await apiAuthGet<AllwainOrderReviewState>(`/allwain/reputation/orders/${orderId}`));
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos cargar las valoraciones.");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(subjectUserId: string) {
    const rating = ratingByUser[subjectUserId] || 0;
    if (!rating) {
      setError("Elige de 1 a 5 estrellas.");
      return;
    }
    setBusyUserId(subjectUserId);
    setError(null);
    try {
      const review = await apiAuthPost<AllwainReview>(
        `/allwain/reputation/orders/${orderId}/reviews`,
        { subjectUserId, rating, comment: commentByUser[subjectUserId] || undefined },
      );
      setState((current) => current ? {
        ...current,
        targets: current.targets.map((target) => target.id === subjectUserId ? { ...target, review } : target),
      } : current);
    } catch (submitError: any) {
      setError(
        submitError?.message === "REVIEW_ALREADY_EXISTS"
          ? "Esta operación ya está valorada."
          : submitError?.message || "No pudimos guardar tu opinión.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  if (!state?.eligible || state.targets.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>¿Cómo fue?</Text>
      <Text style={styles.help}>Tu opinión solo puede publicarse porque este pedido consta como entregado.</Text>
      {state.targets.map((target) => (
        <View key={target.id} style={styles.target}>
          <Text style={styles.targetName}>{target.name}</Text>
          <Text style={styles.role}>{roleLabel(target.role)}</Text>
          {target.review ? (
            <View style={styles.saved}>
              <CheckCircle2 size={18} color={colors.success} />
              <Text style={styles.savedText}>Valorado con {target.review.rating} de 5</Text>
            </View>
          ) : (
            <>
              <View style={styles.stars}>
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  const selected = value <= (ratingByUser[target.id] || 0);
                  return (
                    <TouchableOpacity
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={`${value} de 5 estrellas para ${target.name}`}
                      style={styles.starButton}
                      onPress={() => setRatingByUser((current) => ({ ...current, [target.id]: value }))}
                    >
                      <Star size={25} color={selected ? colors.primary : colors.cardBorder} fill={selected ? colors.primary : "transparent"} />
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                accessibilityLabel={`Opinión sobre ${target.name}`}
                value={commentByUser[target.id] || ""}
                onChangeText={(comment) => setCommentByUser((current) => ({ ...current, [target.id]: comment }))}
                placeholder="Cuenta brevemente cómo fue (opcional)"
                placeholderTextColor={colors.mutedText}
                style={styles.input}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.submit, !ratingByUser[target.id] && styles.disabled]}
                disabled={!ratingByUser[target.id] || busyUserId === target.id}
                onPress={() => void submit(target.id)}
              >
                {busyUserId === target.id ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <Text style={styles.submitText}>Publicar opinión</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: "900" },
  help: { color: colors.mutedText, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  target: { gap: 8, paddingVertical: 8 },
  targetName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  role: { color: colors.mutedText, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  stars: { flexDirection: "row", alignItems: "center", gap: 2 },
  starButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 72, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, color: colors.text, padding: 11, textAlignVertical: "top" },
  submit: { minHeight: 46, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, paddingHorizontal: 14 },
  submitText: { color: colors.buttonText, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  saved: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 },
  savedText: { color: colors.success, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700" },
});
