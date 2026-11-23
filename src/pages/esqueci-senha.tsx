import { Box, Button, InputAdornment, Link as MuiLink, TextField, Typography } from "@mui/material";
import { useState } from "react";
import NextLink from "next/link";
import EmailIcon from "@mui/icons-material/Email";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import api from "../lib/api";
import { useForgotPasswordForm } from "../hooks/useAuthForms";
import AuthShell, { fieldSx, iconSx, submitButtonSx } from "../components/Auth/AuthShell";

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForgotPasswordForm();

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await api.post("/auth/forgot-password", { email });
      setSentTo(email);
    } catch {
      // O interceptor do api já mostra o erro em um toast.
    }
  });

  return (
    <AuthShell subtitle="Recuperar senha">
      {sentTo ? (
        <Box sx={{ textAlign: "center" }}>
          <MarkEmailReadIcon sx={{ fontSize: 44, color: "#8B9DFF", mb: 1 }} />
          <Typography sx={{ color: "#ddd", fontSize: 14, mb: 1 }}>
            Enviamos um link para <strong>{sentTo}</strong> para você redefinir a senha.
          </Typography>
          <Typography sx={{ color: "#777", fontSize: 12 }}>
            O link vale por 30 minutos. Não chegou? Confira o spam ou tente de novo em 1 minuto.
            Ao trocar a senha, todos os aparelhos conectados à sua conta serão desconectados.
          </Typography>
          <Button
            variant="text"
            onClick={() => setSentTo(null)}
            sx={{ mt: 2, color: "#8B9DFF", textTransform: "none", fontSize: 13 }}
          >
            Enviar de novo
          </Button>
        </Box>
      ) : (
        <Box component="form" onSubmit={onSubmit}>
          <Typography sx={{ color: "#aaa", fontSize: 13, mb: 1.5 }}>
            Informe o e-mail da sua conta e enviaremos um link para você escolher uma nova senha.
          </Typography>
          <TextField
            label="Email"
            fullWidth
            margin="dense"
            autoFocus
            {...register("email")}
            error={!!errors.email}
            helperText={errors.email?.message}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon sx={iconSx} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />
          <Button variant="contained" fullWidth type="submit" disabled={isSubmitting} sx={submitButtonSx}>
            {isSubmitting ? "Enviando..." : "Enviar link"}
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
