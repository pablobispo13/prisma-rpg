import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Paper,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useLoginForm, useRegisterForm } from "../hooks/useAuthForms";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import DiceLogo from "../components/DiceLogo";
import EmailIcon from "@mui/icons-material/Email";
import LockIcon from "@mui/icons-material/Lock";
import PersonIcon from "@mui/icons-material/Person";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "rgba(107,122,219,0.25)" },
    "&:hover fieldset": { borderColor: "rgba(107,122,219,0.5)" },
    "&.Mui-focused fieldset": { borderColor: "#6B7ADB" },
    background: "rgba(255,255,255,0.03)",
    borderRadius: 1.5,
  },
  "& .MuiInputLabel-root": { color: "#666" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#8B9DFF" },
  "& .MuiInputBase-input": { fontSize: 14 },
};

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

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 50% -10%, rgba(107,122,219,0.18) 0%, #0e0e1a 55%)",
        p: 2,
      }}
    >
      {/* Decorative glow orbs */}
      <Box
        sx={{
          position: "fixed",
          top: "10%",
          left: "15%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(107,122,219,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "fixed",
          bottom: "15%",
          right: "10%",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,157,255,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <Paper
        elevation={24}
        sx={{
          width: "100%",
          maxWidth: 420,
          p: 4,
          background:
            "linear-gradient(145deg, rgba(28,28,50,0.9) 0%, rgba(14,14,26,0.97) 100%)",
          border: "1px solid rgba(107,122,219,0.25)",
          borderRadius: 3,
          backdropFilter: "blur(16px)",
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, rgba(107,122,219,0.6), transparent)",
          },
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 3.5 }}>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
            <DiceLogo size={48} />
          </Box>
          <Typography
            variant="h5"
            sx={{
              color: "#8B9DFF",
              fontWeight: 800,
              letterSpacing: 3,
              fontSize: 20,
              textTransform: "uppercase",
              fontFamily: "'Rubik', sans-serif",
            }}
          >
            Prisma RPG
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: "#555", fontSize: 11, letterSpacing: 0.5 }}
          >
            Sistema de combate e gestão
          </Typography>
        </Box>

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
            onSubmit={handleLoginSubmit(({ email, password }) =>
              login(email, password)
            )}
          >
            <TextField
              label="Email"
              fullWidth
              margin="dense"
              {...loginRegister("email")}
              error={!!loginErrors.email}
              helperText={loginErrors.email?.message}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon sx={{ fontSize: 16, color: "rgba(107,122,219,0.6)" }} />
                  </InputAdornment>
                ),
              }}
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
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon sx={{ fontSize: 16, color: "rgba(107,122,219,0.6)" }} />
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
                      {showPass ? (
                        <VisibilityOff sx={{ fontSize: 16 }} />
                      ) : (
                        <Visibility sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={fieldSx}
            />
            <Button
              variant="contained"
              fullWidth
              type="submit"
              sx={{
                mt: 3,
                py: 1.4,
                background: "linear-gradient(135deg, #5a6bcf 0%, #7b8ee8 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #4a5bbf 0%, #6a7dd8 100%)",
                  boxShadow: "0 4px 20px rgba(107,122,219,0.4)",
                },
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "none",
                fontSize: 14,
                borderRadius: 2,
                transition: "all 0.2s",
              }}
            >
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
                    <PersonIcon sx={{ fontSize: 16, color: "rgba(107,122,219,0.6)" }} />
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
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon sx={{ fontSize: 16, color: "rgba(107,122,219,0.6)" }} />
                  </InputAdornment>
                ),
              }}
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
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon sx={{ fontSize: 16, color: "rgba(107,122,219,0.6)" }} />
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
                      {showPass ? (
                        <VisibilityOff sx={{ fontSize: 16 }} />
                      ) : (
                        <Visibility sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={fieldSx}
            />
            <Button
              variant="contained"
              fullWidth
              type="submit"
              sx={{
                mt: 3,
                py: 1.4,
                background: "linear-gradient(135deg, #5a6bcf 0%, #7b8ee8 100%)",
                "&:hover": {
                  background: "linear-gradient(135deg, #4a5bbf 0%, #6a7dd8 100%)",
                  boxShadow: "0 4px 20px rgba(107,122,219,0.4)",
                },
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "none",
                fontSize: 14,
                borderRadius: 2,
                transition: "all 0.2s",
              }}
            >
              Criar conta
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
