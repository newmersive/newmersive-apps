import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ArrowLeft, Video } from "lucide-react-native";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useConnectionState,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState } from "livekit-client";

import { BigActionButton } from "../../components/design-system";
import type { RootStackParamList } from "../../navigation/types";
import { colors } from "../../theme/colors";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  createVideoCallSessionId,
  getVideoCallAccess,
  recordVideoCallEvent,
  type VideoCallAccess,
} from "../../video/videoCall";

type Props = NativeStackScreenProps<RootStackParamList, "VideoCall">;

type Translate = ReturnType<typeof useAppTranslation>["t"];

function mediaWarning(failures: ("camera" | "microphone")[], t: Translate) {
  if (failures.length === 2) {
    return t("video.mediaMissingBoth");
  }
  return failures[0] === "camera"
    ? t("video.mediaMissingCamera")
    : t("video.mediaMissingMicrophone");
}

function AutoEnableMedia({ onWarning }: { onWarning: (message: string | null) => void }) {
  const { t } = useAppTranslation();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const attempted = useRef(false);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || attempted.current) return;
    attempted.current = true;
    void Promise.allSettled([
      localParticipant.setCameraEnabled(true),
      localParticipant.setMicrophoneEnabled(true),
    ]).then(([camera, microphone]) => {
      const failures: ("camera" | "microphone")[] = [];
      if (camera.status === "rejected") failures.push("camera");
      if (microphone.status === "rejected") failures.push("microphone");
      onWarning(failures.length ? mediaWarning(failures, t) : null);
    });
  }, [connectionState, localParticipant, onWarning, t]);

  return null;
}

function WebRoom({
  access,
  sessionId,
  onLeave,
}: {
  access: VideoCallAccess;
  sessionId: string;
  onLeave: () => void;
}) {
  const { t } = useAppTranslation();
  const started = useRef(false);
  const ended = useRef(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (started.current && !ended.current) {
        ended.current = true;
        void recordVideoCallEvent(access.conversationId, "ended", sessionId);
      }
    },
    [access.conversationId, sessionId],
  );

  function reportStarted() {
    if (started.current) return;
    started.current = true;
    void recordVideoCallEvent(access.conversationId, "started", sessionId);
  }

  function reportEnded() {
    if (started.current && !ended.current) {
      ended.current = true;
      void recordVideoCallEvent(access.conversationId, "ended", sessionId);
    }
    onLeave();
  }

  return (
    <View style={styles.roomShell}>
      <View style={styles.roomNotice}>
        <View style={styles.roomNoticeCopy}>
          <Text style={styles.roomNoticeTitle}>{access.recording ? "" : t("video.notRecorded")}</Text>
          <Text style={styles.roomNoticeText}>{t("video.mediaOnlyDuringCall")}</Text>
          {mediaNotice ? <Text style={styles.mediaNotice}>{mediaNotice}</Text> : null}
          {roomError ? <Text style={styles.roomError}>{roomError}</Text> : null}
        </View>
      </View>
      <LiveKitRoom
        data-lk-theme="default"
        serverUrl={access.serverUrl}
        token={access.token}
        connect
        audio={false}
        video={false}
        onConnected={reportStarted}
        onDisconnected={reportEnded}
        onError={(roomFailure) =>
          setRoomError(roomFailure?.message || t("video.connectionError"))
        }
        style={{ height: "100%", width: "100%" }}
      >
        <AutoEnableMedia onWarning={setMediaNotice} />
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </View>
  );
}

export default function VideoCallScreen({ route, navigation }: Props) {
  const { t } = useAppTranslation();
  const [access, setAccess] = useState<VideoCallAccess | null>(null);
  const [sessionId] = useState(createVideoCallSessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = useRef(false);

  function leaveScreen() {
    if (left.current) return;
    left.current = true;
    navigation.goBack();
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      setAccess(await getVideoCallAccess(route.params.conversationId));
    } catch (joinError: any) {
      setError(joinError?.message || t("video.startError"));
    } finally {
      setBusy(false);
    }
  }

  if (access) {
    return <WebRoom access={access} sessionId={sessionId} onLeave={leaveScreen} />;
  }

  return (
    <View style={styles.preflight}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <ArrowLeft size={22} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.preflightIcon}>
        <Video size={32} color={colors.primary} />
      </View>
      <Text style={styles.preflightTitle}>{t("video.preflightTitle")}</Text>
      <Text style={styles.preflightBody}>
        {t("video.preflightWebBody")}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      <BigActionButton
        label={t("video.enter")}
        icon={<Video size={20} color={colors.buttonText} />}
        busy={busy}
        onPress={() => void join()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preflight: {
    flex: 1,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    justifyContent: "center",
    padding: 22,
    gap: 14,
    backgroundColor: colors.background,
  },
  backButton: {
    position: "absolute",
    top: 18,
    left: 14,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  preflightIcon: {
    width: 66,
    height: 66,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.highlight,
    borderWidth: 1,
    borderColor: "#FFC8BA",
  },
  preflightTitle: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  preflightBody: { color: colors.mutedText, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  error: {
    color: colors.danger,
    backgroundColor: "#FFF0EE",
    borderWidth: 1,
    borderColor: "#F1C4BE",
    borderRadius: 8,
    padding: 11,
    fontWeight: "700",
  },
  roomShell: { flex: 1, minHeight: 0, backgroundColor: "#171817" },
  roomNotice: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#242624",
    borderBottomWidth: 1,
    borderBottomColor: "#3A3D3B",
  },
  roomNoticeCopy: { alignItems: "center", gap: 3 },
  roomNoticeTitle: { color: "#CFF7DD", fontSize: 12, fontWeight: "900" },
  roomNoticeText: { color: "#D5D8D6", fontSize: 12, fontWeight: "600" },
  mediaNotice: { color: "#FFE6A3", fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center" },
  roomError: { color: "#FFC4BC", fontSize: 12, lineHeight: 17, fontWeight: "800", textAlign: "center" },
});
