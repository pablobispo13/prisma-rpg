"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";

type Character = { id: string; name: string };

type User = {
  id: string;
  role: "MESTRE" | "JOGADOR";
  username: string;
  isAdmin: boolean;
  characterIds: string[];
};

type AuthContextProps = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: (reason?: "expired" | "manual") => Promise<void>;
};

const AuthContext = createContext<AuthContextProps>({} as AuthContextProps);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user;

  useEffect(() => {
    // O cookie de sessão é HttpOnly: não dá para saber pelo JS se ele existe,
    // então sempre perguntamos ao servidor (silent: 401 aqui só significa "deslogado").
    // Migração: quem logou na versão antiga tem o JWT no localStorage; enviamos
    // uma única vez e o servidor converte para cookie.
    const legacyToken = localStorage.getItem("token");

    api.get("/auth/me", {
      silent: true,
      headers: legacyToken ? { Authorization: `Bearer ${legacyToken}` } : undefined,
    })
      .then(({ data }) => {
        const characterIds = data.user.characters?.map((c: Character) => c.id) || [];
        setUser({ ...data.user, characterIds });
      })
      .catch(() => setUser(null))
      .finally(() => {
        localStorage.removeItem("token");
        setLoading(false);
      });
  }, []);

  const postLoginRedirect = () => {
    // Convite pendente: prioriza retornar pra tela de join
    const pendingCode = typeof window !== "undefined"
      ? localStorage.getItem("pending_invite_code")
      : null;
    if (pendingCode) {
      router.replace(`/protected/join?code=${pendingCode}`);
      return;
    }
    router.replace("/protected/");
  };

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data.user);
    postLoginRedirect();
  };

  const register = async (username: string, email: string, password: string) => {
    const { data } = await api.post("/auth/register", { username, email, password });
    setUser(data.user);
    postLoginRedirect();
  };

  const logout = async (reason?: "expired" | "manual") => {
    // Só o servidor consegue apagar o cookie HttpOnly
    await api.post("/auth/logout", {}, { silent: true }).catch(() => {});
    localStorage.removeItem("token");
    if (reason) localStorage.setItem("logout_reason", reason);
    setUser(null);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
