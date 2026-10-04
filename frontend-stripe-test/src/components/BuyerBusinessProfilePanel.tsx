import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { ArrowLeft, CheckCircle2 } from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPatch,
  type AllwainComplianceProfile,
  type AllwainFiscalProfile,
} from "../config/api";
import { colors } from "../theme/colors";
import { BigActionButton } from "./design-system";

type Draft = {
  legalForm: string;
  legalName: string;
  taxId: string;
  countryCode: string;
  vatRegime: string;
  reagpActivity: string;
  ownProduction: boolean;
  invoiceEmail: string;
  billingAddress: string;
};

const EMPTY: Draft = {
  legalForm: "company",
  legalName: "",
  taxId: "",
  countryCode: "ES",
  vatRegime: "unknown",
  reagpActivity: "agricultural_forestry",
  ownProduction: false,
  invoiceEmail: "",
  billingAddress: "",
};

function fromProfile(profile: AllwainFiscalProfile | null): Draft {
  if (!profile) return EMPTY;
  return {
    legalForm: profile.legalForm || EMPTY.legalForm,
    legalName: profile.legalName || "",
    taxId: profile.taxId || "",
    countryCode: profile.countryCode || "ES",
    vatRegime: profile.vatRegime || "unknown",
    reagpActivity: profile.reagpActivity || EMPTY.reagpActivity,
    ownProduction: profile.ownProduction === true,
    invoiceEmail: profile.invoiceEmail || "",
    billingAddress: String(profile.billingAddress?.formatted || ""),
  };
}

