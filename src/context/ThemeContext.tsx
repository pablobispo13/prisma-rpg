import {
    ThemeProvider,
    createTheme,
    useMediaQuery,
} from "@mui/material";
import React, {
    createContext,
    ReactElement,
    useEffect,
    useState,
} from "react";

type ThemeType = "light" | "dark";

interface ThemeContextInterface {
    mode: ThemeType;
    toggleColorMode: () => void;
}

export const ThemeContext = createContext<ThemeContextInterface>({
    mode: "dark",
    toggleColorMode: () => { },
});

interface ThemeContextProviderInterface {
    children: ReactElement | null;
}

export const ThemeContextProvider: React.FC<ThemeContextProviderInterface> = ({
    children,
}) => {
    // Estado inicial FIXO → SSR e client começam iguais
    const [mode, setMode] = useState<ThemeType>("dark");

    // Só roda no client
    const prefersDarkMode = useMediaQuery(
        "(prefers-color-scheme: dark)",
        { noSsr: true }
    );

    // Hidratação segura
    useEffect(() => {
        const storedTheme = localStorage.getItem("theme");

        if (storedTheme === "light" || storedTheme === "dark") {
            setMode(storedTheme);
        } else {
            setMode(prefersDarkMode ? "dark" : "light");
        }
    }, [prefersDarkMode]);

    useEffect(() => {
        localStorage.setItem("theme", mode);
    }, [mode]);

    const toggleColorMode = () => {
        setMode((prev) => (prev === "light" ? "dark" : "light"));
    };

    const scrollbarColor = mode === "dark" ? "#536480" : "#042e39";

    const baseTheme = createTheme({ palette: { mode } });
    const mobile = baseTheme.breakpoints.down("sm");

    const theme = createTheme(baseTheme, {
        components: {
            // Regras globais de responsividade: valem para TODOS os dialogs,
            // tooltips e inputs do app, sem precisar tratar caso a caso
            MuiDialog: {
                styleOverrides: {
                    paper: {
                        [mobile]: {
                            // Default do MUI é margin 32px — no celular
                            // sobrava ~300px de largura útil pro conteúdo
                            margin: 8,
                            width: "calc(100% - 16px)",
                            maxWidth: "calc(100% - 16px) !important",
                            maxHeight: "calc(100% - 16px)",
                        },
                    },
                },
            },
            MuiDialogTitle: {
                styleOverrides: { root: { [mobile]: { padding: "14px 16px 8px", fontSize: "1.1rem" } } },
            },
            MuiDialogContent: {
                styleOverrides: { root: { [mobile]: { padding: "8px 16px" } } },
            },
            MuiDialogActions: {
                // Vários botões no rodapé quebram de linha em vez de vazar
                styleOverrides: { root: { flexWrap: "wrap", gap: 4, [mobile]: { padding: "8px 12px 12px" } } },
            },
            MuiTooltip: {
                // Toque: tooltip abre com toque longo (400ms) e fica 3s
                // visível pra dar tempo de ler
                defaultProps: { enterTouchDelay: 400, leaveTouchDelay: 3000 },
            },
            MuiInputBase: {
                styleOverrides: {
                    input: {
                        // iOS dá zoom automático ao focar input com fonte
                        // < 16px — trava a tela "ampliada" no meio do combate
                        "@media (pointer: coarse)": { fontSize: 16 },
                    },
                },
            },
            MuiCssBaseline: {
                styleOverrides: {
                    html: {
                        // Impede o navegador de aumentar fonte sozinho ao girar o celular
                        WebkitTextSizeAdjust: "100%",
                    },
                    body: {
                        // Rede de segurança: um elemento largo demais não
                        // gera scroll horizontal na página inteira
                        overflowX: "hidden",
                        WebkitTapHighlightColor: "transparent",
                        ".MuiTypography-root": {
                            fontFamily: "'Rubik', sans-serif !important",
                        },
                        ".MuiAppBar-root": {
                            // individual components override this via sx
                            background: "transparent",
                        },
                        ".MuiMenuItem-root": {
                            borderRadius: "20px",
                        },
                        "*::-webkit-scrollbar-track": {
                            background: "transparent",
                        },
                        "*::-webkit-scrollbar-thumb": {
                            backgroundColor: scrollbarColor,
                            borderRadius: "12px",
                        },
                        "*::-webkit-scrollbar": {
                            width: "12px",
                        },
                    },
                },
            },
        },
    });

    return (
        <ThemeContext.Provider value={{ mode, toggleColorMode }}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </ThemeContext.Provider>
    );
};
