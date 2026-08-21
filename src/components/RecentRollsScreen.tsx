"use client";

import {
    Box,
    Stack,
    CircularProgress,
    Button,
    Typography,
    MenuItem,
    TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import api from "../lib/api";
import { RollInfoCard } from "./Log/RollInfoCard";

type Roll = {
    id: string;
    characterId: string;
    presetId: string;
    combatId: string | null;
    turnId: string | null;
    targetIds: string[];

    diceRolled: string;
    rolls: number[];
    modifier: number;
    total: number;
    impactRolls: number[];
    impactFormulaResolved: string | null;

    success: boolean;
    critical: boolean;

    damage: number | null;
    healing: number | null;

    pendingReaction: boolean;
    reactionType: string | null;
    reacted: boolean;

    createdAt: string;

    character: {
        id: string;
        name: string;
    };

    preset: {
        id: string;
        name: string;
        type: string;
        impactFormula: string | null;
    } | null;
};

type CombatOption = {
    id: string;
    round: number;
    createdAt: string;
    participants: { character: { name: string } }[];
};

export default function RecentRollsScreen() {
    const [rolls, setRolls] = useState<Roll[]>([]);
    const [loading, setLoading] = useState(true);
    const [combatFilter, setCombatFilter] = useState<string>("all");
    const [combats, setCombats] = useState<CombatOption[]>([]);

    useEffect(() => {
        api.get("/combat/active")
            .then((res) => setCombats(Array.isArray(res.data) ? res.data : []))
            .catch(() => setCombats([]));
    }, []);

    async function loadRolls() {
        try {
            setLoading(true);
            const params: Record<string, string | number> = { limit: 30 };
            if (combatFilter !== "all") params.combatId = combatFilter;
            const res = await api.get("/roll", { params });
            setRolls(
                (res.data.rolls ?? []).sort(
                    (a: Roll, b: Roll) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime()
                )
            );
        } catch (err) {
            console.error("Erro ao carregar testes", err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadRolls();
    }, [combatFilter]);

    return (
        <Box
            sx={{
                minHeight: "100vh",
                backgroundColor: "#0e0e1a",
                color: "#fff",
                p: 3,
            }}
        >
            <Stack spacing={2} sx={{ maxWidth: 800, mx: "auto" }}>
                <Typography variant="h5" fontWeight="bold">
                    Rolagens Recentes
                </Typography>

                <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                        select
                        label="Filtrar por Combate"
                        value={combatFilter}
                        onChange={(e) => setCombatFilter(e.target.value)}
                        size="small"
                        sx={{ minWidth: 240 }}
                    >
                        <MenuItem value="all">Todos os combates</MenuItem>
                        <MenuItem value="none">Sem combate (livres)</MenuItem>
                        {combats.map((c) => (
                            <MenuItem key={c.id} value={c.id}>
                                Round {c.round} — {c.participants.map((p) => p.character.name).join(", ")}
                            </MenuItem>
                        ))}
                    </TextField>

                    <Button
                        variant="outlined"
                        onClick={loadRolls}
                        disabled={loading}
                    >
                        Atualizar
                    </Button>
                </Stack>

                {loading ? (
                    <Box display="flex" justifyContent="center" mt={4}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        {rolls.map((roll) => (
                            <RollInfoCard
                                key={roll.id}
                                characterName={roll.character.name}
                                actionName={roll.preset?.name}
                                actionType={roll.preset?.type}
                                diceFormula={roll.diceRolled}
                                diceRolls={roll.rolls}
                                modifier={roll.modifier}
                                total={roll.total}
                                critical={roll.critical}
                                succeeded={roll.success}
                                damage={roll.damage}
                                healing={roll.healing}
                                impactRolls={roll.impactRolls}
                                impactFormula={roll.impactFormulaResolved ?? roll.preset?.impactFormula}
                                timestamp={roll.createdAt}
                            />
                        ))}

                        {rolls.length === 0 && (
                            <Typography textAlign="center" color="#888">
                                Nenhuma rolagem encontrada.
                            </Typography>
                        )}
                    </Stack>
                )}
            </Stack>
        </Box>
    );
}