export default function BuyerBusinessProfilePanel({
  onReadyChange,
  allowEdit = false,
}: {
  onReadyChange: (ready: boolean) => void;
  allowEdit?: boolean;
}) {
  const [profile, setProfile] = useState<AllwainFiscalProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmed, setConfirmed] = useState(false);
  const [mandateAccepted, setMandateAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAuthGet<AllwainComplianceProfile>(
        "/allwain/compliance/profile",
      );
      const business =
        response.profiles.find((item) => item.kind === "business") || null;
      const isReady =
        response.readiness.business && response.readiness.documentMandate;
      setProfile(business);
      setDraft(fromProfile(business));
      setMandateAccepted(Boolean(business?.documentMandateActive));
      setReady(isReady);
      onReadyChange(isReady);
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos cargar los datos de empresa.");
      onReadyChange(false);
    } finally {
      setLoading(false);
    }
  }, [onReadyChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const payload = useMemo(
    () => ({
      kind: "business",
      legalForm: draft.legalForm,
      legalName: draft.legalName.trim(),
      taxIdType: "NIF",
      taxId: draft.taxId.trim(),
      countryCode: draft.countryCode.trim().toUpperCase(),
      vatRegime: draft.vatRegime,
      reagpActivity:
        draft.vatRegime === "reagp" ? draft.reagpActivity : undefined,
      ownProduction:
        draft.vatRegime === "reagp" ? draft.ownProduction : undefined,
      invoiceEmail: draft.invoiceEmail.trim() || undefined,
      billingAddress: draft.billingAddress.trim()
        ? { formatted: draft.billingAddress.trim() }
        : undefined,
    }),
    [draft],
  );

  async function saveFirstStep() {
    if (!draft.legalName.trim() || !draft.taxId.trim()) {
      setError("Escribe el nombre legal y el NIF o CIF.");
      return;
    }
    if (!/^[A-Za-z]{2}$/.test(draft.countryCode.trim())) {
      setError("Usa un país de dos letras, por ejemplo ES.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await apiAuthPatch<AllwainFiscalProfile>(
        "/allwain/compliance/fiscal-profile",
        { ...payload, attest: false },
      );
      if (!saved.id || saved.legalName !== payload.legalName) {
        throw new Error("El servidor no confirmó los datos guardados.");
      }
      setProfile(saved);
      setStep(2);
    } catch (saveError: any) {
      setError(
        saveError?.message || "No pudimos guardar los datos de empresa.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (draft.vatRegime === "unknown") {
      setError("Indica la situación de IVA de la empresa.");
      return;
    }
    if (draft.vatRegime === "reagp" && !draft.ownProduction) {
      setError("Para confirmar REAGP debes indicar producción propia.");
      return;
    }
    if (!confirmed) {
      setError("Confirma que los datos son correctos.");
      return;
    }
    if (!mandateAccepted) {
      setError("Autoriza la generación del documento de esta operación.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await apiAuthPatch<AllwainFiscalProfile>(
        "/allwain/compliance/fiscal-profile",
        {
          ...payload,
          attest: true,
          documentMandateAccepted: mandateAccepted,
        },
      );
      const isReady =
        ["attested", "verified"].includes(saved.status) &&
        saved.documentMandateActive;
      if (!isReady) throw new Error("Los datos aún no están confirmados.");
      setProfile(saved);
      setReady(true);
      onReadyChange(true);
    } catch (saveError: any) {
      setError(
        saveError?.message || "No pudimos confirmar los datos de empresa.",
      );
      onReadyChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.panel}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (ready) {
    return (
      <View style={styles.readyPanel}>
        <CheckCircle2 size={22} color={colors.success} />
        <View style={styles.readyCopy}>
          <Text style={styles.title}>Datos de empresa listos</Text>
          <Text style={styles.help}>{profile?.legalName}</Text>
        </View>
        {allowEdit ? (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              setReady(false);
              setStep(1);
              setConfirmed(false);
            }}
          >
            <Text style={styles.editButtonText}>Editar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Datos para esta compra</Text>
        <Text style={styles.help}>{step} de 2</Text>
      </View>
      {step === 2 ? (
        <TouchableOpacity
          style={styles.back}
          onPress={() => setStep(1)}
          disabled={busy}
        >
          <ArrowLeft size={17} color={colors.text} />
          <Text style={styles.backText}>Atrás</Text>
        </TouchableOpacity>
      ) : null}

      {step === 1 ? (
        <View style={styles.fields}>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.pickerFrame}>
            <Picker
              selectedValue={draft.legalForm}
              onValueChange={(legalForm) =>
                setDraft((current) => ({
                  ...current,
                  legalForm: String(legalForm),
                }))
              }
              style={styles.picker}
            >
              <Picker.Item
                label="Autónomo o profesional"
                value="self_employed"
              />
              <Picker.Item label="Empresa" value="company" />
              <Picker.Item label="Cooperativa" value="cooperative" />
              <Picker.Item label="Asociación" value="association" />
              <Picker.Item label="Otra forma" value="other" />
            </Picker>
          </View>
          <Text style={styles.label}>Nombre legal</Text>
          <TextInput
            style={styles.input}
            value={draft.legalName}
            onChangeText={(legalName) =>
              setDraft((current) => ({ ...current, legalName }))
            }
            placeholder="Razón social o nombre completo"
            placeholderTextColor={colors.mutedText}
          />
          <Text style={styles.label}>NIF o CIF</Text>
          <TextInput
            style={styles.input}
            value={draft.taxId}
            onChangeText={(taxId) =>
              setDraft((current) => ({ ...current, taxId }))
            }
            autoCapitalize="characters"
            placeholder="B12345678"
            placeholderTextColor={colors.mutedText}
          />
          <Text style={styles.label}>País</Text>
          <TextInput
            style={styles.input}
            value={draft.countryCode}
            onChangeText={(countryCode) =>
              setDraft((current) => ({
                ...current,
                countryCode: countryCode.toUpperCase().slice(0, 2),
              }))
            }
            autoCapitalize="characters"
            placeholder="ES"
            placeholderTextColor={colors.mutedText}
          />
          <BigActionButton
            label="Guardar y seguir"
            busy={busy}
            onPress={() => void saveFirstStep()}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.fields}>
          <Text style={styles.label}>Situación de IVA</Text>
          <View style={styles.pickerFrame}>
            <Picker
              selectedValue={draft.vatRegime}
              onValueChange={(vatRegime) =>
                setDraft((current) => ({
                  ...current,
                  vatRegime: String(vatRegime),
                }))
              }
              style={styles.picker}
            >
              <Picker.Item label="Elige una opción" value="unknown" />
              <Picker.Item label="Régimen general" value="general" />
              <Picker.Item label="REAGP" value="reagp" />
              <Picker.Item label="Actividad exenta" value="exempt" />
              <Picker.Item label="Operación no sujeta" value="non_taxable" />
              <Picker.Item label="Otro" value="other" />
            </Picker>
          </View>
          {draft.vatRegime === "reagp" ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Producción propia</Text>
              <Switch
                value={draft.ownProduction}
                onValueChange={(ownProduction) =>
                  setDraft((current) => ({ ...current, ownProduction }))
                }
                trackColor={{ false: colors.cardBorder, true: colors.primary }}
                thumbColor={colors.card}
              />
            </View>
          ) : null}
          <Text style={styles.label}>Email para documentos</Text>
          <TextInput
            style={styles.input}
            value={draft.invoiceEmail}
            onChangeText={(invoiceEmail) =>
              setDraft((current) => ({ ...current, invoiceEmail }))
            }
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="administracion@empresa.es"
            placeholderTextColor={colors.mutedText}
          />
          <Text style={styles.label}>Dirección fiscal</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={draft.billingAddress}
            onChangeText={(billingAddress) =>
              setDraft((current) => ({ ...current, billingAddress }))
            }
            multiline
            textAlignVertical="top"
            placeholder="Calle, localidad y código postal"
            placeholderTextColor={colors.mutedText}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Los datos son correctos</Text>
            <Switch
              value={confirmed}
              onValueChange={setConfirmed}
              trackColor={{ false: colors.cardBorder, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              Autorizo a Allwain a generar en nombre de mi empresa los documentos previstos para esta clase de operaciones. Puedo revocar la autorización para operaciones futuras.
            </Text>
            <Switch
              value={mandateAccepted}
              onValueChange={setMandateAccepted}
              trackColor={{ false: colors.cardBorder, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
          <BigActionButton
            label="Confirmar datos"
            busy={busy}
            disabled={!confirmed || !mandateAccepted}
            onPress={() => void confirm()}
          />
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 14,
    gap: 12,
  },
  readyPanel: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  readyCopy: { flex: 1, minWidth: 0, gap: 2 },
  editButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  editButtonText: { color: colors.primary, fontWeight: "900" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "900" },
  help: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  fields: { gap: 8 },
  label: { color: colors.text, fontSize: 12, fontWeight: "900" },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  multiline: { minHeight: 76 },
  pickerFrame: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  picker: { color: colors.text, backgroundColor: colors.background },
  switchRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchText: { flex: 1, color: colors.text, fontWeight: "800" },
  back: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: { color: colors.text, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 18 },
});
