"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "./AuthContext";
import { CustomAttributeType } from "../types/types";

export type CampaignInvite = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
};

export type CampaignSummary = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  archivedAt: string | null;
  defenseFormula: string | null;
  maxLifeFormula: string | null;
  reactionsPerRound: number | null;
  characterImageColor: string | null;
  worldDay: number | null;
  abilitySanityCost: number | null;
  customAttributes: CustomAttributeType[];
  masterId: string;
  master: { id: string; username: string };
  members: { id: string; user: { id: string; username: string } }[];
  invites?: CampaignInvite[];
  _count?: { characters: number; combats: number };
};

type CampaignContextProps = {
  campaigns: CampaignSummary[];
  activeCampaign: CampaignSummary | null;
  loading: boolean;
  setActiveCampaign: (campaign: CampaignSummary | null) => void;
  reload: (opts?: { includeArchived?: boolean }) => Promise<void>;
};

const CampaignContext = createContext<CampaignContextProps>({} as CampaignContextProps);

const ACTIVE_KEY = "activeCampaignId";

export function CampaignProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCampaign, setActiveCampaignState] = useState<CampaignSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const setActiveCampaign = useCallback((campaign: CampaignSummary | null) => {
    setActiveCampaignState(campaign);
    if (typeof window === "undefined") return;
    if (campaign) localStorage.setItem(ACTIVE_KEY, campaign.id);
    else localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const reload = useCallback(async (opts?: { includeArchived?: boolean }) => {
    // Enquanto auth ainda carrega, mantém loading=true e espera resolver
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!isAuthenticated) {
      setCampaigns([]);
      setActiveCampaignState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = opts?.includeArchived ? { includeArchived: "true" } : undefined;
      const { data } = await api.get("/campaigns", { silent: true, params });
      const list: CampaignSummary[] = data.campaigns ?? [];
      setCampaigns(list);

      // Restaura mesa ativa do localStorage, se ainda válida e não arquivada
      const savedId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
      const found = savedId ? list.find((c) => c.id === savedId && !c.archivedAt) : null;
      const activeList = list.filter((c) => !c.archivedAt);
      if (found) {
        setActiveCampaignState(found);
      } else if (activeList.length === 1) {
        setActiveCampaign(activeList[0]);
      } else {
        setActiveCampaignState(null);
      }
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authLoading, setActiveCampaign]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <CampaignContext.Provider value={{ campaigns, activeCampaign, loading, setActiveCampaign, reload }}>
      {children}
    </CampaignContext.Provider>
  );
}

export const useCampaign = () => useContext(CampaignContext);
