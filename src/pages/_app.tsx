import { useContext } from "react";
import Head from "next/head";
import type { AppProps } from "next/app";
import { CssBaseline } from "@mui/material";
import { ToastContainer } from "react-toastify";
import { ThemeContext, ThemeContextProvider } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";
import { CampaignProvider } from "../context/CampaignContext";
import { ScreenShareProvider } from "../context/ScreenShareContext";
import Layout from "../components/Layout";

export default function MyApp({ Component, pageProps }: AppProps) {
    const { mode } = useContext(ThemeContext);


    return (
        <ThemeContextProvider>
            <>
            <Head>
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
