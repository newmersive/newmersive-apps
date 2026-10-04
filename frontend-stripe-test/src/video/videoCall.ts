import { apiAuthGet, apiAuthPost } from "../config/api";

export type VideoCallCapability = {
  enabled: boolean;
  provider: "livekit";
  recording: false;
  endToEndEncryptionPlanned: boolean;
};

export type VideoCallAccess = {
  provider: "livekit";
  serverUrl: string;
  token: string;
  roomName: string;
  expiresInSeconds: number;
  conversationId: string;
  recording: false;
};

export function getVideoCallCapability() {
  return apiAuthGet<VideoCallCapability>("/chat/allwain/video-capability");
}

export function getVideoCallAccess(conversationId: string) {
  return apiAuthPost<VideoCallAccess>(
    `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/video-token`,
    {},
  );
}

export function recordVideoCallEvent(
  conversationId: string,
  event: "started" | "ended",
  sessionId: string,
) {
  return apiAuthPost(
    `/chat/allwain/conversations/${encodeURIComponent(conversationId)}/video-event`,
    { event, sessionId },
  );
}

export function createVideoCallSessionId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
