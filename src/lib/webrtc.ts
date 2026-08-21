export const RTC_CONFIG: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type ScreenShareSignalType = "offer" | "answer" | "ice-candidate" | "viewer-hello" | "master-bye";

// Payload trafegado no canal privado `private-campaign-{id}-screenshare-signal`.
// `fromUserId` é sempre carimbado pelo servidor a partir do JWT — nunca vem do client.
export type ScreenShareSignal = {
    type: ScreenShareSignalType;
    toClientId: string | null; // null = broadcast (só "viewer-hello")
    fromClientId: string;
    fromUserId: string;
    sessionId: string | null;
    sdp?: RTCSessionDescriptionInit | null;
    candidate?: RTCIceCandidateInit | null;
};

export type ScreenShareState = {
    active: boolean;
    sessionId: string | null;
};
