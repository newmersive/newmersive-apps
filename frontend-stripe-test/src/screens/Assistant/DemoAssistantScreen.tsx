import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraCapturedPicture, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import {
  Camera,
  Check,
  Image as ImageIcon,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  X,
} from "lucide-react-native";

import { apiAuthPost } from "../../config/api";
import { useAuthStore } from "../../store/auth.store";
import { colors } from "../../theme/colors";
import GuideActionCard, { type GuideAction } from "./GuideActionCard";
import { trackAnalyticsEvent } from "../../analytics";

type GuideMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  imageUri?: string | null;
};

type GuideReply = {
  message: GuideMessage;
  action: GuideAction | null;
  suggestions: string[];
  provider: "openai" | "local";
  executeRequested: boolean;
};

type GuideExecution = {
  type: "offer" | "request";
  id: string;
  title: string;
  status: string;
  idempotent?: boolean;
};

function firstName(name?: string, email?: string) {
  return (name?.trim().split(/\s+/)[0] || email?.split("@")[0] || "").trim();
}

function pictureDataUrl(picture: CameraCapturedPicture) {
  if (!picture.base64) return null;
  const mime = picture.format === "png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${picture.base64}`;
}

function initialMessage(name?: string): GuideMessage {
  return {
    id: "allwain-guide-welcome",
    role: "assistant",
    text: `${name ? `Hola, ${name}. ` : ""}Dime qué quieres comprar, vender o saber. También puedes enseñarme una foto.`,
    createdAt: new Date().toISOString(),
  };
}

