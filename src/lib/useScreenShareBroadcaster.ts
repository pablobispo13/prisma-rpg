import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import { getPusherClient } from "./pusherClient";
import { RTC_CONFIG, ScreenShareSignal, ScreenShareState } from "./webrtc";

type PeerEntry = { pc: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] };

// Gerencia o lado do mestre: captura a tela via getDisplayMedia e abre uma
// RTCPeerConnection por jogador conectado (mesh), sinalizando via Pusher.
export function useScreenShareBroadcaster(campaignId: string | null) {
    const [sharing, setSharing] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [viewerCount, setViewerCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const masterClientIdRef = useRef<string>(typeof window !== "undefined" ? crypto.randomUUID() : "");
    const sessionIdRef = useRef<string | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Map<string, PeerEntry>>(new Map());
    const sharingRef = useRef(false);

    const stopInternal = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        peersRef.current.forEach(({ pc }) => pc.close());
        peersRef.current.clear();
        sessionIdRef.current = null;
        sharingRef.current = false;
        setSharing(false);
        setLocalStream(null);
        setViewerCount(0);
    }, []);

    const sendSignal = useCallback((payload: Omit<ScreenShareSignal, "fromUserId">) => {
        if (!campaignId) return;
        api.post("/screen-share/signal", payload, { silent: true }).catch(() => {});
    }, [campaignId]);

    const createPeerForViewer = useCallback((viewerClientId: string) => {
        peersRef.current.get(viewerClientId)?.pc.close();

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const entry: PeerEntry = { pc, pendingCandidates: [] };
        peersRef.current.set(viewerClientId, entry);
        setViewerCount(peersRef.current.size);

        streamRef.current?.getTracks().forEach((track) => {
            pc.addTrack(track, streamRef.current!);
        });

        pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            sendSignal({
                type: "ice-candidate",
                toClientId: viewerClientId,
                fromClientId: masterClientIdRef.current,
                sessionId: sessionIdRef.current,
                candidate: e.candidate.toJSON(),
            });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "closed" || pc.connectionState === "failed") {
                if (peersRef.current.get(viewerClientId)?.pc === pc) {
                    peersRef.current.delete(viewerClientId);
                    setViewerCount(peersRef.current.size);
                }
            }
        };

        pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer).then(() => offer))
            .then((offer) => {
                sendSignal({
                    type: "offer",
                    toClientId: viewerClientId,
                    fromClientId: masterClientIdRef.current,
                    sessionId: sessionIdRef.current,
                    sdp: offer,
                });
            })
            .catch(() => {});
    }, [sendSignal]);

    const handleSignal = useCallback((msg: ScreenShareSignal) => {
        if (!sharingRef.current) return;

        if (msg.type === "viewer-hello") {
            createPeerForViewer(msg.fromClientId);
            return;
        }

        if (msg.toClientId !== masterClientIdRef.current) return;
        const entry = peersRef.current.get(msg.fromClientId);
        if (!entry) return;

        if (msg.type === "answer" && msg.sdp) {
            entry.pc.setRemoteDescription(msg.sdp)
                .then(() => {
                    entry.pendingCandidates.forEach((c) => entry.pc.addIceCandidate(c).catch(() => {}));
                    entry.pendingCandidates.length = 0;
                })
                .catch(() => {});
        } else if (msg.type === "ice-candidate" && msg.candidate) {
            if (entry.pc.remoteDescription) {
                entry.pc.addIceCandidate(msg.candidate).catch(() => {});
            } else {
                entry.pendingCandidates.push(msg.candidate);
            }
        }
    }, [createPeerForViewer]);

    // Assina os canais de estado e sinalização da campanha ativa
    useEffect(() => {
        if (!campaignId) return;
        const pusher = getPusherClient();
        if (!pusher) return;

        const stateChannel = pusher.subscribe(`campaign-${campaignId}-screenshare`);
        const onState = (state: ScreenShareState) => {
            // Outra aba do mestre venceu a corrida — desliga localmente sem chamar /stop
            if (sharingRef.current && state.sessionId && state.sessionId !== sessionIdRef.current) {
                stopInternal();
            }
        };
        stateChannel.bind("state", onState);

        const signalChannel = pusher.subscribe(`private-campaign-${campaignId}-screenshare-signal`);
        const onSignal = (msg: ScreenShareSignal) => handleSignal(msg);
        signalChannel.bind("signal", onSignal);

        return () => {
            stateChannel.unbind("state", onState);
            signalChannel.unbind("signal", onSignal);
            pusher.unsubscribe(`campaign-${campaignId}-screenshare`);
            pusher.unsubscribe(`private-campaign-${campaignId}-screenshare-signal`);
        };
    }, [campaignId, handleSignal, stopInternal]);

    const stop = useCallback(async () => {
        const sessionId = sessionIdRef.current;
        stopInternal();
        if (sessionId) {
            try {
                await api.post("/screen-share/stop", { sessionId });
            } catch {
                // melhor esforço — estado local já foi limpo
            }
        }
    }, [stopInternal]);

    const start = useCallback(async () => {
        setError(null);
        if (!campaignId) return;
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setError("Seu navegador não suporta compartilhamento de tela.");
            return;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } catch (err) {
            const name = (err as DOMException)?.name;
            setError(name === "NotAllowedError" ? "Compartilhamento cancelado." : "Não foi possível iniciar o compartilhamento de tela.");
            return;
        }

        try {
            const { data } = await api.post("/screen-share/start");
            sessionIdRef.current = data.sessionId;
        } catch {
            stream.getTracks().forEach((t) => t.stop());
            setError("Não foi possível iniciar o compartilhamento (servidor).");
            return;
        }

        streamRef.current = stream;
        // Disparado quando o mestre clica "Parar compartilhamento" na barra nativa do browser
        stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());

        sharingRef.current = true;
        setSharing(true);
        setLocalStream(stream);
    }, [campaignId, stop]);

    // Cleanup ao desmontar ou trocar de campanha
    useEffect(() => {
        return () => {
            if (sharingRef.current) stopInternal();
        };
    }, [campaignId, stopInternal]);

    // Best-effort: avisa o servidor se a aba fechar enquanto compartilha
    useEffect(() => {
        function handleBeforeUnload() {
            if (!sharingRef.current || !sessionIdRef.current) return;
            const token = localStorage.getItem("token");
            const activeCampaignId = localStorage.getItem("activeCampaignId");
            fetch("/api/screen-share/stop", {
                method: "POST",
                keepalive: true,
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(activeCampaignId ? { "x-campaign-id": activeCampaignId } : {}),
                },
                body: JSON.stringify({ sessionId: sessionIdRef.current }),
            }).catch(() => {});
        }
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    return { sharing, localStream, viewerCount, error, start, stop };
}
