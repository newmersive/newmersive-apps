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
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react-native";

import {
  apiAuthGet,
  apiAuthPatch,
  type AllwainComplianceProfile,
  type AllwainFiscalProfile,
} from "../config/api";
import { BigActionButton } from "./design-system";
import { colors } from "../theme/colors";

type Draft = {
  legalForm: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  invoiceEmail: string;
  countryCode: string;
  taxTerritory: string;
  vatRegime: string;
  reagpActivity: string;
  ownProduction: boolean;
  billingAddress: string;
};

const EMPTY: Draft = {
  legalForm: "self_employed",
  legalName: "",
  tradeName: "",
  taxId: "",
  invoiceEmail: "",
  countryCode: "ES",
  taxTerritory: "España peninsular y Baleares",
  vatRegime: "unknown",
  reagpActivity: "agricultural_forestry",
  ownProduction: false,
  billingAddress: "",
};

function fromProfile(profile?: AllwainFiscalProfile | null): Draft {
  if (!profile) return EMPTY;
  return {
    legalForm: profile.legalForm || EMPTY.legalForm,
    legalName: profile.legalName || "",
    tradeName: profile.tradeName || "",
    taxId: profile.taxId || "",
    invoiceEmail: profile.invoiceEmail || "",
    countryCode: profile.countryCode || "ES",
    taxTerritory: profile.taxTerritory || "",
    vatRegime: profile.vatRegime || "unknown",
    reagpActivity: profile.reagpActivity || EMPTY.reagpActivity,
    ownProduction: profile.ownProduction === true,
    billingAddress: String(profile.billingAddress?.formatted || ""),
  };
}

function regimeLabel(value: string) {
  if (value === "reagp") return "Régimen especial de agricultura, ganadería y pesca";
  if (value === "general") return "Régimen general";
  if (value === "exempt") return "Actividad exenta";
  if (value === "non_taxable") return "No sujeto";
  if (value === "other") return "Otro régimen";
  return "Pendiente de indicar";
}

