export function evaluateDesignExpression(input: string, current?: number): number | null {
  let source = input.trim();
  if (!source || source.length > 512) return null;
  if (/^[*/^]/u.test(source)) source = `x${source}`;
  const lexer = /\s*((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|mixed\b|x\b|[+*/^()-])/giy;
  const tokens: string[] = [];
  while (lexer.lastIndex < source.length) {
    const match = lexer.exec(source);
    if (!match) return null;
    tokens.push(match[1]!);
  }
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === "(") {
      const value = expression();
      if (tokens[index++] !== ")") throw new Error("Unclosed expression");
      return value;
    }
    if (/^(mixed|x)$/iu.test(token ?? "")) return current ?? NaN;
    if (token === undefined || !Number.isFinite(Number(token))) throw new Error("Invalid number");
    return Number(token);
  };
  const power = (): number => {
    const value = primary();
    if (tokens[index] !== "^") return value;
    index++;
    return value ** unary();
  };
  const unary = (): number => {
    if (tokens[index] === "+") {
      index++;
      return unary();
    }
    if (tokens[index] === "-") {
      index++;
      return -unary();
    }
    return power();
  };
  const term = (): number => {
    let value = unary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const next = unary();
      value = operator === "*" ? value * next : value / next;
    }
    return value;
  };
  const expression = (): number => {
    let value = term();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const next = term();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };
  try {
    const value = expression();
    return index === tokens.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
