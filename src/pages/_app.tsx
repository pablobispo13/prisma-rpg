import { useContext, useEffect } from "react";
import Head from "next/head";
import type { AppProps } from "next/app";
import { CssBaseline } from "@mui/material";
import { ToastContainer } from "react-toastify";
import { ThemeContext, ThemeContextProvider } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";
import { CampaignProvider } from "../context/CampaignContext";
import { ScreenShareProvider } from "../context/ScreenShareContext";
import Layout from "../components/Layout";
import { registerServiceWorker } from "../lib/pwa";

export default function MyApp({ Component, pageProps }: AppProps) {
    const { mode } = useContext(ThemeContext);

    useEffect(() => {
        registerServiceWorker();
    }, []);

    return (
        <ThemeContextProvider>
            <>
            <Head>
                {/* viewport-fit=cover: no PWA instalado o app ocupa a área do
                    notch; o Layout compensa com env(safe-area-inset-*) */}
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
            </Head>
            <AuthProvider>
                <CampaignProvider>
                    <ScreenShareProvider>
                        <Layout>
                            <CssBaseline />
                            <Component {...pageProps} />
                            <ToastContainer
                                theme={mode}
                                position="top-right"
                                // PWA instalado: não deixa o toast embaixo do notch/barra de status
                                style={{ paddingTop: "env(safe-area-inset-top)" }}
                                autoClose={6000}
                            />
                        </Layout>
                    </ScreenShareProvider>
                </CampaignProvider>
            </AuthProvider>
            </>
        </ThemeContextProvider>
    );
}
