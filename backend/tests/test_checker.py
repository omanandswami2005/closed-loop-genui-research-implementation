from fractions import Fraction

import pytest

from closedloop.ast_schema import Equation
from closedloop.checker import ParseError, check_step, check_value, parse_expression, solution

EQ = Equation(a=3, b=4, c=19)  # 3x + 4 = 19, x = 5


@pytest.mark.parametrize(
    "text,coef,const",
    [("3x + 4", 3, 4), ("-2(x - 1)", -2, 2), ("x/2 + 1.5", Fraction(1, 2), Fraction(3, 2)), ("(3x)/3", 1, 0), ("4 − 2×x", -2, 4)],
)
def test_parse_linear_expressions(text, coef, const):
    e = parse_expression(text)
    assert (e.coef, e.const) == (coef, const)


@pytest.mark.parametrize("text", ["x*x", "3/x", "2 +", "3x = ", "(x + 1", "import os", "1/0"])
def test_rejects_nonlinear_or_malformed(text):
    with pytest.raises(ParseError):
        parse_expression(text)


@pytest.mark.parametrize("line", ["3x = 15", "3x + 4 - 4 = 19 - 4", "x + 4/3 = 19/3", "15 = 3x"])
def test_valid_intermediate_steps(line):
    r = check_step(EQ, line)
    assert r.equivalent and not r.solved


@pytest.mark.parametrize("line", ["x = 5", "5 = x", "x = 10/2"])
def test_solved_lines(line):
    r = check_step(EQ, line)
    assert r.equivalent and r.solved


@pytest.mark.parametrize("line", ["3x = 23", "x = 6", "3x + 4 = 19 + 4x", "0 = 0", "3x + 4 = 3x"])
def test_wrong_steps(line):
    assert not check_step(EQ, line).equivalent


def test_unparseable_line_is_reported_not_raised():
    r = check_step(EQ, "3x + = 19")
    assert not r.parsed and not r.equivalent


def test_check_value_accepts_fractions_and_lines():
    eq = Equation(a=2, b=1, c=4)  # x = 3/2
    assert solution(eq) == Fraction(3, 2)
    assert check_value(eq, "3/2").solved
    assert check_value(eq, "1.5").solved
    assert check_value(eq, "x = 1.5").solved
    assert not check_value(eq, "2").solved
    assert not check_value(eq, "x").solved
