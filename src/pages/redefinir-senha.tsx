import { Box, Button, IconButton, InputAdornment, Link as MuiLink, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import Head from "next/head";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import LockIcon from "@mui/icons-material/Lock";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import api from "../lib/api";
import { useResetPasswordForm } from "../hooks/useAuthForms";
import AuthShell, { fieldSx, iconSx, submitButtonSx } from "../components/Auth/AuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [tokenChecked, setTokenChecked] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // O token vem no fragmento (#token=...), que nunca chega ao servidor. Lemos uma
  // vez, guardamos em memória e limpamos a barra de endereço (histórico/prints).
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // Compatibilidade com links antigos no formato ?token=
    const fromQuery = new URLSearchParams(window.location.search).get("token");
    const found = fromHash || fromQuery || "";
    if (found) {
      setToken(found);
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    setTokenChecked(true);
  }, []);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useResetPasswordForm();

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      const { data } = await api.post("/auth/reset-password", { token, password });
      toast.success(data.message);
      router.replace("/login");
    } catch {
      // O interceptor do api já mostra o erro em um toast.
    }
  });

  const passwordProps = {
    type: showPass ? "text" : "password",
    fullWidth: true,
    margin: "dense" as const,
    sx: fieldSx,
    InputProps: {
      startAdornment: (
        <InputAdornment position="start">
          <LockIcon sx={iconSx} />
        </InputAdornment>
      ),
      endAdornment: (
        <InputAdornment position="end">
          <IconButton
            size="small"
            onClick={() => setShowPass((v) => !v)}
            sx={{ color: "#555", "&:hover": { color: "#8B9DFF" } }}
            tabIndex={-1}
          >
            {showPass ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
          </IconButton>
        </InputAdornment>
      ),
    },
  };

  return (
    <AuthShell subtitle="Nova senha">
      <Head>
        {/* Nada desta página vaza no Referer para outros sites */}
        <meta name="referrer" content="no-referrer" />
      </Head>
      {tokenChecked && !token ? (
        <Typography sx={{ color: "#ddd", fontSize: 14, textAlign: "center" }}>
          Link inválido. Abra o link exatamente como veio no e-mail ou{" "}
          <MuiLink component={NextLink} href="/esqueci-senha" sx={{ color: "#8B9DFF" }}>
            peça um novo
          </MuiLink>
          .
        </Typography>
      ) : (
        <Box component="form" onSubmit={onSubmit}>
          <TextField
            label="Nova senha"
            autoFocus
            {...passwordProps}
            {...register("password")}
            error={!!errors.password}
            helperText={errors.password?.message}
          />
          <TextField
            label="Confirmar nova senha"
            {...passwordProps}
            {...register("confirmPassword")}
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
          />
          <Button variant="contained" fullWidth type="submit" disabled={isSubmitting} sx={submitButtonSx}>
            {isSubmitting ? "Salvando..." : "Redefinir senha"}
          </Button>
        </Box>
      )}

      <Box sx={{ textAlign: "center", mt: 2.5 }}>
        <MuiLink component={NextLink} href="/login" underline="hover" sx={{ fontSize: 12, color: "#8B9DFF" }}>
          Voltar para o login
        </MuiLink>
      </Box>
    </AuthShell>
  );
}
