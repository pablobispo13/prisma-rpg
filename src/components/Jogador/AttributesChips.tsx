import { Stack, Chip, Skeleton } from "@mui/material";
import { Character, Character_Attributes } from "../../types/types";
import { useCampaign } from "../../context/CampaignContext";
type Props = {
    character: Character;
    compact?: boolean;
    loading?: boolean
};

export function AttributesChips({ character, compact, loading = false }: Props) {
    const { activeCampaign } = useCampaign();
    const customAttributes = activeCampaign?.customAttributes ?? [];

    return (
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {Character_Attributes.map(({ key, label }) => <>{
                loading ? <Skeleton sx={{ width: "fit-content", mt: 1, borderRadius: "12px" }} variant="rounded" width={105} height={24} /> :
                    <Chip
                        key={key}
                        size={compact ? "small" : "medium"}
                        label={`${label}: ${character[key]}`}
                    />
            }</>
            )}
            {!loading && customAttributes.map((attr) => (
                <Chip
                    key={attr.id}
                    size={compact ? "small" : "medium"}
                    label={`${attr.label}: ${character.customAttributes?.[attr.key] ?? 0}`}
                />
            ))}
        </Stack>
    );
}
