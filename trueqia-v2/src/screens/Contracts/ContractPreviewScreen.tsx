import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { apiAuthPost } from "../../config/api";
import { colors } from "../../config/theme";
import { useAuthStore } from "../../store/auth.store";
import { TrueqiaOffer } from "../../store/offers.store";
import { Trade } from "../../store/trades.store";

type ContractPreviewScreenProps = {
  route: {
    params?: {
      offer?: TrueqiaOffer;
      trade?: Trade;
    };
  };
};

export default function ContractPreviewScreen({ route }: ContractPreviewScreenProps) {
  const offer: TrueqiaOffer | undefined = route.params?.offer;
  const trade: Trade | undefined = route.params?.trade;
  const user = useAuthStore((s) => s.user);

  const [requesterName, setRequesterName] = useState(
    trade?.participants?.[0] || user?.name || "Solicitante",
  );
  const [providerName, setProviderName] = useState(
    trade?.participants?.[1] || offer?.owner?.name || "Proveedor",
  );
  const [tokens, setTokens] = useState(
    offer?.tokens !== undefined
      ? String(offer.tokens)
      : trade?.tokens !== undefined
      ? String(trade.tokens)
      : "10",
  );
  const [notes, setNotes] = useState("");
  const [contractText, setContractText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offerTitle = useMemo(
    () => trade?.title || offer?.title || "Oferta pendiente",
    [offer?.title, trade?.title],
  );

  const payload = useMemo(
    () => ({
      app: "trueqia",
      title: offerTitle,
      fromUserId: user?.id,
      toUserId: trade?.ownerId || offer?.owner?.id,
      tokens: Number(tokens) || 0,
      offerId: offer?.id || trade?.offerId,
      tradeId: trade?.id,
      requesterName: requesterName.trim(),
      providerName: providerName.trim(),
      notes: notes.trim(),
      description: offer?.description || trade?.title,
    }),
    [
      offer?.description,
      offer?.id,
      offerTitle,
      providerName,
      requesterName,
      tokens,
      trade?.id,
      trade?.offerId,
      trade?.ownerId,
      trade?.title,
      user?.id,
      notes,
    ],
  );

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiAuthPost<{ contractText: string }>(
        "/trueqia/contracts/preview",
        payload,
      );
      setContractText(res.contractText);
    } catch (err: any) {
      setError(
        err?.message === "SESSION_EXPIRED"
          ? "Sesión expirada, vuelve a iniciar sesión."
          : "No se pudo generar el contrato en este momento.",
      );
      setContractText(null);
    } finally {
      setLoading(false);
    }
  }

  useEffe

