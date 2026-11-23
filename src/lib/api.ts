// lib/api.ts
import axios, { AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import { toast } from "react-toastify";

declare module "axios" {
  interface AxiosRequestConfig {
    silent?: boolean;
  }
}

/** Header anti-CSRF exigido pelo servidor em requisições que alteram dados (ver lib/session.ts). */
export const CSRF_HEADERS = { "X-Requested-With": "prisma-rpg" } as const;

export function handleLogout(reason?: "expired" | "manual") {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token"); // resquício do login antigo, se existir
  if (reason) localStorage.setItem("logout_reason", reason);
  window.location.href = "/login";
}

// A sessão vai no cookie HttpOnly (enviado automaticamente pelo navegador);
// o JavaScript não tem acesso ao token.
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window === "undefined") return config;

  if (!config.headers) {
    config.headers = new AxiosHeaders();
  } else if (!(config.headers instanceof AxiosHeaders)) {
    config.headers = AxiosHeaders.from(config.headers);
  }

  for (const [k, v] of Object.entries(CSRF_HEADERS)) config.headers.set(k, v);

  const activeCampaignId = localStorage.getItem("activeCampaignId");
  if (activeCampaignId) {
    config.headers.set("x-campaign-id", activeCampaignId);
  }

  return config;
});

// Interceptor response: trata erros globais
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const silent = error.config?.silent === true;
    if (!silent) {
      if (error.response) {
        const { status, data } = error.response;
        // 401 nas rotas de login/cadastro é "senha incorreta", não sessão expirada
        const isAuthRoute = String(error.config?.url ?? "").startsWith("/auth/");
        if (status === 401 && !isAuthRoute) {
          handleLogout("expired");
        } else {
          toast.error(data?.message || `Erro: ${status}`);
        }
      } else {
        toast.error("Sem resposta do servidor.");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
