"""A tiny, safe arithmetic language for the interactive graphs.

Gemini writes formulas such as ``a * sin(b * x) + c``. They are parsed here
with Python's ``ast`` and only numbers, the named variables, + - * / ^ %,
parentheses and a short list of math functions are allowed, so a formula can
never run code. The browser evaluates the same language (``genui/expr.ts``).
"""

from __future__ import annotations

import ast
import math
import re
from collections.abc import Iterable

FUNCS = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "exp": math.exp,
    "log": math.log,
    "ln": math.log,
    "log10": math.log10,
    "sqrt": math.sqrt,
    "abs": abs,
    "min": min,
    "max": max,
}
CONSTS = {"pi": math.pi, "e": math.e}
MAX_LEN = 200
NAME = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,15}$")

_BINOPS = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.Pow: lambda a, b: a**b,
    ast.Mod: lambda a, b: a % b,
}


class ExprError(ValueError):
    pass


def compile_expr(src: str, variables: Iterable[str]) -> ast.Expression:
    """Parse ``src``; raise ExprError unless it uses only the allowed pieces and ``variables``."""
    if not isinstance(src, str) or not src.strip() or len(src) > MAX_LEN:
        raise ExprError("formula is empty or too long")
    allowed = set(variables)
    try:
        tree = ast.parse(src.replace("^", "**"), mode="eval")
    except SyntaxError as exc:
        raise ExprError(f"formula does not parse: {src}") from exc

    def walk(node: ast.AST) -> None:
        if isinstance(node, ast.Expression):
            walk(node.body)
        elif isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            walk(node.left)
            walk(node.right)
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            walk(node.operand)
        elif isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            pass
        elif isinstance(node, ast.Name):
            if node.id not in allowed and node.id not in CONSTS:
                raise ExprError(f"unknown name '{node.id}' in formula")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FUNCS and not node.keywords:
            for a in node.args:
                walk(a)
        else:
            raise ExprError(f"formula uses something not allowed: {ast.dump(node)[:60]}")

    walk(tree)
    return tree


def evaluate(tree: ast.Expression, env: dict[str, float]) -> float:
    def ev(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.BinOp):
            return _BINOPS[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp):
            v = ev(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.Constant):
            return float(node.value)
        if isinstance(node, ast.Name):
            return float(env[node.id]) if node.id in env else CONSTS[node.id]
        if isinstance(node, ast.Call):
            return float(FUNCS[node.func.id](*[ev(a) for a in node.args]))
        raise ExprError("bad node")

    try:
        v = ev(tree)
    except (ZeroDivisionError, OverflowError, ValueError, TypeError) as exc:
        raise ExprError(f"formula cannot be evaluated here: {exc}") from exc
    if isinstance(v, complex) or not math.isfinite(v):
        raise ExprError("formula gives a non-finite value")
    return v


def sample(tree: ast.Expression, var: str, lo: float, hi: float, env: dict[str, float], n: int = 60) -> list[float]:
    """Values at ``n`` evenly spaced points; raises if any is undefined."""
    return [evaluate(tree, {**env, var: lo + (hi - lo) * i / (n - 1)}) for i in range(n)]
