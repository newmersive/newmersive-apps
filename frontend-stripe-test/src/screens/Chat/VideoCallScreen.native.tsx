import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
} from "lucide-react-native";
import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  type TrackReferenceOrPlaceholder,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/react-native";
import { ConnectionState, Track } from "livekit-client";

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

function RoomContents({
  connectionError,
  onLeave,
}: {
  connectionError: string | null;
  onLeave: () => void;
}) {
  const { t } = useAppTranslation();
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera]);
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    localParticipant,
  } = useLocalParticipant();
  const [controlBusy, setControlBusy] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const mediaAttempted = useRef(false);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || mediaAttempted.current) return;
    mediaAttempted.current = true;
    void Promise.allSettled([
      localParticipant.setCameraEnabled(true),
      localParticipant.setMicrophoneEnabled(true),
    ]).then(([camera, microphone]) => {
      const failures: ("camera" | "microphone")[] = [];
      if (camera.status === "rejected") failures.push("camera");
      if (microphone.status === "rejected") failures.push("microphone");
      setMediaNotice(failures.length ? mediaWarning(failures, t) : null);
    });
  }, [connectionState, localParticipant, t]);

  async function toggleCamera() {
    if (controlBusy) return;
    setControlBusy(true);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } finally {
      setControlBusy(false);
    }
  }

  async function toggleMicrophone() {
    if (controlBusy) return;
    setControlBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setControlBusy(false);
    }
  }

  function leave() {
    room.disconnect();
    onLeave();
  }

  return (
    <View style={styles.room}>
      <View style={styles.roomHeader}>
        <View>
          <Text style={styles.roomTitle}>{t("video.title")}</Text>
          <Text style={styles.roomStatus}>
            {participants.length > 1
              ? t("video.connectedMany", { count: participants.length })
              : t("video.waiting")}
          </Text>
        </View>
        <View style={styles.privateBadge}>
          <ShieldCheck size={15} color="#CFF7DD" />
          <Text style={styles.privateBadgeText}>{t("video.notRecorded")}</Text>
        </View>
      </View>
      {mediaNotice ? <Text style={styles.mediaNotice}>{mediaNotice}</Text> : null}
      {connectionError ? <Text style={styles.roomError}>{connectionError}</Text> : null}

      <FlatList
        data={tracks}
        keyExtractor={(item, index) =>
          isTrackReference(item)
            ? `${item.participant.identity}:${item.source}`
            : `placeholder:${index}`
        }
        contentContainerStyle={styles.videoList}
        renderItem={({ item }: { item: TrackReferenceOrPlaceholder }) =>
          isTrackReference(item) ? (
            <View style={styles.videoFrame}>
              <VideoTrack
                trackRef={item}
                style={styles.video}
                mirror={item.participant.isLocal}
                objectFit="cover"
              />
              <Text style={styles.videoName} numberOfLines={1}>
                {item.participant.isLocal
                  ? t("video.you")
                  : item.participant.name || t("video.allwainUser")}
              </Text>
            </View>
          ) : (
            <View style={[styles.videoFrame, styles.videoPlaceholder]}>
              <CameraOff size={34} color="#BFC4C2" />
              <Text style={styles.placeholderText}>{t("video.cameraOff")}</Text>
            </View>
          )
        }
        ListEmptyComponent={
          <View style={[styles.videoFrame, styles.videoPlaceholder]}>
            <CameraOff size={34} color="#BFC4C2" />
            <Text style={styles.placeholderText}>{t("video.enableCameraHint")}</Text>
          </View>
        }
      />

      <View style={styles.controls}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isMicrophoneEnabled ? t("video.muteMicrophone") : t("video.enableMicrophone")}
          style={styles.controlButton}
          onPress={() => void toggleMicrophone()}
          disabled={controlBusy}
        >
          {isMicrophoneEnabled ? (
            <Mic size={22} color="#FFFFFF" />
          ) : (
            <MicOff size={22} color="#FFFFFF" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isCameraEnabled ? t("video.disableCamera") : t("video.enableCamera")}
          style={styles.controlButton}
          onPress={() => void toggleCamera()}
          disabled={controlBusy}
        >
          {isCameraEnabled ? (
            <Camera size={22} color="#FFFFFF" />
          ) : (
            <CameraOff size={22} color="#FFFFFF" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("video.end")}
          style={[styles.controlButton, styles.endButton]}
          onPress={leave}
        >
          <PhoneOff size={23} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ConnectedRoom({
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
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => {
      void AudioSession.stopAudioSession();
      if (started.current && !ended.current) {
        ended.current = true;
        void recordVideoCallEvent(access.conversationId, "ended", sessionId);
      }
    };
  }, [access.conversationId, sessionId]);

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
    <LiveKitRoom
      serverUrl={access.serverUrl}
      token={access.token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: { pixelDensity: "screen" }, dynacast: true }}
      onConnected={reportStarted}
      onDisconnected={reportEnded}
      onError={(roomFailure) =>
        setConnectionError(roomFailure?.message || t("video.connectionError"))
      }
    >
      <RoomContents connectionError={connectionError} onLeave={reportEnded} />
    </LiveKitRoom>
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
    return (
      <ConnectedRoom
        access={access}
        sessionId={sessionId}
        onLeave={leaveScreen}
      />
    );
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
        <Camera size={32} color={colors.primary} />
      </View>
      <Text style={styles.preflightTitle}>{t("video.preflightTitle")}</Text>
      <Text style={styles.preflightBody}>
        {t("video.preflightNativeBody")}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <BigActionButton
        label={t("video.enter")}
        icon={<Camera size={20} color={colors.buttonText} />}
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
  backButton: { position: "absolute", top: 18, left: 14, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  preflightIcon: { width: 66, height: 66, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.highlight, borderWidth: 1, borderColor: "#FFC8BA" },
  preflightTitle: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  preflightBody: { color: colors.mutedText, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  error: { color: colors.danger, backgroundColor: "#FFF0EE", borderWidth: 1, borderColor: "#F1C4BE", borderRadius: 8, padding: 11, fontWeight: "700" },
  room: { flex: 1, backgroundColor: "#171817", paddingTop: 18 },
  roomHeader: { minHeight: 62, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  roomTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  roomStatus: { color: "#BFC4C2", fontSize: 12, fontWeight: "700", marginTop: 3 },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#41644E", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  privateBadgeText: { color: "#CFF7DD", fontSize: 10, fontWeight: "900" },
  mediaNotice: { color: "#FFE6A3", fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center", paddingHorizontal: 16, paddingBottom: 7 },
  roomError: { color: "#FFC4BC", fontSize: 12, lineHeight: 17, fontWeight: "800", textAlign: "center", paddingHorizontal: 16, paddingBottom: 7 },
  videoList: { flexGrow: 1, justifyContent: "center", padding: 12, gap: 10 },
  videoFrame: { width: "100%", minHeight: 260, flex: 1, maxHeight: 620, borderRadius: 8, overflow: "hidden", backgroundColor: "#292B2A", borderWidth: 1, borderColor: "#3A3D3B" },
  video: { width: "100%", height: "100%" },
  videoPlaceholder: { alignItems: "center", justifyContent: "center", gap: 9 },
  placeholderText: { color: "#BFC4C2", fontWeight: "700" },
  videoName: { position: "absolute", left: 10, bottom: 10, maxWidth: "80%", color: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.52)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "900" },
  controls: { minHeight: 86, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 18, paddingBottom: 18 },
  controlButton: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "#3B3E3C" },
  endButton: { backgroundColor: colors.danger },
});
