/**
 * Avaliador seguro de fórmulas de atributos derivados (defesa, vida máxima…).
 *
 * Suporta: números, + - * /, parênteses, os 5 atributos fixos como
 * variáveis em português ou inglês, sem acento e case-insensitive:
 *   forca | força | strength
 *   agilidade | agility
 *   vigor
 *   intelecto | intellect
 *   presenca | presença | presence
 * ...e, além desses, a `key` de qualquer atributo customizado da mesa
 * (ex: "maestria", "sorte" — ver CustomAttribute/src/lib/attributes.ts),
 * desde que o valor correspondente esteja presente no objeto `attrs`
 * passado para evaluateFormula.
 *
 * Ex: "3 + agilidade + vigor" · "25 + forca*2 + vigor*3" · "10 + (agi + vig + maestria) / 2"
 */

export type AttributeValues = {
  strength: number;
  agility: number;
  vigor: number;
  intellect: number;
  presence: number;
} & Record<string, number>;

const VARIABLE_ALIASES: Record<string, string> = {
  // português (sem acento — input é normalizado antes do lookup)
  forca: "strength",
  for: "strength",
  agilidade: "agility",
  agi: "agility",
  vigor: "vigor",
  vig: "vigor",
  intelecto: "intellect",
  int: "intellect",
  presenca: "presence",
  pre: "presence",
  // inglês
  strength: "strength",
  str: "strength",
  agility: "agility",
  intellect: "intellect",
  presence: "presence",
};

/** Palavras reservadas para os atributos fixos — atributos customizados não podem usar essas keys (ambíguo em fórmulas). */
export const RESERVED_ATTRIBUTE_KEYS = Object.keys(VARIABLE_ALIASES);

/** Nomes canônicos aceitos, para mensagens de ajuda na UI. */
export const FORMULA_VARIABLES = [
  "forca", "agilidade", "vigor", "intelecto", "presenca",
];

type Token =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" };

/**
 * Resolve uma palavra (ex: "força", "for", "maestria") para o nome canônico
 * de atributo usado por getAttributeValue: um dos 5 fixos em minúsculo
 * (strength/agility/vigor/intellect/presence) via alias, ou a própria
 * palavra normalizada — nesse caso, tratada como key de atributo customizado.
 * Reaproveitado por src/lib/attributes.ts para variáveis em fórmulas de dado
 * (ex: "{{força}}d20").
 */
export function resolveAttributeAlias(word: string): string {
  const key = normalize(word);
  return VARIABLE_ALIASES[key] ?? key;
}

function normalize(input: string): string {
  // remove acentos (força → forca) e baixa caixa
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokenize(formula: string): Token[] {
  const src = normalize(formula);
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      const value = Number(num);
      if (isNaN(value)) throw new Error(`Número inválido: "${num}"`);
      tokens.push({ kind: "number", value });
      continue;
    }

    if (/[a-z]/.test(ch)) {
      let word = "";
      while (i < src.length && /[a-z]/.test(src[i])) word += src[i++];
      // Alias de atributo fixo (forca -> strength, etc) ou, se não for um
      // alias conhecido, a própria palavra é tratada como key de atributo
      // customizado — resolvida (ou não) contra `attrs` em tempo de parse.
      const attr = VARIABLE_ALIASES[word] ?? word;
      tokens.push({ kind: "variable", name: attr });
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") { tokens.push({ kind: "lparen" }); i++; continue; }
    if (ch === ")") { tokens.push({ kind: "rparen" }); i++; continue; }

    throw new Error(`Caractere inválido: "${ch}"`);
  }

  return tokens;
}

/** Parser recursivo: expr := term (("+"|"-") term)* · term := factor (("*"|"/") factor)* */
function parse(tokens: Token[], attrs: AttributeValues): number {
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }

  function parseExpr(): number {
    let left = parseTerm();
    let t = peek();
    while (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
      pos++;
      const right = parseTerm();
      left = t.value === "+" ? left + right : left - right;
      t = peek();
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    let t = peek();
    while (t && t.kind === "op" && (t.value === "*" || t.value === "/")) {
      pos++;
      const right = parseFactor();
      if (t.value === "/" && right === 0) throw new Error("Divisão por zero");
      left = t.value === "*" ? left * right : left / right;
      t = peek();
    }
    return left;
  }

  function parseFactor(): number {
    const t = peek();
    if (!t) throw new Error("Fórmula incompleta");

    if (t.kind === "op" && (t.value === "+" || t.value === "-")) {
      pos++;
      const value = parseFactor();
      return t.value === "-" ? -value : value;
    }
    if (t.kind === "number") { pos++; return t.value; }
    if (t.kind === "variable") {
      pos++;
      const value = attrs[t.name];
      if (value === undefined) throw new Error(`Variável desconhecida: "${t.name}"`);
      return value;
    }
    if (t.kind === "lparen") {
      pos++;
      const value = parseExpr();
      const closing = peek();
      if (!closing || closing.kind !== "rparen") throw new Error("Parêntese não fechado");
      pos++;
      return value;
    }
    throw new Error("Fórmula inválida");
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error("Fórmula inválida");
  return result;
}

/** Avalia a fórmula com os atributos dados. Resultado é arredondado para baixo. Lança Error se inválida. */
export function evaluateFormula(formula: string, attrs: AttributeValues): number {
  const tokens = tokenize(formula);
  if (tokens.length === 0) throw new Error("Fórmula vazia");
  return Math.floor(parse(tokens, attrs));
}

/**
 * Retorna null se válida, ou a mensagem de erro. `customKeys` (keys de
 * CustomAttribute da mesa) também são aceitas como variáveis válidas.
 */
export function validateFormula(formula: string, customKeys: string[] = []): string | null {
  try {
    const attrs: AttributeValues = { strength: 1, agility: 1, vigor: 1, intellect: 1, presence: 1 };
    for (const key of customKeys) attrs[key] = 1;
    evaluateFormula(formula, attrs);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Fórmula inválida";
  }
}
