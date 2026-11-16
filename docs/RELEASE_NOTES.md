# Como registrar uma nova versão (release notes)

As notas de versão aparecem dentro do app, no botão **Novidades** (ícone de selo na barra superior). Quando existe uma versão que o usuário ainda não abriu, o ícone ganha um ponto colorido. O "já vi" fica salvo por aparelho/navegador.

Tudo vive em **um arquivo só**: [`src/data/releaseNotes.ts`](../src/data/releaseNotes.ts). Não há banco, painel ou deploy separado: editou o arquivo e publicou o app, as notas aparecem.

---

## Passo a passo

1. **Escolha o número da versão** (formato `X.Y.Z`):
   | Mudou o quê? | Exemplo | Qual número sobe |
   |---|---|---|
   | Funcionalidade nova visível para o usuário | nova tela, novo tipo de efeito | `Y` (0.2.0 → **0.3.0**) |
   | Só correções ou ajustes pequenos | bug no contra-ataque, texto errado | `Z` (0.2.0 → **0.2.1**) |
   | Mudança grande que quebra o jeito de usar | reformulação do combate | `X` (0.9.0 → **1.0.0**) |

2. **Atualize o `version` no [`package.json`](../package.json)** para o mesmo número.

3. **Adicione a versão no TOPO da lista** `RELEASE_NOTES` em `src/data/releaseNotes.ts` (a mais nova sempre em primeiro):

   ```ts
   export const RELEASE_NOTES: ReleaseNote[] = [
     {
       version: "0.3.0",
       date: "2026-12-01",          // AAAA-MM-DD, dia da publicação
       title: "Título curto da versão",
       summary: "Opcional: uma ou duas frases explicando o tema da versão.",
       items: [
         { type: "new", text: "O que apareceu de novo." },
         { type: "improved", text: "O que ficou melhor.", audience: "master" },
         { type: "fixed", text: "O que estava quebrado e agora funciona." },
       ],
     },
     // ...versões anteriores continuam aqui embaixo, sem alterar
   ];
   ```

4. **Rode a checagem:**

   ```bash
   npm run release:check
   ```

   Ela confere que a versão do topo é igual à do `package.json`, que as versões estão em ordem decrescente e sem repetição, e que datas e textos estão preenchidos. Se algo estiver errado, o script diz exatamente o quê.

5. Faça o commit junto com a funcionalidade (ou num commit próprio `Release notes vX.Y.Z`) e publique.

---

## Campos de cada item

| Campo | Obrigatório | Valores | Para quê |
|---|---|---|---|
| `type` | sim | `new`, `improved`, `fixed`, `removed` | Agrupa o item em **Novidades**, **Melhorias**, **Correções** ou **Removido** (nessa ordem, automaticamente) |
| `text` | sim | texto livre | O que mudou, escrito para o usuário |
| `audience` | não | `master`, `player` | Mostra um selo **Mestre** ou **Jogador** ao lado. Sem o campo, vale para todos |

A ordem dos itens dentro do array não importa para a exibição, porque eles são agrupados por `type`. Mesmo assim, manter agrupado facilita a leitura do arquivo.

---

## Como escrever bem as notas

Quem lê são **mestres e jogadores**, não desenvolvedores.

- **Fale do efeito para quem usa, não da implementação.**
  - ✅ "A barra de habilidades do combate ficava escondida embaixo da tela."
  - ❌ "Trocado `100vh` por `calc(100dvh - var(--app-bar-h))` no CombatScreen."
- **Diga onde encontrar** a novidade quando não for óbvio: "No celular, as ações do mestre ficam no menu ⋮."
- **Uma mudança por item**, em uma ou duas frases. Se precisar de mais, provavelmente são dois itens.
- **Correções descrevem o problema que o usuário via**, no passado: "O final da tela do mestre ficava cortado."
- **Não liste** refatorações internas, testes, scripts ou mudanças invisíveis. Se o usuário não percebe, não entra.
- Use `audience` quando o item só faz sentido para um papel (ex.: algo exclusivo do mestre).

---

## Perguntas frequentes

**Corrigi um erro de digitação numa nota já publicada. Preciso de versão nova?**
Não. Edite o texto direto na versão existente. O ponto de "novidade" só reaparece quando a versão do topo muda.

**Fiz várias entregas pequenas na mesma semana. Uma versão para cada?**
Pode juntar tudo numa versão só. O importante é que, a cada publicação com mudanças visíveis, exista uma entrada nova.

**Posso apagar versões antigas?**
Pode, mas não é necessário. O painel mostra todas em ordem e o arquivo continua leve. Se a lista ficar muito longa, remova as mais antigas do fim do array.

**Onde fica o código da tela?**
[`src/components/ReleaseNotes/ReleaseNotesButton.tsx`](../src/components/ReleaseNotes/ReleaseNotesButton.tsx). Os tipos e os dados ficam em `src/data/releaseNotes.ts`, e a checagem em [`scripts/check-release-notes.ts`](../scripts/check-release-notes.ts).
