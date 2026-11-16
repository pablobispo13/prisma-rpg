// Notas de versão exibidas no app (botão "Novidades" no topo).
// Como adicionar uma versão nova: ver docs/RELEASE_NOTES.md.
//
// Regras rápidas:
//  - A versão MAIS NOVA fica em PRIMEIRO na lista.
//  - `version` segue semver e deve bater com o "version" do package.json.
//  - Texto escrito para quem joga (mestre e jogadores), não para devs.

export type ReleaseItemType = "new" | "improved" | "fixed" | "removed";

/** Para quem o item importa. Omitido = todos. Só muda o selo exibido. */
export type ReleaseAudience = "master" | "player";

export type ReleaseItem = {
  type: ReleaseItemType;
  text: string;
  audience?: ReleaseAudience;
};

export type ReleaseNote = {
  /** Semver, ex: "0.3.0". Usado para saber se o usuário já viu a versão. */
  version: string;
  /** Data de publicação no formato AAAA-MM-DD. */
  date: string;
  /** Título curto da versão (aparece em destaque). */
  title: string;
  /** Uma ou duas frases opcionais resumindo a versão. */
  summary?: string;
  items: ReleaseItem[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.3.0",
    date: "2026-11-16",
    title: "Ficha dentro do combate e celular deitado",
    summary:
      "Agora dá para abrir a ficha sem sair do combate, e o app ficou utilizável com o celular deitado.",
    items: [
      { type: "new", text: "Botão “Minha ficha” no combate: abre a ficha completa do seu personagem sem sair da tela de combate.", audience: "player" },
      { type: "new", text: "Botão “Fichas” no combate: abre a ficha de qualquer participante, com atalhos no topo para alternar entre eles. Também dá para abrir pelo ícone de ficha em cada card da ordem de turno.", audience: "master" },
      { type: "improved", text: "No Android, o app instalado abre em tela cheia: some a barra de status e os botões do sistema, deixando mais espaço para a mesa. Para vê-los, deslize a partir da borda da tela. (No iPhone nada muda.)" },
      { type: "improved", text: "Nova tela de carregamento: um d20 rolando no lugar do texto “Carregando…” ao abrir o combate, a mesa, a ficha e a lista de mesas." },
      { type: "improved", text: "“Abrir combate” agora leva para o combate na mesma aba, sem abrir uma nova. Quando o combate termina, você volta automaticamente para a ficha do seu personagem (o mestre volta para a mesa)." },
      { type: "improved", text: "Combate com o celular deitado: as habilidades ficam numa coluna à direita e a lista de participantes continua visível." },
      { type: "improved", text: "No celular em pé, os botões de habilidade ficaram mais compactos, sobrando mais espaço para a lista de participantes." },
      { type: "fixed", text: "A contagem de novidades na aba Log aparecia mesmo sem nenhuma ação nova." },
      { type: "fixed", text: "Em celulares com tema claro, vários textos ficavam pretos sobre o fundo escuro (nomes, títulos da ficha)." },
      { type: "fixed", text: "No app instalado (Android e iPhone), a barra superior ficava parcialmente coberta pela barra de status do celular." },
      { type: "fixed", text: "Editores de habilidade e de dados do personagem não abriam em tela cheia no celular." },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-11-16",
    title: "App instalável e telas ajustadas para celular",
    summary:
      "Agora dá para instalar o Prisma RPG no celular ou no computador, e todas as telas — principalmente o combate — foram ajustadas para funcionar bem em qualquer tamanho de tela.",
    items: [
      // Novidades
      { type: "new", text: "App instalável: adicione o Prisma RPG à tela inicial e abra em janela própria, sem a barra do navegador. No Chrome/Edge/Android use o botão “Instalar app” no topo; no iPhone, Compartilhar → Adicionar à Tela de Início." },
      { type: "new", text: "Combate no celular em abas — Turnos, Campo e Log — com a barra de habilidades sempre visível embaixo." },
      { type: "new", text: "A aba Log mostra quantas ações novas aconteceram enquanto você olhava outra aba." },
      { type: "new", text: "Ao escolher uma habilidade no celular, o app leva você direto para a lista de alvos." },
      { type: "new", text: "O celular vibra quando chega o seu turno (Android).", audience: "player" },
      { type: "new", text: "No celular, as ações do mestre no combate (adicionar personagem, exportar log, encerrar) ficam no menu ⋮.", audience: "master" },
      { type: "new", text: "Tela de “Sem conexão” que volta sozinha quando a internet retorna." },
      { type: "new", text: "Painel de Novidades (este aqui) para acompanhar o que mudou em cada versão." },

      // Melhorias
      { type: "improved", text: "Botões de reação (bloquear, esquivar, contra-atacar) maiores e um por linha no celular.", audience: "player" },
      { type: "improved", text: "Reordenar a ordem de turno no toque: segure a alça ⋮⋮ do card e arraste. A lista volta a rolar com o dedo normalmente.", audience: "master" },
      { type: "improved", text: "Mesa do mestre em uma coluna só em telas menores, com as rolagens recentes no final da página.", audience: "master" },
      { type: "improved", text: "Lista de jogadores e inimigos do mestre: no celular os botões de ação ficam numa segunda linha e o nome aparece inteiro.", audience: "master" },
      { type: "improved", text: "Editor de habilidades e de dados do personagem abrem em tela cheia no celular, com os campos empilhados." },
      { type: "improved", text: "Todas as janelas (modais) aproveitam a largura da tela no celular." },
      { type: "improved", text: "Barra superior mais compacta no celular." },
      { type: "improved", text: "Tocar no logo do dado leva de volta à mesa; a ficha aberta pelo mestre ganhou o botão “Voltar à mesa”." },
      { type: "improved", text: "O iPhone não dá mais zoom sozinho ao tocar em campos de texto." },

      // Correções
      { type: "fixed", text: "A barra de habilidades do combate ficava parcialmente escondida embaixo da tela (em qualquer tamanho de tela)." },
      { type: "fixed", text: "O final da tela da mesa do mestre ficava cortado.", audience: "master" },
      { type: "fixed", text: "No app instalado, abrir um combate ou uma ficha abria fora do app (no iPhone, aparecia deslogado)." },
    ],
  },
];

export const LATEST_RELEASE = RELEASE_NOTES[0];
