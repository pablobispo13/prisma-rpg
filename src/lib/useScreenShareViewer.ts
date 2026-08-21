import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import { getPusherClient } from "./pusherClient";
import { RTC_CONFIG, ScreenShareSignal, ScreenShareState } from "./webrtc";

const MAX_RECONNECT_ATTEMPTS = 5;

// Gerencia o lado do jogador: uma única RTCPeerConnection recebendo o vídeo
// compartilhado pelo mestre, sinalizada via Pusher.
export function useScreenShareViewer(campaignId: string | null) {
    const [active, setActive] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);

    const clientIdRef = useRef<string>(typeof window !== "undefined" ? crypto.randomUUID() : "");
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const masterClientIdRef = useRef<string | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const sendSignal = useCallback((payload: Omit<ScreenShareSignal, "fromUserId">) => {
        if (!campaignId) return;
        api.post("/screen-share/signal", payload, { silent: true }).catch(() => {});
    }, [campaignId]);

    const closePeer = useCallback(() => {
        pcRef.current?.close();
        pcRef.current = null;
        pendingCandidatesRef.current = [];
        setStream(null);
    }, []);

    const sendHello = useCallback(() => {
        if (!clientIdRef.current) return;
        sendSignal({
            type: "viewer-hello",
            toClientId: null,
            fromClientId: clientIdRef.current,
            sessionId: null,
        });
    }, [sendSignal]);

    const scheduleReconnect = useCallback(() => {
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 15000);
        reconnectTimerRef.current = setTimeout(() => sendHello(), delay);
    }, [sendHello]);

    const handleOffer = useCallback((msg: ScreenShareSignal) => {
        if (!msg.sdp) return;
        closePeer();
        masterClientIdRef.current = msg.fromClientId;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        pc.ontrack = (e) => setStream(e.streams[0]);

        pc.onicecandidate = (e) => {
            if (!e.candidate || !masterClientIdRef.current) return;
            sendSignal({
                type: "ice-candidate",
                toClientId: masterClientIdRef.current,
                fromClientId: clientIdRef.current,
                sessionId: msg.sessionId,
                candidate: e.candidate.toJSON(),
            });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                closePeer();
                scheduleReconnect();
            } else if (pc.connectionState === "connected") {
                reconnectAttemptsRef.current = 0;
            }
        };

        pc.setRemoteDescription(msg.sdp)
            .then(() => {
                pendingCandidatesRef.current.forEach((c) => pc.addIceCandidate(c).catch(() => {}));
                pendingCandidatesRef.current = [];
                return pc.createAnswer();
            })
            .then((answer) => pc.setLocalDescription(answer).then(() => answer))
            .then((answer) => {
                sendSignal({
                    type: "answer",
                    toClientId: msg.fromClientId,
                    fromClientId: clientIdRef.current,
                    sessionId: msg.sessionId,
                    sdp: answer,
                });
            })
            .catch(() => {});
    }, [closePeer, sendSignal, scheduleReconnect]);

    const handleSignal = useCallback((msg: ScreenShareSignal) => {
        if (msg.toClientId !== clientIdRef.current) return;

        if (msg.type === "offer") {
            handleOffer(msg);
        } else if (msg.type === "ice-candidate" && msg.candidate) {
            const pc = pcRef.current;
            if (pc?.remoteDescription) {
                pc.addIceCandidate(msg.candidate).catch(() => {});
            } else {
                pendingCandidatesRef.current.push(msg.candidate);
            }
        }
    }, [handleOffer]);

    useEffect(() => {
        if (!campaignId) return;
        const pusher = getPusherClient();
        if (!pusher) return;

        let cancelled = false;

        api.get("/screen-share", { silent: true }).then(({ data }) => {
            if (cancelled) return;
            setActive(!!data.active);
            if (data.active) sendHello();
        }).catch(() => {});

        const stateChannel = pusher.subscribe(`campaign-${campaignId}-screenshare`);
        const onState = (state: ScreenShareState) => {
            setActive(state.active);
            if (state.active) {
                reconnectAttemptsRef.current = 0;
                sendHello();
            } else {
                closePeer();
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            }
        };
        stateChannel.bind("state", onState);

        const signalChannel = pusher.subscribe(`private-campaign-${campaignId}-screenshare-signal`);
        const onSignal = (msg: ScreenShareSignal) => handleSignal(msg);
        signalChannel.bind("signal", onSignal);

        return () => {
            cancelled = true;
            stateChannel.unbind("state", onState);
            signalChannel.unbind("signal", onSignal);
            pusher.unsubscribe(`campaign-${campaignId}-screenshare`);
            pusher.unsubscribe(`private-campaign-${campaignId}-screenshare-signal`);
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            closePeer();
        };
    }, [campaignId, handleSignal, sendHello, closePeer]);

    return { active, stream };
}
