import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { ShieldCheck, LogOut } from 'lucide-react-native';
import { apiAuthGet, apiAuthPost } from '../config/api';
import { useAuthStore } from '../store/auth.store';
import { subscribeAdminMfa } from '../store/adminMfaBridge';
import { createAdminMfaRequestGuard } from '../utils/adminMfaRequests';

type MfaStatus = { required: boolean; enrolled: boolean; verified: boolean; verifiedUntil: string | null };
type Enrollment = { secret: string; uri: string; expiresAt: string };

function message(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code.includes('ADMIN_MFA_INVALID_CODE')) return 'El codigo no es valido o ya se ha usado. Espera al siguiente codigo.';
  if (code.includes('ADMIN_MFA_LOCKED')) return 'Demasiados intentos. Espera 15 minutos.';
  if (code.includes('ADMIN_MFA_FRESH_LOGIN_REQUIRED')) return 'Cierra sesion y vuelve a entrar para activar la proteccion.';
  if (code.includes('ADMIN_MFA_ENROLLMENT_EXPIRED')) return 'La activacion ha caducado. Vuelve atras para iniciarla de nuevo.';
  return 'No se pudo verificar el acceso. Vuelve a intentarlo.';
}

export default function AdminMfaBoundary({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user);
  // A distinct mount discards codes, pending secrets and access state when identity changes.
  if (user?.role !== 'admin') return <>{children}</>;
  return <AdminMfaSession key={user.id}>{children}</AdminMfaSession>;
}

