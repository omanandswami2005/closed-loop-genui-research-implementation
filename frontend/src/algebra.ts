// Exact rational arithmetic for the manipulatives' own state (the server
// re-checks every submitted answer).

export class Frac {
  readonly n: number;
  readonly d: number;

  constructor(n: number, d = 1) {
    if (d === 0) throw new Error("division by zero");
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    const s = d < 0 ? -1 : 1;
    this.n = (s * n) / g;
    this.d = (s * d) / g;
  }

  add(o: Frac) {
    return new Frac(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Frac) {
    return new Frac(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Frac) {
    return new Frac(this.n * o.n, this.d * o.d);
  }
  div(o: Frac) {
    return new Frac(this.n * o.d, this.d * o.n);
  }
  isZero() {
    return this.n === 0;
  }
  eq(o: Frac) {
    return this.n === o.n && this.d === o.d;
  }
  value() {
    return this.n / this.d;
  }
  toString() {
    return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`;
  }
  toLatex() {
    if (this.d === 1) return `${this.n}`;
    return `${this.n < 0 ? "-" : ""}\\tfrac{${Math.abs(this.n)}}{${this.d}}`;
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** coef * x + k on each side of the balance. */
export interface Side {
  coef: Frac;
  k: Frac;
}

export interface LinEq {
  left: Side;
  right: Side;
}

export const side = (coef: number, k: number): Side => ({ coef: new Frac(coef), k: new Frac(k) });

export function apply(eq: LinEq, op: "+" | "-" | "*" | "/", v: Frac): LinEq {
  const f = (s: Side): Side => {
    switch (op) {
      case "+":
        return { coef: s.coef, k: s.k.add(v) };
      case "-":
        return { coef: s.coef, k: s.k.sub(v) };
      case "*":
        return { coef: s.coef.mul(v), k: s.k.mul(v) };
      case "/":
        return { coef: s.coef.div(v), k: s.k.div(v) };
    }
  };
  return { left: f(eq.left), right: f(eq.right) };
}

export function sideLatex(s: Side): string {
  const parts: string[] = [];
  if (!s.coef.isZero()) {
    const c = s.coef;
    parts.push(c.eq(new Frac(1)) ? "x" : c.eq(new Frac(-1)) ? "-x" : `${c.toLatex()}x`);
  }
  if (!s.k.isZero() || parts.length === 0) {
    if (parts.length && s.k.n > 0) parts.push(`+ ${s.k.toLatex()}`);
    else if (parts.length) parts.push(`- ${new Frac(-s.k.n, s.k.d).toLatex()}`);
    else parts.push(s.k.toLatex());
  }
  return parts.join(" ");
}

export const eqLatex = (e: LinEq) => `${sideLatex(e.left)} = ${sideLatex(e.right)}`;

/** x isolated on one side: returns its value, else null. */
export function isolated(e: LinEq): Frac | null {
  const one = new Frac(1);
  if (e.left.coef.eq(one) && e.left.k.isZero() && e.right.coef.isZero()) return e.right.k;
  if (e.right.coef.eq(one) && e.right.k.isZero() && e.left.coef.isZero()) return e.left.k;
  return null;
}
