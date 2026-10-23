import math

import pytest
from closedloop_demo.expr import ExprError, compile_expr, evaluate, sample


def test_formulas_evaluate():
    t = compile_expr("a * sin(b * x) + c", ["a", "b", "c", "x"])
    assert evaluate(t, {"a": 2, "b": math.pi / 2, "c": 1, "x": 1}) == pytest.approx(3)
    assert evaluate(compile_expr("2^3 + sqrt(16) - abs(-1)", []), {}) == 11
    assert evaluate(compile_expr("max(a, 3) * pi", ["a"]), {"a": 1}) == pytest.approx(3 * math.pi)
    assert evaluate(compile_expr("-v / r", ["v", "r"]), {"v": 10, "r": 4}) == -2.5


@pytest.mark.parametrize(
    "src",
    [
        "__import__('os').system('x')",
        "a.__class__",
        "(lambda: 1)()",
        "[1, 2]",
        "open('f')",
        "a if a else 1",
        "unknown * 2",
        "",
        "1 +",
        "x" * 201,
        "True + 1",
        "sin(x=1)",
    ],
)
def test_anything_but_arithmetic_is_rejected(src):
    with pytest.raises(ExprError):
        compile_expr(src, ["a"])


def test_sample_rejects_a_curve_that_breaks():
    assert sample(compile_expr("2 * x", ["x"]), "x", 0, 1, {}, n=3) == [0, 1, 2]
    with pytest.raises(ExprError):  # x = 0 divides by zero: such a graph is rejected, not drawn with a hole
        sample(compile_expr("1 / x", ["x"]), "x", -1, 1, {}, n=3)
