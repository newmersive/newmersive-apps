import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Flag, MessageSquareReply, Star, X } from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPatch,
  apiAuthPost,
  type AllwainReview,
  type AllwainReputationSummary,
} from "../config/api";
import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import { EmptyState } from "./design-system";

function dateText(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function scoreText(value: number) {
  return value > 0 ? value.toFixed(1).replace(".", ",") : "Nuevo";
}

export default function ReputationModal({
  userId,
  visible,
  onClose,
}: {
  userId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [data, setData] = useState<AllwainReputationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    reviewId: string;
    kind: "response" | "report";
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setData(
        await apiAuthGet<AllwainReputationSummary>(
          `/allwain/reputation/users/${userId}`,
        ),
      );
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos cargar las opiniones.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!visible || !userId) return;
    setEditor(null);
    setDraft("");
    setNotice(null);
    void load();
  }, [load, userId, visible]);

  function openEditor(reviewId: string, kind: "response" | "report") {
    setEditor({ reviewId, kind });
    setDraft("");
    setError(null);
    setNotice(null);
  }

  async function submitReviewAction(review: AllwainReview) {
    const text = draft.trim();
    if (!editor || editor.reviewId !== review.id || !text) {
      setError(
        editor?.kind === "report"
          ? "Explica brevemente qué debemos revisar."
          : "Escribe una respuesta antes de publicarla.",
      );
      return;
    }
    setBusyReviewId(review.id);
    setError(null);
    try {
      if (editor.kind === "response") {
        const updated = await apiAuthPatch<AllwainReview>(
          `/allwain/reputation/reviews/${review.id}/response`,
          { response: text },
        );
        setData((current) =>
          current
            ? {
                ...current,
                reviews: current.reviews.map((item) =>
                  item.id === review.id ? updated : item,
                ),
              }
            : current,
        );
        setNotice("Tu respuesta ya aparece junto a la opinión.");
      } else {
        await apiAuthPost<AllwainReview>(
          `/allwain/reputation/reviews/${review.id}/report`,
          { reason: text },
        );
        await load();
        setNotice("La opinión se ha enviado a revisión.");
      }
      setEditor(null);
      setDraft("");
    } catch (actionError: any) {
      setError(actionError?.message || "No pudimos guardar esta acción.");
    } finally {
      setBusyReviewId(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.eyebrow}>REPUTACIÓN VERIFICADA</Text>
            <Text style={styles.name}>{data?.user.name || "Opiniones"}</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Cerrar opiniones" style={styles.close} onPress={onClose}>
            <X size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : error ? (
            <View style={styles.center}><Text style={styles.error}>{error}</Text></View>
          ) : data ? (
            <>
              <View style={styles.summary}>
                <Star size={28} color={colors.primary} fill={colors.primary} />
                <View style={styles.summaryCopy}>
                  <Text style={styles.score}>{scoreText(data.score)}</Text>
                  <Text style={styles.summaryText}>
                    {data.reviewCount} opinión{data.reviewCount === 1 ? "" : "es"} · {data.completedOrders} {data.completedOrders === 1 ? "operación completada" : "operaciones completadas"}
                  </Text>
                </View>
              </View>
              {data.reviews.length === 0 ? (
                <EmptyState
                  title="Todavía no hay opiniones"
                  body="Solo cuentan valoraciones de operaciones entregadas."
                  demo={{
                    title: "Entrega puntual y producto cuidado",
                    meta: "5 de 5 · Compra verificada",
                    detail: "Las opiniones reales mostrarán autor, fecha y respuesta del vendedor.",
                    leading: <Star size={19} color={colors.primary} fill={colors.primary} />,
                  }}
                />
              ) : (
                <View style={styles.list}>
                  {data.reviews.map((review) => (
                    <View key={review.id} style={styles.review}>
                      <View style={styles.reviewTop}>
                        <Text style={styles.author}>{review.author?.name || "Usuario Allwain"}</Text>
                        <Text style={styles.date}>{dateText(review.createdAt)}</Text>
                      </View>
                      <View style={styles.stars} accessibilityLabel={`${review.rating} de 5 estrellas`}>
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            size={16}
                            color={index < review.rating ? colors.primary : colors.cardBorder}
                            fill={index < review.rating ? colors.primary : "transparent"}
                          />
                        ))}
                      </View>
                      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
                      {review.response ? (
                        <View style={styles.response}>
                          <Text style={styles.responseLabel}>Respuesta</Text>
                          <Text style={styles.responseText}>{review.response}</Text>
                        </View>
                      ) : null}
                      {currentUserId === review.subjectUserId ? (
                        <>
                          <View style={styles.actions}>
                            {!review.response ? (
                              <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityLabel={`Responder a la opinión de ${review.author?.name || "este usuario"}`}
                                style={styles.action}
                                onPress={() => openEditor(review.id, "response")}
                              >
                                <MessageSquareReply size={17} color={colors.text} />
                                <Text style={styles.actionText}>Responder</Text>
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Informar sobre la opinión de ${review.author?.name || "este usuario"}`}
                              style={styles.action}
                              onPress={() => openEditor(review.id, "report")}
                            >
                              <Flag size={16} color={colors.mutedText} />
                              <Text style={styles.secondaryActionText}>Informar</Text>
                            </TouchableOpacity>
                          </View>
                          {editor?.reviewId === review.id ? (
                            <View style={styles.editor}>
                              <Text style={styles.editorTitle}>
                                {editor.kind === "response"
                                  ? "Tu respuesta pública"
                                  : "¿Qué debemos revisar?"}
                              </Text>
                              <TextInput
                                accessibilityLabel={
                                  editor.kind === "response"
                                    ? "Respuesta pública"
                                    : "Motivo del aviso"
                                }
                                value={draft}
                                onChangeText={setDraft}
                                placeholder={
                                  editor.kind === "response"
                                    ? "Escribe una respuesta breve"
                                    : "Describe el problema sin incluir datos privados"
                                }
                                placeholderTextColor={colors.mutedText}
                                style={styles.input}
                                multiline
                                maxLength={editor.kind === "response" ? 1000 : 1000}
                              />
                              <View style={styles.editorActions}>
                                <TouchableOpacity
                                  accessibilityRole="button"
                                  style={styles.cancel}
                                  onPress={() => {
                                    setEditor(null);
                                    setDraft("");
                                  }}
                                >
                                  <Text style={styles.cancelText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  accessibilityRole="button"
                                  style={[styles.submit, !draft.trim() && styles.disabled]}
                                  disabled={!draft.trim() || busyReviewId === review.id}
                                  onPress={() => void submitReviewAction(review)}
                                >
                                  {busyReviewId === review.id ? (
                                    <ActivityIndicator color={colors.buttonText} />
                                  ) : (
                                    <Text style={styles.submitText}>
                                      {editor.kind === "response" ? "Publicar" : "Enviar"}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : null}
                        </>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.cardBorder, backgroundColor: colors.card },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  name: { color: colors.text, fontSize: 20, fontWeight: "900" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 18, paddingBottom: 40, gap: 18 },
  center: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
  notice: { color: colors.success, fontWeight: "800", textAlign: "center" },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  summaryCopy: { flex: 1, minWidth: 0 },
  score: { color: colors.text, fontSize: 30, fontWeight: "900" },
  summaryText: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  list: { gap: 0, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  review: { gap: 8, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  author: { flex: 1, color: colors.text, fontWeight: "900" },
  date: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  stars: { flexDirection: "row", gap: 3 },
  comment: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  response: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 10, gap: 3 },
  responseLabel: { color: colors.primary, fontSize: 10, fontWeight: "900" },
  responseText: { color: colors.mutedText, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  action: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 6 },
  actionText: { color: colors.text, fontWeight: "800" },
  secondaryActionText: { color: colors.mutedText, fontWeight: "800" },
  editor: { gap: 9, paddingTop: 4 },
  editorTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  input: { minHeight: 78, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, color: colors.text, padding: 11, textAlignVertical: "top" },
  editorActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  cancelText: { color: colors.mutedText, fontWeight: "800" },
  submit: { minWidth: 110, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primary, paddingHorizontal: 14 },
  submitText: { color: colors.buttonText, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
