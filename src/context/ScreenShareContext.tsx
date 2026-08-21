"use client";

import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useCampaign } from "./CampaignContext";
import { useScreenShareBroadcaster } from "../lib/useScreenShareBroadcaster";
import { useScreenShareViewer } from "../lib/useScreenShareViewer";

type ScreenShareContextValue = {
    isMaster: boolean;
    sharing: boolean;
    active: boolean;
    stream: MediaStream | null;
    viewerCount: number;
    error: string | null;
    start: () => void;
    stop: () => void;
};

const ScreenShareContext = createContext<ScreenShareContextValue>({
    isMaster: false,
    sharing: false,
    active: false,
    stream: null,
    viewerCount: 0,
    error: null,
    start: () => {},
    stop: () => {},
});

// Provider único, montado no topo do app: mantém exatamente 1 RTCPeerConnection
// (ou N, se mestre) por aba durante toda a sessão, evitando reconexões a cada
// troca de tela (ficha <-> combate).
export function ScreenShareProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { activeCampaign } = useCampaign();
    const campaignId = activeCampaign?.id ?? null;
    const isMaster = !!user && !!activeCampaign && activeCampaign.masterId === user.id;

    const broadcaster = useScreenShareBroadcaster(isMaster ? campaignId : null);
    const viewer = useScreenShareViewer(!isMaster ? campaignId : null);

    const value = useMemo<ScreenShareContextValue>(() => {
        if (isMaster) {
            return {
                isMaster: true,
                sharing: broadcaster.sharing,
                active: broadcaster.sharing,
                stream: broadcaster.localStream,
                viewerCount: broadcaster.viewerCount,
                error: broadcaster.error,
                start: broadcaster.start,
                stop: broadcaster.stop,
            };
        }
        return {
            isMaster: false,
            sharing: false,
            active: viewer.active,
            stream: viewer.stream,
            viewerCount: 0,
            error: null,
            start: () => {},
            stop: () => {},
        };
    }, [isMaster, broadcaster, viewer]);

    return <ScreenShareContext.Provider value={value}>{children}</ScreenShareContext.Provider>;
}

export const useScreenShareContext = () => useContext(ScreenShareContext);
