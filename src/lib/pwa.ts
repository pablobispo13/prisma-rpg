import { useEffect, useState } from "react";

/**
 * Registra o service worker (public/sw.js). Só em produção: em dev o cache
 * do SW brigaria com o hot reload do Next.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem SW o app continua funcionando normalmente, só não é instalável
    });
  });
}

/** true quando o app roda instalado (janela própria, sem barra do navegador). */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS antigo não suporta display-mode
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Abre uma página do app. No navegador comum mantém o comportamento de nova
 * aba; no PWA instalado navega na própria janela — no iOS uma "nova aba"
 * sai do app pro Safari, que tem localStorage separado (usuário apareceria
 * deslogado), e no Android abre fora da janela do app.
 */
export function openAppPage(url: string) {
  if (isStandalone()) {
    window.location.assign(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Expõe o prompt de instalação do navegador (Chrome/Edge/Android) para um
 * botão "Instalar app". No iOS esse evento não existe — lá a instalação é
 * manual, por "Compartilhar → Adicionar à Tela de Início".
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return { canInstall: !!deferred && !installed, install };
}
