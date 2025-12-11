import React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";
import { UserAvatar } from "./UserAvatar";

export default function SponsorsScreen() {
  const user = useAuthStore((s) => s.user);

  const sponsorCode = user?.qrCode || user?.sponsorCode || "SIN-CODIGO";
  const tokensFromInvites = user?.tokensFromInvites ?? 0;
  const invitedUsers = user?.invitedUsers ?? [];
  const totalTokens = (user?.tokens ?? 0) + tokensFromInvites;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Patrocinadores</Text>
      <Text style={styles.subtitle}>
        Comparte tu código personal y mira cómo crece tu red de invitados.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Tu código de patrocinador</Text>
        <View style={styles.qrBox}>
          <Image
            source={{
              uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                sponsorCode,
              )}`,
            }}
            style={styles.qrImage}
          />
        </View>
        <Text style={styles.code}>{sponsorCode}</Text>
        <Text style={styles.helper}>
          Comparte este QR para invitar a otras personas a TrueQIA y ganar tokens.
        </Text>

        <View style={styles.tokensRow}>
          <View>
            <Text style={styles.label}>Tokens ganados por invitaciones</Text>
            <Text style={styles.tokenValue}>{tokensFromInvites}</Text>
            <Text style={styles.helper}>Valor calculado desde el backend.</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>Tokens actuales</Text>
            <Text style={styles.tokenValue}>{totalTokens}</Text>
            <Text style={styles.helper}>Incluye tus tokens y referidos.</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Invitados</Text>
        {invitedUsers.length === 0 ? (
          <Text style={styles.empty}>Aún no hay invitados registrados para este código.</Text>
        ) : (
          invitedUsers.map((invited) => (
            <View key={invited.id} style={styles.invitedRow}>
              <UserAvatar
                name={invited.name}
                email={invited.email}
                avatarUrl={invited.avatarUrl}
                size={48}
              />
              <View style={styles.invitedInfo}>
                <Text style={styles.invitedName}>{invited.name}</Text>
                {invited.email && <Text style={styles.invitedEmail}>{invited.email}</Text>}
                {typeof invited.tokensEarned === "number" && (
                  <Text style={styles.invitedTokens}>+{invited.tokensEarned} tokens</Text>
                )}
                {typeof invited.tokensAwarded === "number" && invited.tokensEarned === undefined && (
                  <Text style={styles.invitedTokens}>+{invited.tokensAwarded} tokens</Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  qrBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F4F6FC",
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  code: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
  },
  helper: {
    color: colors.muted,
    marginTop: 4,
  },
  tokensRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  tokenValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  empty: {
    color: colors.muted,
  },
  invitedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  invitedInfo: {
    flex: 1,
  },
  invitedName: {
    fontWeight: "700",
    color: colors.text,
  },
  invitedEmail: {
    color: colors.muted,
    marginTop: 2,
  },
  invitedTokens: {
    color: colors.primary,
    marginTop: 2,
    fontWeight: "700",
  },
});

