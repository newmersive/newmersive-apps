import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart3, ShieldCheck } from "lucide-react-native";

import { useAuthStore } from "../store/auth.store";
import { colors } from "../theme/colors";
import {
  ANALYTICS_CONSENT_VERSION,
  configureAnalyticsConsent,
  trackAnalyticsEvent,
  type AnalyticsConsentState,
} from ".";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { applyAnalyticsConsentDecision, resolveAnalyticsConsent } from "./consentDecision";

const STORAGE_KEY = `allwain:analytics-consent:${ANALYTICS_CONSENT_VERSION}`;

type AnalyticsConsentContextValue = {
  status: AnalyticsConsentState;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  decide: (granted: boolean) => Promise<void>;
};

const AnalyticsConsentContext = createContext<AnalyticsConsentContextValue | null>(
  null,
);

function asStoredStatus(value: string | null): AnalyticsConsentState {
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function useAnalyticsConsent() {
  const value = useContext(AnalyticsConsentContext);
  if (!value) {
    throw new Error("useAnalyticsConsent must be used inside AnalyticsConsentProvider");
  }
  return value;
}

export default function AnalyticsConsentProvider({
  children,
  promptEnabled,
}: {
  children: React.ReactNode;
  promptEnabled: boolean;
}) {
  const user = useAuthStore((state) => state.user);
  const authHydrated = useAuthStore((state) => state.hydrated);
  const setAccountAnalyticsConsent = useAuthStore(
    (state) => state.setAnalyticsConsent,
  );
  const { t } = useAppTranslation();
  const [status, setStatus] = useState<AnalyticsConsentState>("unknown");
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncedUserId = useRef<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        setStatus(asStoredStatus(stored));
      })
      .catch(() => {
        if (active) setStatus("unknown");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !authHydrated || busyRef.current) return;
    const remoteConsent = user?.analyticsConsent;
    const remoteVersion = user?.analyticsConsentVersion;

    const matchingRemote = remoteVersion === ANALYTICS_CONSENT_VERSION ? remoteConsent : undefined;
    const nextStatus = resolveAnalyticsConsent(status, matchingRemote);
    if (status !== nextStatus) {
      setStatus(nextStatus);
      void AsyncStorage.setItem(STORAGE_KEY, nextStatus).catch(() => setError(t("consent.syncError")));
    }
    void configureAnalyticsConsent(nextStatus === "granted").catch(() => setError(t("consent.syncError")));
    if (
      user?.id &&
      nextStatus !== "unknown" &&
      matchingRemote !== (nextStatus === "granted") &&
      syncedUserId.current !== user.id
    ) {
      syncedUserId.current = user.id;
      void setAccountAnalyticsConsent(nextStatus === "granted").catch(() => {
        syncedUserId.current = null;
        setError(t("consent.syncError"));
      });
    }
  }, [
    authHydrated,
    busy,
    hydrated,
    setAccountAnalyticsConsent,
    status,
    user?.analyticsConsent,
    user?.analyticsConsentVersion,
    user?.id,
    t,
  ]);

  const decide = useCallback(
    async (granted: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const nextStatus: AnalyticsConsentState = granted ? "granted" : "denied";
      setBusy(true);
      setError(null);
      setStatus(nextStatus);
      try {
        await applyAnalyticsConsentDecision(granted, {
          configure: configureAnalyticsConsent,
          store: (value) => AsyncStorage.setItem(STORAGE_KEY, value),
          sync: user?.id ? async () => {
            await setAccountAnalyticsConsent(granted);
            syncedUserId.current = user.id;
          } : undefined,
        });
        if (granted) {
          await trackAnalyticsEvent("analytics_consent_updated", { granted: true });
        }
      } catch {
        setStatus("denied");
        setError(t("consent.syncError"));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [setAccountAnalyticsConsent, t, user?.id],
  );

  const value = useMemo(
    () => ({ status, hydrated, busy, error, decide }),
    [busy, decide, error, hydrated, status],
  );

  return (
    <AnalyticsConsentContext.Provider value={value}>
      {children}
      <ConsentPrompt
        visible={promptEnabled && hydrated && status === "unknown"}
        busy={busy}
        onDecide={decide}
      />
    </AnalyticsConsentContext.Provider>
  );
}

function ConsentPrompt({
  visible,
  busy,
  onDecide,
}: {
  visible: boolean;
  busy: boolean;
  onDecide: (granted: boolean) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.panel}>
          <View style={styles.iconRow}>
            <View style={styles.iconBox}>
              <BarChart3 size={24} color={colors.primary} />
            </View>
            <ShieldCheck size={22} color={colors.seller} />
          </View>
          <Text style={styles.title}>{t("consent.title")}</Text>
          <Text style={styles.body}>{t("consent.body")}</Text>
          <Text style={styles.note}>{t("consent.note")}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.choiceButton}
              disabled={busy}
              onPress={() => void onDecide(false)}
            >
              <Text style={styles.choiceText}>{t("consent.essential")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.choiceButton}
              disabled={busy}
              onPress={() => void onDecide(true)}
            >
              {busy ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.choiceText}>{t("consent.allow")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20, 21, 20, 0.48)",
    padding: 16,
  },
  panel: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    padding: 20,
    gap: 10,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.highlight,
  },
  title: { color: colors.text, fontSize: 21, fontWeight: "900" },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  note: { color: colors.mutedText, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  choiceButton: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.seller,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
  },
  choiceText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    textAlign: "center",
  },
});