export default function SellerFiscalProfilePanel({
  onSaved,
}: {
  onSaved?: () => void | Promise<void>;
}) {
  const [profile, setProfile] = useState<AllwainFiscalProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  const [mandateAccepted, setMandateAccepted] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiAuthGet<AllwainComplianceProfile>("/allwain/compliance/profile");
      const business = response.profiles.find((item) => item.kind === "business") || null;
      setProfile(business);
      setDraft(fromProfile(business));
      setMandateAccepted(Boolean(business?.documentMandateActive));
      setReady(response.readiness.sellerFiscal);
      setEditing(!response.readiness.sellerFiscal);
    } catch (loadError: any) {
      setError(loadError?.message || "No pudimos cargar tus datos fiscales.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const payload = useMemo(() => ({
    kind: "business",
    legalForm: draft.legalForm,
    legalName: draft.legalName.trim(),
    tradeName: draft.tradeName.trim() || undefined,
    taxIdType: "NIF",
    taxId: draft.taxId.trim(),
    countryCode: draft.countryCode.trim().toUpperCase(),
    taxTerritory: draft.taxTerritory.trim() || undefined,
    vatRegime: draft.vatRegime,
    reagpActivity: draft.vatRegime === "reagp" ? draft.reagpActivity : undefined,
    ownProduction: draft.vatRegime === "reagp" ? draft.ownProduction : undefined,
    invoiceEmail: draft.invoiceEmail.trim() || undefined,
    billingAddress: draft.billingAddress.trim()
      ? { formatted: draft.billingAddress.trim() }
      : undefined,
  }), [draft]);

  function validate(currentStep: 1 | 2 | 3) {
    if (currentStep === 1 && !draft.legalName.trim()) return "Escribe el nombre legal del vendedor.";
    if (currentStep === 2 && !draft.taxId.trim()) return "Escribe el NIF o CIF.";
    if (currentStep === 2 && draft.vatRegime === "unknown") return "Indica cómo declaras el IVA.";
    if (currentStep === 2 && draft.vatRegime === "reagp" && !draft.ownProduction) {
      return "Para confirmar REAGP debes indicar que vendes producción propia.";
    }
    if (currentStep === 3 && !confirmed) return "Confirma que los datos son correctos.";
    if (currentStep === 3 && !mandateAccepted) {
      return "Autoriza la generación de documentos para poder cobrar por Allwain.";
    }
    return null;
  }

  async function save(attest: boolean, nextStep?: 2 | 3) {
    const validation = validate(step);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await apiAuthPatch<AllwainFiscalProfile>(
        "/allwain/compliance/fiscal-profile",
        {
          ...payload,
          attest,
          ...(attest ? { documentMandateAccepted: mandateAccepted } : {}),
        },
      );
      if (
        saved.kind !== "business" ||
        saved.legalName !== payload.legalName ||
        saved.taxId !== payload.taxId.toUpperCase().replace(/\s+/g, "")
      ) {
        throw new Error("El servidor no confirmó todos los datos guardados.");
      }
      setProfile(saved);
      if (attest) {
        setMandateAccepted(saved.documentMandateActive);
        setReady(
          ["attested", "verified"].includes(saved.status) &&
            saved.documentMandateActive,
        );
        setEditing(false);
        setNotice("Datos fiscales confirmados.");
        await onSaved?.();
      } else if (nextStep) {
        setStep(nextStep);
        setNotice("Borrador guardado.");
      }
    } catch (saveError: any) {
      const message = saveError?.message || "No pudimos guardar tus datos fiscales.";
      setError(/^[A-Z0-9_]+$/.test(message) ? "Revisa los datos antes de continuar." : message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeMandate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await apiAuthPatch<AllwainFiscalProfile>(
        "/allwain/compliance/fiscal-profile",
        { ...payload, attest: false, documentMandateRevoked: true },
      );
      if (saved.documentMandateActive) {
        throw new Error("El servidor no confirmó la revocación.");
      }
      setProfile(saved);
      setMandateAccepted(false);
      setReady(false);
      setEditing(true);
      setStep(3);
      setConfirmed(false);
      setRevokeArmed(false);
      setNotice("Autorización revocada para operaciones futuras. Los cobros quedan pausados.");
      await onSaved?.();
    } catch (revokeError: any) {
      setError(revokeError?.message || "No pudimos revocar la autorización.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <View style={styles.panel}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (ready && !editing) {
    return (
      <View style={styles.panel}>
        <View style={styles.readyRow}>
          <CheckCircle2 size={22} color={colors.success} />
          <View style={styles.readyCopy}>
            <Text style={styles.title}>Tus datos fiscales</Text>
            <Text style={styles.status}>Confirmados · {regimeLabel(profile?.vatRegime || "unknown")}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => { setEditing(true); setStep(1); setConfirmed(false); }}>
          <Text style={styles.secondaryActionText}>Revisar datos</Text>
        </TouchableOpacity>
        {!revokeArmed ? (
          <TouchableOpacity
            style={styles.revokeAction}
            onPress={() => setRevokeArmed(true)}
            disabled={busy}
          >
            <Text style={styles.revokeActionText}>Revocar autorización documental</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.revokeBox}>
            <Text style={styles.help}>
              Se pausarán nuevos cobros que necesiten documentos emitidos en tu nombre. No cambia documentos ya emitidos.
            </Text>
            <BigActionButton
              label="Confirmar revocación"
              tone="dark"
              busy={busy}
              onPress={() => void revokeMandate()}
            />
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => setRevokeArmed(false)}
              disabled={busy}
            >
              <Text style={styles.secondaryActionText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}><ShieldCheck size={20} color={colors.primary} /></View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Tus datos fiscales</Text>
          <Text style={styles.status}>{step} de 3</Text>
        </View>
      </View>

      {step > 1 ? (
        <TouchableOpacity style={styles.back} onPress={() => setStep((step - 1) as 1 | 2)} disabled={busy}>
          <ArrowLeft size={17} color={colors.text} />
          <Text style={styles.backText}>Atrás</Text>
        </TouchableOpacity>
      ) : null}

      {step === 1 ? (
        <View style={styles.fields}>
          <Text style={styles.question}>¿Quién vende?</Text>
          <Text style={styles.label}>Forma legal</Text>
          <View style={styles.pickerFrame}>
            <Picker selectedValue={draft.legalForm} onValueChange={(legalForm) => setDraft((current) => ({ ...current, legalForm: String(legalForm) }))} style={styles.picker}>
              <Picker.Item label="Persona física" value="individual" />
              <Picker.Item label="Autónomo o profesional" value="self_employed" />
              <Picker.Item label="Empresa" value="company" />
              <Picker.Item label="Cooperativa" value="cooperative" />
              <Picker.Item label="Asociación" value="association" />
              <Picker.Item label="Otra forma" value="other" />
            </Picker>
          </View>
          <Text style={styles.label}>Nombre legal</Text>
          <TextInput style={styles.input} value={draft.legalName} onChangeText={(legalName) => setDraft((current) => ({ ...current, legalName }))} placeholder="Nombre y apellidos o razón social" placeholderTextColor={colors.mutedText} />
          <Text style={styles.label}>Nombre comercial (opcional)</Text>
          <TextInput style={styles.input} value={draft.tradeName} onChangeText={(tradeName) => setDraft((current) => ({ ...current, tradeName }))} placeholder="El nombre que conocen tus clientes" placeholderTextColor={colors.mutedText} />
          <BigActionButton label="Guardar y seguir" tone="dark" busy={busy} onPress={() => void save(false, 2)} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.fields}>
          <Text style={styles.question}>¿Cómo tributas?</Text>
          <Text style={styles.label}>NIF o CIF</Text>
          <TextInput style={styles.input} value={draft.taxId} onChangeText={(taxId) => setDraft((current) => ({ ...current, taxId }))} autoCapitalize="characters" placeholder="12345678Z" placeholderTextColor={colors.mutedText} />
          <Text style={styles.label}>Régimen de IVA</Text>
          <View style={styles.pickerFrame}>
            <Picker selectedValue={draft.vatRegime} onValueChange={(vatRegime) => setDraft((current) => ({ ...current, vatRegime: String(vatRegime) }))} style={styles.picker}>
              <Picker.Item label="Elige una opción" value="unknown" />
              <Picker.Item label="Régimen general" value="general" />
              <Picker.Item label="REAGP" value="reagp" />
              <Picker.Item label="Actividad exenta" value="exempt" />
              <Picker.Item label="Operación no sujeta" value="non_taxable" />
              <Picker.Item label="Otro" value="other" />
            </Picker>
          </View>
          {draft.vatRegime === "reagp" ? (
            <>
              <Text style={styles.label}>Actividad</Text>
              <View style={styles.pickerFrame}>
                <Picker selectedValue={draft.reagpActivity} onValueChange={(reagpActivity) => setDraft((current) => ({ ...current, reagpActivity: String(reagpActivity) }))} style={styles.picker}>
                  <Picker.Item label="Agricultura o actividad forestal" value="agricultural_forestry" />
                  <Picker.Item label="Ganadería o pesca" value="livestock_fishing" />
                </Picker>
              </View>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchTitle}>Vendo producción propia</Text>
                  <Text style={styles.help}>Este dato es necesario para tratar una operación como REAGP.</Text>
                </View>
                <Switch value={draft.ownProduction} onValueChange={(ownProduction) => setDraft((current) => ({ ...current, ownProduction }))} trackColor={{ false: colors.cardBorder, true: colors.primary }} thumbColor={colors.card} />
              </View>
            </>
          ) : null}
          <BigActionButton label="Guardar y seguir" tone="dark" busy={busy} onPress={() => void save(false, 3)} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.fields}>
          <Text style={styles.question}>¿Dónde enviamos tus documentos?</Text>
          <Text style={styles.label}>Email (opcional)</Text>
          <TextInput style={styles.input} value={draft.invoiceEmail} onChangeText={(invoiceEmail) => setDraft((current) => ({ ...current, invoiceEmail }))} keyboardType="email-address" autoCapitalize="none" placeholder="facturas@ejemplo.es" placeholderTextColor={colors.mutedText} />
          <Text style={styles.label}>Dirección fiscal (opcional)</Text>
          <TextInput style={[styles.input, styles.multiline]} value={draft.billingAddress} onChangeText={(billingAddress) => setDraft((current) => ({ ...current, billingAddress }))} multiline textAlignVertical="top" placeholder="Calle, número, localidad y código postal" placeholderTextColor={colors.mutedText} />
          <View style={styles.summary}>
            <Text style={styles.summaryLine}>{draft.legalName}</Text>
            <Text style={styles.summaryLine}>{draft.taxId.toUpperCase()} · {regimeLabel(draft.vatRegime)}</Text>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Los datos son correctos</Text>
              <Text style={styles.help}>Allwain los usará para decidir qué documentos necesita cada operación.</Text>
            </View>
            <Switch value={confirmed} onValueChange={setConfirmed} trackColor={{ false: colors.cardBorder, true: colors.primary }} thumbColor={colors.card} />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>Generar mis documentos en Allwain</Text>
              <Text style={styles.help}>
                Autorizo a Allwain a generar y conservar en mi nombre los documentos previstos para mis operaciones. Sigo siendo responsable de mis obligaciones y puedo revocar esta autorización para operaciones futuras.
              </Text>
            </View>
            <Switch value={mandateAccepted} onValueChange={setMandateAccepted} trackColor={{ false: colors.cardBorder, true: colors.primary }} thumbColor={colors.card} />
          </View>
          <Text style={styles.help}>Allwain no sustituye el asesoramiento fiscal. Podrás corregir estos datos si cambia tu situación.</Text>
          <BigActionButton label="Confirmar datos" tone="dark" busy={busy} disabled={!confirmed || !mandateAccepted} onPress={() => void save(true)} />
        </View>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, padding: 16, gap: 13 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: { width: 38, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.highlight },
  headingCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "900" },
  status: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  fields: { gap: 9 },
  question: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "900", marginBottom: 3 },
  label: { color: colors.text, fontSize: 12, fontWeight: "900" },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, color: colors.text, backgroundColor: colors.background, paddingHorizontal: 12, fontSize: 15 },
  multiline: { minHeight: 78, paddingVertical: 10 },
  pickerFrame: { minHeight: 50, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, overflow: "hidden", justifyContent: "center", backgroundColor: colors.background },
  picker: { color: colors.text, backgroundColor: colors.background },
  switchRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 5 },
  switchCopy: { flex: 1, minWidth: 0, gap: 3 },
  switchTitle: { color: colors.text, fontWeight: "900" },
  help: { color: colors.mutedText, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  back: { alignSelf: "flex-start", minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { color: colors.text, fontWeight: "800" },
  summary: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder, paddingVertical: 10, gap: 4 },
  summaryLine: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  readyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  readyCopy: { flex: 1, minWidth: 0, gap: 2 },
  secondaryAction: { minHeight: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8 },
  secondaryActionText: { color: colors.text, fontWeight: "900" },
  revokeAction: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  revokeActionText: { color: colors.danger, fontWeight: "800" },
  revokeBox: { gap: 9, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 10 },
  notice: { color: colors.success, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", lineHeight: 18 },
});
