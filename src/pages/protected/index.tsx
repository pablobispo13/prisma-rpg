"use client";

import { useAuth } from "../../context/AuthContext";
import { useCampaign } from "../../context/CampaignContext";
import { useRouter, useSearchParams } from "next/navigation";
import Mestre from "./mestre";
import Jogador from "./jogador";
import { handleLogout } from "../../lib/api";
import { useEffect, useState } from "react";
import DiceLoader from "../../components/DiceLoader";

export default function Mesa() {
  const { user } = useAuth();
  const { activeCampaign, campaigns, loading: campaignLoading } = useCampaign();
  const router = useRouter();
  const searchParams = useSearchParams();
  const MAX_TENTATIVAS = 3;
  const INTERVALO_MS = 500;
  const [tentativas, setTentativas] = useState(0);

  useEffect(() => {
    if (user) {
      setTentativas(0);
      return;
    }

    if (tentativas >= MAX_TENTATIVAS) {
      handleLogout("expired");
      return;
    }

    const timer = setTimeout(() => {
      setTentativas((prev) => prev + 1);
    }, INTERVALO_MS);

    return () => clearTimeout(timer);
  }, [user, tentativas]);

  // Sem mesa ativa: usuário novo (nenhuma mesa) vê o tour de boas-vindas;
  // quem já tem mesas vai pra tela de seleção
  useEffect(() => {
    if (!user || campaignLoading) return;
    if (!activeCampaign) {
      const hasAnyCampaign = campaigns.some((c) => !c.archivedAt);
      router.replace(hasAnyCampaign ? "/protected/mesas" : "/protected/bem-vindo");
    }
  }, [user, campaignLoading, activeCampaign, campaigns, router]);

  if (!user || campaignLoading) {
    return <DiceLoader message="Carregando a mesa" />;
  }
  if (!activeCampaign) {
    return <DiceLoader message="Escolhendo a mesa" flavor={[]} />;
  }

  const view = searchParams.get("view");
  const characterId = searchParams.get("characterId");
  const isCampaignMaster = activeCampaign?.masterId === user.id;

  if (isCampaignMaster && view === "jogador") {
    return (
      <Jogador
        key={activeCampaign.id}
        isSpectator
        forcedCharacterId={characterId}
      />
    );
  }

  if (isCampaignMaster) {
    return <Mestre key={activeCampaign.id} />;
  }

  return <Jogador key={activeCampaign.id} />;
}
