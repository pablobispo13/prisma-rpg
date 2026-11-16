import { Html, Head, Main, NextScript } from "next/document";

// Metadados do PWA. O viewport fica no _app (o Next não aceita a tag
// viewport no _document).
export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0e0e1a" />
        <meta name="application-name" content="Prisma RPG" />
        <meta name="description" content="Mesas, fichas e combate de RPG em tempo real." />

        {/* iOS: o Safari ignora parte do manifest — ícone e modo standalone vêm daqui */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Prisma RPG" />
        {/* "black" (e não black-translucent): o iOS reserva a faixa da barra
            de status em vez de desenhar o app por baixo dela — com
            translucent a AppBar ficava parcialmente coberta no PWA */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="format-detection" content="telephone=no" />
      </Head>
      <body style={{ background: "#0e0e1a" }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
