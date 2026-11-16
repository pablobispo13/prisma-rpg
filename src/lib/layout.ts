// Altura disponível abaixo da AppBar. `--app-bar-h` é definida no Layout
// (0px quando não há AppBar, ex: login). dvh em vez de vh: no celular o vh
// ignora a barra de endereço que aparece/some, e o rodapé da tela ficava
// escondido atrás dela.
export const FULL_HEIGHT = "calc(100dvh - var(--app-bar-h, 0px) - env(safe-area-inset-bottom))";