function AdminMfaSession({ children }: { children: React.ReactNode }) {
  const [requests] = useState(createAdminMfaRequestGuard);
  const clearAuth = useAuthStore(s => s.clearAuth);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const refresh = useCallback(async (ticket = requests.begin()) => {
    const next = await apiAuthGet<MfaStatus>('/auth/admin-mfa/status');
    if (requests.isCurrent(ticket)) setStatus(next);
  }, [requests]);

  const invalidate = useCallback(() => {
    requests.invalidate(); setBusy(false); setLoading(false);
    setCodes(null); setSaved(false); setEnrollment(null); setCode(''); setError('');
    setForeground(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
    setStatus(value => value ? { ...value, verified: false } : null);
  }, [requests]);

  useEffect(() => {
    requests.activate();
    const ticket = requests.begin();
    setLoading(true);
    void refresh(ticket).catch(e => { if (requests.isCurrent(ticket)) setError(message(e)); })
      .finally(() => { if (requests.isCurrent(ticket)) setLoading(false); });
    const unsubscribe = subscribeAdminMfa(invalidate);
    const subscription = AppState.addEventListener('change', state => {
      invalidate();
      setForeground(false);
      if (state === 'active') {
        const check = requests.begin();
        void refresh(check).catch(() => { if (requests.isCurrent(check)) setStatus(null); })
          .finally(() => { if (requests.isCurrent(check)) { setForeground(true); setLoading(false); } });
      }
    });
    return () => { requests.dispose(); unsubscribe(); subscription.remove(); };
  }, [invalidate, refresh, requests]);

  useEffect(() => {
    if (!status?.verified || !status.verifiedUntil) return;
    const timer = setTimeout(invalidate, Math.max(0, Date.parse(status.verifiedUntil) - Date.now()));
    return () => clearTimeout(timer);
  }, [status, invalidate]);

  async function run(task: (ticket: number) => Promise<void>) {
    if (busy) return;
    const ticket = requests.begin();
    setBusy(true); setError('');
    try { await task(ticket); }
    catch (e) { if (requests.isCurrent(ticket)) setError(message(e)); }
    finally { if (requests.isCurrent(ticket)) setBusy(false); }
  }
  async function verify(ticket: number) {
    const result = await apiAuthPost<{ verified: boolean; verifiedUntil: string; recoveryCodes?: string[] }>('/auth/admin-mfa/' + (enrollment ? 'confirm' : 'verify'),
      recovery && !enrollment ? { recoveryCode: code.trim() } : { code: code.trim() });
    if (!requests.isCurrent(ticket)) return;
    setCode(''); setEnrollment(null);
    if (result.recoveryCodes) {
      setStatus({ required: true, enrolled: true, verified: result.verified, verifiedUntil: result.verifiedUntil });
      setCodes(result.recoveryCodes);
    } else await refresh(ticket);
  }
  function button(label: string, task: (ticket: number) => Promise<void>, secondary = false, disabled = false) {
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || disabled }} disabled={busy || disabled}
      onPress={() => void run(task)} style={[styles.button, secondary && styles.secondary, (busy || disabled) && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
  }
  if (loading || !foreground) return <SafeAreaView style={styles.safe}><ActivityIndicator color="#c4432e" accessibilityLabel="Verificando acceso" /></SafeAreaView>;
  if (status?.verified && !codes) return <>{children}</>;
  return <SafeAreaView style={styles.safe}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={styles.panel}>
        <Image source={require('../../assets/logos/Logotipo_Allwain_02.png')} resizeMode="contain" style={styles.logo} accessibilityLabel="Allwain" />
        <ShieldCheck size={32} color="#404041" />
        <Text accessibilityRole="header" style={styles.heading}>{codes ? 'Guarda tus codigos' : status?.enrolled ? 'Confirma que eres tu' : 'Protege tu administrador'}</Text>
        {codes ? <>
          <Text style={styles.text}>Cada codigo permite entrar una vez si pierdes tu autenticador. Guardalos en un lugar seguro.</Text>
          {codes.map(item => <Text selectable key={item} style={styles.code}>{item}</Text>)}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: saved }} onPress={() => setSaved(!saved)} style={styles.check}>
            <Text style={styles.text}>{saved ? '[x]' : '[ ]'} He guardado los codigos</Text></Pressable>
          {button('Continuar', async ticket => { await refresh(ticket); if (requests.isCurrent(ticket)) setCodes(null); }, false, !saved)}
        </> : !status ? button('Volver a comprobar', refresh) : !status.enrolled && !enrollment ? <>
          <Text style={styles.text}>Vincula tu autenticador para proteger los datos y las operaciones del administrador.</Text>
          {button('Activar proteccion', async ticket => {
            const result = await apiAuthPost<Enrollment>('/auth/admin-mfa/enroll', {});
            if (requests.isCurrent(ticket)) setEnrollment(result);
          })}
        </> : <>
          {enrollment && <>
            <Text style={styles.text}>Escanea el QR con tu autenticador o introduce la clave. Despues confirma el codigo de seis cifras.</Text>
            <View style={styles.qr}><QRCode value={enrollment.uri} size={200} ecl="M" /></View>
            <Text selectable style={styles.code}>{enrollment.secret}</Text>
          </>}
          <Text style={styles.text}>{recovery && !enrollment ? 'Codigo de emergencia' : 'Codigo de verificacion'}</Text>
          <TextInput accessibilityLabel={recovery && !enrollment ? 'Codigo de emergencia' : 'Codigo de verificacion'} style={styles.input}
            value={code} onChangeText={setCode} keyboardType={recovery && !enrollment ? 'default' : 'number-pad'} autoComplete="one-time-code"
            autoCapitalize="none" autoCorrect={false} maxLength={recovery && !enrollment ? 32 : 6} onSubmitEditing={() => void run(verify)} />
          {button('Verificar acceso', verify, false, !code.trim())}
          {!enrollment && button(recovery ? 'Usar autenticador' : 'Usar codigo de emergencia', async () => { setRecovery(!recovery); setCode(''); }, true)}
          {enrollment && button('Volver', async () => { setEnrollment(null); setCode(''); }, true)}
        </>}
        {busy && <ActivityIndicator color="#c4432e" />}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => { invalidate(); requests.dispose(); void clearAuth(); }} disabled={busy} style={styles.logout}>
          <LogOut size={18} color="#404041" /><Text style={styles.text}>Cerrar sesion</Text></Pressable>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f5f2', justifyContent: 'center' },
  scroll: { padding: 16, flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 480, padding: 20, gap: 16, backgroundColor: '#fff', borderTopWidth: 4, borderTopColor: '#f26f53' },
  logo: { width: 160, height: 60 }, heading: { fontSize: 24, fontWeight: '700', color: '#292b2a' },
  text: { fontSize: 16, lineHeight: 23, color: '#404041', flexShrink: 1 },
  qr: { alignItems: 'center', padding: 8, backgroundColor: '#fff' },
  input: { borderWidth: 1, borderColor: '#696d6a', borderRadius: 6, minHeight: 48, padding: 12, fontSize: 18, color: '#292b2a' },
  button: { minHeight: 48, padding: 12, borderRadius: 6, backgroundColor: '#c4432e', justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#696d6a' }, disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }, secondaryText: { color: '#404041' },
  error: { color: '#ad2a1d', fontSize: 15, lineHeight: 22 }, code: { fontSize: 13, lineHeight: 20, color: '#292b2a', padding: 8, backgroundColor: '#f4f5f2' },
  check: { minHeight: 44, justifyContent: 'center' }, logout: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
});