export default function DemoAssistantScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const user = useAuthStore((state) => state.user);
  const setAppMode = useAuthStore((state) => state.setAppMode);
  const sellerEnabled = Boolean(user?.participation?.seller?.enabled);
  const cameraRef = useRef<CameraView | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const actionYRef = useRef(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [messages, setMessages] = useState<GuideMessage[]>([
    initialMessage(firstName(user?.name, user?.email)),
  ]);
  const [action, setAction] = useState<GuideAction | null>(null);
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState([
    "Quiero comprar algo",
    "Quiero vender algo",
  ]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuideExecution | null>(null);
  const [historyReady, setHistoryReady] = useState(false);

  const historyKey = user?.id ? `allwain:guide:${user.id}:v1` : null;

  useEffect(() => {
    let active = true;
    setHistoryReady(false);
    if (!historyKey) return;
    void AsyncStorage.getItem(historyKey)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw) as {
          messages?: GuideMessage[];
          action?: GuideAction | null;
        };
        const restored = Array.isArray(saved.messages)
          ? saved.messages
              .filter(
                (message) =>
                  message &&
                  (message.role === "user" || message.role === "assistant") &&
                  typeof message.text === "string",
              )
              .slice(-30)
              .map((message) => ({ ...message, imageUri: null }))
          : [];
        if (restored.length) setMessages(restored);
        if (saved.action?.id && saved.action?.type) setAction(saved.action);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHistoryReady(true);
      });
    return () => {
      active = false;
    };
  }, [historyKey]);

  useEffect(() => {
    if (!historyKey || !historyReady) return;
    const safeMessages = messages.slice(-30).map(({ imageUri: _image, ...message }) => message);
    void AsyncStorage.setItem(
      historyKey,
      JSON.stringify({ messages: safeMessages, action }),
    ).catch(() => undefined);
  }, [action, historyKey, historyReady, messages]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [cameraOpen, messages.length, pendingImage, sending]);

  async function openCamera() {
    setError(null);
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted) {
      setError("Necesito permiso de cámara sólo para analizar la foto que tú decidas hacer.");
      return;
    }
    setCameraReady(false);
    setCameraOpen(true);
  }

  function closeCamera() {
    setCameraOpen(false);
    setCameraReady(false);
  }

  async function takePhoto() {
    if (!cameraRef.current || !cameraReady || takingPhoto) return;
    setTakingPhoto(true);
    setError(null);
    try {
      const picture = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.55,
        skipProcessing: false,
      });
      const image = pictureDataUrl(picture);
      if (!image) throw new Error("EMPTY_IMAGE");
      setPendingImage(image);
      closeCamera();
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setError("No pude capturar la imagen. Mantén el producto dentro del encuadre y repite.");
    } finally {
      setTakingPhoto(false);
    }
  }

  async function pickImage() {
    setPickingImage(true);
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Necesito permiso sólo para que elijas una imagen concreta.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        base64: true,
        quality: 0.7,
      });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset?.base64) return;
      setPendingImage(`data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setError("No pude abrir esa imagen. Prueba con otra foto.");
    } finally {
      setPickingImage(false);
    }
  }

  async function executeAction(nextAction: GuideAction) {
    if (!user?.id || executing) return;
    setExecuting(true);
    setError(null);
    try {
      const published = await apiAuthPost<GuideExecution>(
        "/allwain/guide/actions",
        {
          action: nextAction,
          idempotencyKey: `allwain-guide:${user.id}:${nextAction.id}`,
        },
      );
      void trackAnalyticsEvent(
        published.type === "offer" ? "offer_created" : "request_created",
        published.type === "offer"
          ? {
              offer_type:
                nextAction.fields.productKind === "goods" ||
                nextAction.fields.productKind === "food" ||
                nextAction.fields.productKind === "service"
                  ? nextAction.fields.productKind
                  : "other",
            }
          : { source: "guide" },
      );
      setResult(published);
      setAction(null);
      setSuggestions(["Quiero comprar algo", "Quiero vender algo"]);
      setMessages((current) => [
        ...current,
        {
          id: `guide-published-${Date.now()}`,
          role: "assistant",
          text:
            published.type === "offer"
              ? "Oferta publicada. Ya está visible para los compradores."
              : "Petición publicada. Ya puede recibir ofertas.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (publishError: any) {
      setError(publishError?.message || "No se ha publicado. El borrador sigue disponible.");
    } finally {
      setExecuting(false);
    }
  }

  async function sendMessage(
    preset?: string,
    actionOverride?: GuideAction | null,
  ) {
    const clean = (preset ?? text).trim();
    const image = pendingImage;
    if ((!clean && !image) || sending || executing) return;
    const displayText = clean || "Analiza esta foto";
    const userMessage: GuideMessage = {
      id: `guide-user-${Date.now()}`,
      role: "user",
      text: displayText,
      imageUri: image,
      createdAt: new Date().toISOString(),
    };
    const history = messages.slice(-12);
    const activeAction = actionOverride === undefined ? action : actionOverride;
    setMessages((current) => [...current, userMessage]);
    setText("");
    setPendingImage(null);
    setError(null);
    setResult(null);
    setSending(true);
    setSendingImage(Boolean(image));
    try {
      const reply = await apiAuthPost<GuideReply>(
        "/allwain/guide/messages",
        {
          message: displayText,
          imageBase64: image || undefined,
          userName: user?.name,
          currentAction: activeAction,
          history: history.map((item) => ({ role: item.role, text: item.text })),
        },
        45_000,
      );
      setMessages((current) => [...current, reply.message]);
      setAction(reply.action);
      setSuggestions(reply.suggestions || []);
      if (reply.executeRequested && reply.action) {
        await executeAction(reply.action);
      }
    } catch (sendError: any) {
      setError(sendError?.message || "No he podido responder. El borrador no se ha publicado.");
      if (image) setPendingImage(image);
    } finally {
      setSending(false);
      setSendingImage(false);
    }
  }

  function reviewEditedAction(nextAction: GuideAction) {
    setAction(nextAction);
    void sendMessage("He actualizado el borrador. Revisa los cambios.", nextAction);
  }

  function cancelDraft() {
    void sendMessage("Cancelar borrador", action);
  }

  async function openResult() {
    if (!result) return;
    await setAppMode(result.type === "offer" ? "sell" : "buy");
    navigation.navigate(result.type === "offer" ? "Ofertas" : "Inicio");
  }

  function pressSuggestion(suggestion: string) {
    if (/^editar borrador$/i.test(suggestion) && action) {
      setText("Quiero cambiar ");
      inputRef.current?.focus();
      return;
    }
    if (/^completar /i.test(suggestion)) {
      inputRef.current?.focus();
      return;
    }
    void sendMessage(suggestion);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 86 : 0}
    >
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Sparkles size={22} color="#FFFFFF" />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Guía Allwain</Text>
          <Text style={styles.subtitle}>Pregunta o dime qué quieres hacer.</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <View key={message.id} style={[styles.bubble, isUser ? styles.userBubble : styles.guideBubble]}>
              {message.imageUri ? <Image source={{ uri: message.imageUri }} style={styles.messageImage} resizeMode="cover" /> : null}
              {!isUser ? <Text style={styles.bubbleLabel}>GUÍA ALLWAIN</Text> : null}
              <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>{message.text}</Text>
            </View>
          );
        })}

        {cameraOpen && isFocused ? (
          <View style={styles.cameraPanel}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="back"
              onCameraReady={() => setCameraReady(true)}
            >
              <View style={styles.cameraMask} pointerEvents="none" />
              <TouchableOpacity style={styles.cameraClose} onPress={closeCamera} accessibilityLabel="Cerrar cámara">
                <X size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.cameraFooter}>
                <Text style={styles.cameraText}>Coloca el producto dentro del marco</Text>
                <TouchableOpacity
                  accessibilityLabel="Hacer foto"
                  style={[styles.shutter, (!cameraReady || takingPhoto) && styles.disabled]}
                  onPress={takePhoto}
                  disabled={!cameraReady || takingPhoto}
                >
                  {takingPhoto ? <ActivityIndicator color={colors.primary} /> : <Camera size={25} color={colors.primary} />}
                </TouchableOpacity>
              </View>
            </CameraView>
          </View>
        ) : null}

        {action ? (
          <View
            onLayout={(event) => {
              actionYRef.current = event.nativeEvent.layout.y;
              setTimeout(
                () =>
                  scrollRef.current?.scrollTo({
                    y: Math.max(0, actionYRef.current - 8),
                    animated: true,
                  }),
                80,
              );
            }}
          >
            <GuideActionCard
              action={action}
              sellerEnabled={sellerEnabled}
              busy={sending || executing}
              onChange={setAction}
              onReview={reviewEditedAction}
              onPublish={executeAction}
              onActivateSeller={() => navigation.navigate("ActivateSeller")}
              onCancel={cancelDraft}
            />
          </View>
        ) : null}

        {result ? (
          <View style={styles.resultBand}>
            <Check size={21} color="#24663A" />
            <View style={styles.resultCopy}>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <Text style={styles.resultText}>{result.type === "offer" ? "Oferta publicada" : "Petición publicada"}</Text>
            </View>
            <TouchableOpacity style={styles.resultButton} onPress={openResult}>
              <Text style={styles.resultButtonText}>Ver</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {sending ? (
          <View style={[styles.bubble, styles.guideBubble, styles.loadingBubble]}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loadingText}>{sendingImage ? "Analizando la imagen..." : "Preparando la siguiente acción..."}</Text>
          </View>
        ) : null}
      </ScrollView>

      {!action && messages.length <= 2 ? (
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} onPress={() => sendMessage("Quiero comprar algo")}>
            <ShoppingBag size={19} color={colors.primary} />
            <Text style={styles.quickActionText}>Comprar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={() => sendMessage("Quiero vender algo")}>
            <Store size={19} color={colors.seller} />
            <Text style={styles.quickActionText}>Vender</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={openCamera}>
            <Camera size={19} color={colors.primary} />
            <Text style={styles.quickActionText}>Foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          horizontal
          style={styles.suggestionsBar}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestions}
        >
          {suggestions.slice(0, 3).map((suggestion) => (
            <TouchableOpacity key={suggestion} style={styles.suggestion} onPress={() => pressSuggestion(suggestion)} disabled={sending || executing}>
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {pendingImage ? (
        <View style={styles.attachment}>
          <Image source={{ uri: pendingImage }} style={styles.attachmentImage} />
          <View style={styles.attachmentCopy}>
            <Text style={styles.attachmentTitle}>Foto preparada</Text>
            <Text style={styles.attachmentText}>Añade una frase o envíala para que la analice.</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => setPendingImage(null)} accessibilityLabel="Quitar foto">
            <X size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.inputIcon} onPress={openCamera} accessibilityLabel="Abrir cámara" disabled={sending || executing}>
          <Camera size={21} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.inputIcon} onPress={pickImage} accessibilityLabel="Elegir imagen" disabled={sending || executing || pickingImage}>
          {pickingImage ? <ActivityIndicator color={colors.primary} size="small" /> : <ImageIcon size={21} color={colors.text} />}
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={action?.missingLabels?.[0] ? `Escribe ${action.missingLabels[0]}` : "¿Qué necesitas?"}
          placeholderTextColor={colors.mutedText}
          value={text}
          onChangeText={setText}
          multiline
          editable={!sending && !executing}
        />
        <TouchableOpacity
          accessibilityLabel="Enviar"
          style={[styles.sendButton, (!text.trim() && !pendingImage) || sending || executing ? styles.disabled : null]}
          onPress={() => sendMessage()}
          disabled={(!text.trim() && !pendingImage) || sending || executing}
        >
          <Send size={21} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  heading: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, backgroundColor: colors.card },
  headingIcon: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  headingCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 21, fontWeight: "900" },
  subtitle: { color: colors.mutedText, fontSize: 13, fontWeight: "600", marginTop: 2 },
  messages: { flex: 1 },
  messagesContent: { flexGrow: 1, padding: 14, gap: 10 },
  bubble: { maxWidth: "88%", padding: 11, borderRadius: 8, gap: 6 },
  guideBubble: { alignSelf: "flex-start", backgroundColor: colors.highlight },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.primary },
  bubbleLabel: { color: colors.primary, fontSize: 9, fontWeight: "900" },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  userBubbleText: { color: "#FFFFFF" },
  messageImage: { width: 190, maxWidth: "100%", height: 125, borderRadius: 6 },
  loadingBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  cameraPanel: { width: "100%", height: 310, borderRadius: 8, overflow: "hidden", backgroundColor: "#111111" },
  camera: { flex: 1 },
  cameraMask: { position: "absolute", left: 28, right: 28, top: 42, bottom: 88, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)", borderRadius: 8 },
  cameraClose: { position: "absolute", right: 10, top: 10, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.62)" },
  cameraFooter: { position: "absolute", left: 0, right: 0, bottom: 0, minHeight: 78, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(0,0,0,0.68)" },
  cameraText: { flex: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  shutter: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 3, borderColor: colors.primary },
  quickActions: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  quickAction: { flex: 1, minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card },
  quickActionText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  suggestions: { gap: 7, paddingHorizontal: 14, paddingVertical: 9 },
  suggestionsBar: { flexGrow: 0, height: 56, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  suggestion: { minHeight: 38, justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card, paddingHorizontal: 11 },
  suggestionText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  attachment: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 14, marginBottom: 8, padding: 8, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: colors.card },
  attachmentImage: { width: 50, height: 50, borderRadius: 6 },
  attachmentCopy: { flex: 1 },
  attachmentTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  attachmentText: { color: colors.mutedText, fontSize: 11, fontWeight: "600", marginTop: 2 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, fontSize: 12, fontWeight: "800", paddingHorizontal: 14, paddingBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.cardBorder, backgroundColor: colors.card },
  inputIcon: { width: 40, height: 46, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 46, maxHeight: 100, paddingHorizontal: 11, paddingVertical: 10, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 8, backgroundColor: "#FFFFFF", color: colors.text, fontSize: 14 },
  sendButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.primary },
  disabled: { opacity: 0.42 },
  resultBand: { width: "100%", flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#C9E4D1", borderRadius: 8, backgroundColor: "#E8F4EC", padding: 11 },
  resultCopy: { flex: 1 },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  resultText: { color: "#24663A", fontSize: 12, fontWeight: "700", marginTop: 2 },
  resultButton: { minWidth: 52, minHeight: 40, alignItems: "center", justifyContent: "center" },
  resultButtonText: { color: "#24663A", fontSize: 13, fontWeight: "900" },
});
