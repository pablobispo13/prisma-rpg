import { Card, CardContent, CardActions, Stack, Button, Grid, Typography, Chip, Skeleton } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Link from "next/link";
import { Combat } from "@prisma/client";
type Props = {
  combat?: Combat;
  loading?: boolean
};

export function CombatCard({ combat, loading = false, }: Props) {
  return (
    <>
      {loading && !combat ?
        <Grid container>
          <Card
            sx={{
              height: "100%",
              background: "linear-gradient(145deg, #1c1c2e, #23233a)",
              border: "1px solid #333",
            }}
          >
            <CardContent>
              <Stack gap={1}>
                <Typography variant="h6">
                  <Skeleton />
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  <Skeleton />
                </Typography>
                <Skeleton sx={{ width: "fit-content", mt: 1, borderRadius: "12px" }} variant="rounded" width={105} height={24} />
              </Stack>
            </CardContent>
            <CardActions>
              <Button
                fullWidth
                variant="outlined"
                endIcon={<ArrowForwardIcon />}
                disabled
              >
                <Skeleton width={"100%"} />
              </Button>
            </CardActions>
          </Card>
        </Grid> :
        <Grid container key={combat?.id}>
          <Card
            sx={{
              height: "100%",
              background: "linear-gradient(145deg, #1c1c2e, #23233a)",
              border: "1px solid #333",
            }}
          >
            <CardContent>
              <Stack gap={1}>
                <Typography variant="h6">
                  {`Combate`}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  ID: {combat?.id}
                </Typography>

                <Chip
                  label="Em andamento"
                  color="success"
                  size="small"
                  sx={{ width: "fit-content", mt: 1 }}
                />
              </Stack>
            </CardContent>

            <CardActions>
              <Button
                fullWidth
                variant="outlined"
                endIcon={<ArrowForwardIcon />}
                // Mesma aba (Link): a ficha agora abre dentro do combate, então
                // não há mais motivo para manter as duas telas abertas. Ao
                // encerrar, o combate leva de volta para a ficha.
                component={Link}
                href={`/protected/combat?combatId=${combat?.id}`}
              >
                Abrir combate
              </Button>
            </CardActions>
          </Card></Grid>}
    </>
  );
}
