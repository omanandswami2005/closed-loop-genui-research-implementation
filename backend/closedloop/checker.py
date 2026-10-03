"""Symbolic step checker for linear equations (spec Section 3).

A learner's line is parsed with exact rational arithmetic into
``a*x + b = c*x + d``. A line is a *valid step* when it has the same single
solution as the problem; it *solves* the problem when it reads ``x = value``
(or ``value = x``). No code is executed and no CAS is needed: every accepted
expression is linear in x by construction.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from fractions import Fraction

from .ast_schema import Equation

_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?|\.\d+)|(x)|([-+*/()=]))", re.IGNORECASE)
_NORMALIZE = str.maketrans({"−": "-", "–": "-", "×": "*", "·": "*", "÷": "/", "X": "x"})


class ParseError(ValueError):
    pass


@dataclass(frozen=True)
class Linear:
    """coef * x + const with exact rationals."""

    coef: Fraction
    const: Fraction

    def __add__(self, o: "Linear") -> "Linear":
        return Linear(self.coef + o.coef, self.const + o.const)

    def __sub__(self, o: "Linear") -> "Linear":
        return Linear(self.coef - o.coef, self.const - o.const)

    def __neg__(self) -> "Linear":
        return Linear(-self.coef, -self.const)

    def __mul__(self, o: "Linear") -> "Linear":
        if self.coef and o.coef:
            raise ParseError("only linear expressions in x are allowed")
        return Linear(self.coef * o.const + o.coef * self.const, self.const * o.const)

    def __truediv__(self, o: "Linear") -> "Linear":
        if o.coef:
            raise ParseError("cannot divide by an expression containing x")
        if o.const == 0:
            raise ParseError("division by zero")
        return Linear(self.coef / o.const, self.const / o.const)


def _tokens(text: str) -> list[str]:
    text = text.translate(_NORMALIZE).strip()
    out, pos = [], 0
    while pos < len(text):
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            if text[pos:].strip() == "":
                break
            raise ParseError(f"unexpected character {text[pos]!r}")
        out.append(m.group(m.lastindex))
        pos = m.end()
    return out


class _Parser:
    """expr := term (('+'|'-') term)*; term := unary (('*'|'/'|implicit) unary)*."""

    def __init__(self, tokens: list[str]) -> None:
        self.t, self.i = tokens, 0

    def peek(self) -> str | None:
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self) -> str:
        tok = self.peek()
        if tok is None:
            raise ParseError("expression ends too early")
        self.i += 1
        return tok

    def expr(self) -> Linear:
        value = self.term()
        while self.peek() in ("+", "-"):
            op = self.take()
            rhs = self.term()
            value = value + rhs if op == "+" else value - rhs
        return value

    def term(self) -> Linear:
        value = self.unary()
        while True:
            tok = self.peek()
            if tok in ("*", "/"):
                self.take()
                rhs = self.unary()
                value = value * rhs if tok == "*" else value / rhs
            elif tok is not None and (tok == "(" or tok.lower() == "x" or tok[0].isdigit() or tok[0] == "."):
                value = value * self.unary()  # implicit multiplication: 3x, 2(x+1)
            else:
                return value

    def unary(self) -> Linear:
        if self.peek() in ("+", "-"):
            sign = self.take()
            inner = self.unary()
            return -inner if sign == "-" else inner
        return self.atom()

    def atom(self) -> Linear:
        tok = self.take()
        if tok == "(":
            value = self.expr()
            if self.take() != ")":
                raise ParseError("missing closing parenthesis")
            return value
        if tok.lower() == "x":
            return Linear(Fraction(1), Fraction(0))
        if tok[0].isdigit() or tok[0] == ".":
            return Linear(Fraction(0), Fraction(tok))
        raise ParseError(f"unexpected {tok!r}")


def parse_expression(text: str) -> Linear:
    p = _Parser(_tokens(text))
    if p.peek() is None:
        raise ParseError("empty expression")
    value = p.expr()
    if p.peek() is not None:
        raise ParseError(f"unexpected {p.peek()!r}")
    return value


def parse_equation(text: str) -> tuple[Linear, Linear]:
    parts = text.translate(_NORMALIZE).split("=")
    if len(parts) != 2:
        raise ParseError("a step must contain exactly one '='")
    return parse_expression(parts[0]), parse_expression(parts[1])


def solution(eq: Equation) -> Fraction:
    return Fraction(eq.c - eq.b, eq.a)


@dataclass(frozen=True)
class StepCheck:
    parsed: bool
    equivalent: bool  # same solution set as the problem
    solved: bool  # of the form x = value with the right value
    message: str


def check_step(eq: Equation, line: str) -> StepCheck:
    try:
        lhs, rhs = parse_equation(line)
    except ParseError as exc:
        return StepCheck(False, False, False, str(exc))
    diff = lhs - rhs  # diff.coef * x + diff.const = 0
    if diff.coef == 0:
        msg = "x disappeared: this line is " + ("true for every x" if diff.const == 0 else "never true")
        return StepCheck(True, False, False, msg)
    root = -diff.const / diff.coef
    if root != solution(eq):
        return StepCheck(True, False, False, "this step changes the solution; check the last operation")
    isolated = (lhs.coef == 1 and lhs.const == 0 and rhs.coef == 0) or (rhs.coef == 1 and rhs.const == 0 and lhs.coef == 0)
    return StepCheck(True, True, isolated, "solved" if isolated else "valid step")


def check_value(eq: Equation, answer: str) -> StepCheck:
    """A bare value (``3``, ``-7/2``) or a full line (``x = 3``)."""
    if "=" in answer:
        return check_step(eq, answer)
    try:
        value = parse_expression(answer)
    except ParseError as exc:
        return StepCheck(False, False, False, str(exc))
    if value.coef:
        return StepCheck(True, False, False, "the answer should be a number")
    ok = value.const == solution(eq)
    return StepCheck(True, ok, ok, "solved" if ok else "not the solution")


def format_fraction(value: Fraction) -> str:
    return str(value.numerator) if value.denominator == 1 else f"{value.numerator}/{value.denominator}"
