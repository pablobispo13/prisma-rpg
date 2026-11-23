import {
  Box,
  Tabs,
  Tab,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  Link as MuiLink,
} from "@mui/material";
import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useLoginForm, useRegisterForm } from "../hooks/useAuthForms";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import AuthShell, { fieldSx, iconSx, submitButtonSx } from "../components/Auth/AuthShell";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import PersonIcon from "@mui/icons-material/Person";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

export default function LoginPage() {
  const { login, register, user } = useAuth();
  const [tab, setTab] = useState(0);
  const [showPass, setShowPass] = useState(false);

  const {
    register: loginRegister,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useLoginForm();

  const {
    register: registerRegister,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
  } = useRegisterForm();

  const router = useRouter();

  useEffect(() => {
    const reason = localStorage.getItem("logout_reason");
    if (reason === "expired") toast.error("Sua sessão expirou. Faça login novamente.");
    if (reason === "manual") toast.info("Você saiu da sua conta.");
    if (reason) localStorage.removeItem("logout_reason");
  }, []);

  useEffect(() => {
    if (!user) return;
    const pendingCode = localStorage.getItem("pending_invite_code");
    if (pendingCode) {
      router.replace(`/protected/join?code=${pendingCode}`);
    } else {
      router.replace("/protected/");
    }
  }, [user, router]);

  const passwordAdornment = {
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
  };

  const emailAdornment = {
    startAdornment: (
      <InputAdornment position="start">
        <EmailIcon sx={iconSx} />
      </InputAdornment>
    ),
  };

  return (
    <AuthShell>
      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setShowPass(false); }}
        variant="fullWidth"
        sx={{
          mb: 3,
          minHeight: 36,
          "& .MuiTabs-indicator": {
            backgroundColor: "#6B7ADB",
            height: 2,
            borderRadius: 1,
          },
          "& .MuiTab-root": {
            color: "#555",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "none",
            minHeight: 36,
            transition: "color 0.2s",
          },
          "& .Mui-selected": { color: "#8B9DFF !important" },
          borderBottom: "1px solid rgba(107,122,219,0.15)",
        }}
      >
        <Tab label="Entrar" />
        <Tab label="Criar conta" />
      </Tabs>

      {/* Login form */}
      {tab === 0 && (
        <Box
          component="form"
          onSubmit={handleLoginSubmit(({ email, password }) => login(email, password))}
        >
          <TextField
            label="Email"
            fullWidth
            margin="dense"
            {...loginRegister("email")}
            error={!!loginErrors.email}
            helperText={loginErrors.email?.message}
            InputProps={emailAdornment}
            sx={fieldSx}
          />
          <TextField
            label="Senha"
            type={showPass ? "text" : "password"}
            fullWidth
            margin="dense"
            {...loginRegister("password")}
            error={!!loginErrors.password}
            helperText={loginErrors.password?.message}
            InputProps={passwordAdornment}
            sx={fieldSx}
          />
          <Box sx={{ textAlign: "right", mt: 0.5 }}>
            <MuiLink
              component={NextLink}
              href="/esqueci-senha"
              underline="hover"
              sx={{ fontSize: 12, color: "#8B9DFF" }}
            >
              Esqueci minha senha
            </MuiLink>
          </Box>
          <Button variant="contained" fullWidth type="submit" sx={submitButtonSx}>
            Entrar
          </Button>
        </Box>
      )}

      {/* Register form */}
      {tab === 1 && (
        <Box
          component="form"
          onSubmit={handleRegisterSubmit(({ username, email, password }) =>
            register(username, email, password)
          )}
        >
          <TextField
            label="Nome"
            fullWidth
            margin="dense"
            {...registerRegister("username")}
            error={!!registerErrors.username}
            helperText={registerErrors.username?.message}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PersonIcon sx={iconSx} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />
          <TextField
            label="Email"
            fullWidth
            margin="dense"
            {...registerRegister("email")}
            error={!!registerErrors.email}
            helperText={registerErrors.email?.message}
            InputProps={emailAdornment}
            sx={fieldSx}
          />
          <TextField
            label="Senha"
            type={showPass ? "text" : "password"}
            fullWidth
            margin="dense"
            {...registerRegister("password")}
            error={!!registerErrors.password}
            helperText={registerErrors.password?.message}
            InputProps={passwordAdornment}
            sx={fieldSx}
          />
          <Button variant="contained" fullWidth type="submit" sx={submitButtonSx}>
            Criar conta
          </Button>
        </Box>
      )}
    </AuthShell>
  );
}
