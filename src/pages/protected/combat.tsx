"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import api from "../../lib/api";
import { useCampaign } from "../../context/CampaignContext";
import CombatScreen from "../../components/Combat/CombatScreen";
import { toast } from "react-toastify";
import DiceLoader from "../../components/DiceLoader";

export default function CombatPage() {
    const params = useSearchParams();
    const router = useRouter();
    const combatId = params.get("combatId");
    const { activeCampaign, campaigns, setActiveCampaign, loading } = useCampaign();
    const [resolving, setResolving] = useState(true);

    // Garante que a mesa ativa bate com a do combate. Se não, tenta trocar.
    useEffect(() => {
        if (!combatId || loading) return;
        let cancelled = false;

        (async () => {
            try {
                // Faz lookup sem header de campanha (chamada com header pode falhar 404)
                const { data } = await api.get(`/combat/${combatId}/campaign`, { silent: true });
                const combatCampaignId: string | null = data?.campaignId ?? null;
                if (cancelled) return;

                if (!combatCampaignId) {
                    toast.error("Combate não encontrado");
                    router.replace("/protected/");
                    return;
                }

                if (activeCampaign?.id !== combatCampaignId) {
                    const target = campaigns.find((c) => c.id === combatCampaignId);
                    if (!target) {
                        toast.error("Você não participa da mesa deste combate");
                        router.replace("/protected/mesas");
                        return;
                    }
                    setActiveCampaign(target);
                }
                setResolving(false);
            } catch {
                if (!cancelled) {
                    toast.error("Combate não encontrado ou sem acesso");
                    router.replace("/protected/");
                }
            }
        })();

        return () => { cancelled = true; };
    }, [combatId, loading, activeCampaign, campaigns, setActiveCampaign, router]);

    if (!combatId) return <>Combate não encontrado</>;
    if (resolving || loading) return <DiceLoader message="Preparando o combate" />;

    return <CombatScreen key={activeCampaign?.id} combatId={combatId} />;
}
