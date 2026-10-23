"""``lab-ui/1``: the interactive component catalog Gemini composes learning labs from.

A lab is a short sequence of stations (levels). Each station is one component
from a closed catalog of 30: 15 hands-on manipulatives and 15 interactive
simulations or explorables. Gemini writes only declarative JSON (component
type and its data); the browser renders it with fixed React components, in the
style of Google's A2UI protocol. Every station is validated here before it is
shown: the data must fit the component, and its challenge must be solvable
(Gemini supplies the solution and it is re-computed). Invalid stations are
dropped and replaced from a deterministic lab built from the question bank.
"""

from __future__ import annotations

import math
from typing import Annotated, Literal, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    model_validator,
)

from .expr import NAME, ExprError, compile_expr, evaluate, sample

LAB_VERSION = "lab-ui/1"
S = Annotated[str, Field(min_length=1, max_length=90)]
M = Annotated[str, Field(min_length=1, max_length=240)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Station(_Strict):
    """Shared by every component: Google-style level scaffolding."""

    id: str = ""
    title: str = Field(min_length=2, max_length=80)
    intro: str = Field(min_length=4, max_length=320)  # activates prior knowledge, uses the learner's interests
    goal: str = Field(min_length=4, max_length=240)  # what to do to finish the level
    hints: list[M] = Field(min_length=1, max_length=3)  # gentle nudge -> strong clue
    solution: str = Field(min_length=4, max_length=600)  # worked solution, shown only after attempts
    explain: str = Field(min_length=4, max_length=400)  # why it works, shown on success


def _unique(xs: list[str], what: str) -> None:
    folded = [x.strip().lower() for x in xs]
    if len(set(folded)) != len(folded):
        raise ValueError(f"{what} must be unique")


def _close(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= tol


def _on_grid(v: float, step: float, origin: float = 0.0) -> bool:
    """A slider with this step (starting at origin) can land exactly on v."""
    k = (v - origin) / step
    return abs(k - round(k)) < 1e-6


def _snap(v: float, step: float, origin: float) -> float:
    return round(origin + round((v - origin) / step) * step, 10)


# ---------------------------------------------------------------------------
# 15 hands-on manipulatives


class SequenceSort(_Station):
    type: Literal["SequenceSort"]
    items: list[S] = Field(min_length=3, max_length=7)  # in the correct order

    @model_validator(mode="after")
    def _ok(self):
        _unique(self.items, "items")
        return self


class Category(_Strict):
    name: str = Field(min_length=1, max_length=40)
    items: list[Annotated[str, Field(min_length=1, max_length=60)]] = Field(min_length=2, max_length=5)


class CategorySort(_Station):
    type: Literal["CategorySort"]
    categories: list[Category] = Field(min_length=2, max_length=3)

    @model_validator(mode="after")
    def _ok(self):
        _unique([c.name for c in self.categories], "category names")
        items = [i for c in self.categories for i in c.items]
        _unique(items, "items")
        if len(items) > 12:
            raise ValueError("at most 12 items")
        return self


class Pair(_Strict):
    left: str = Field(min_length=1, max_length=60)
    right: str = Field(min_length=1, max_length=120)


class MatchPairs(_Station):
    type: Literal["MatchPairs"]
    pairs: list[Pair] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def _ok(self):
        _unique([p.left for p in self.pairs], "left items")
        _unique([p.right for p in self.pairs], "right items")
        return self


class CycleBuilder(_Station):
    type: Literal["CycleBuilder"]
    center: str = Field(min_length=1, max_length=40)
    stages: list[Annotated[str, Field(min_length=1, max_length=40)]] = Field(min_length=3, max_length=6)  # cyclic order

    @model_validator(mode="after")
    def _ok(self):
        _unique(self.stages, "stages")
        return self


class Event(_Strict):
    label: str = Field(min_length=1, max_length=60)
    value: float
    display: str = Field(min_length=1, max_length=20)


class Timeline(_Station):
    type: Literal["Timeline"]
    unit: str = Field(default="", max_length=20)
    events: list[Event] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def _ok(self):
        _unique([e.label for e in self.events], "event labels")
        if len({e.value for e in self.events}) != len(self.events):
            raise ValueError("events need distinct times")
        return self


class Part(_Strict):
    label: str = Field(min_length=1, max_length=40)
    clue: str = Field(min_length=2, max_length=160)


Layout = Literal["flow", "layers", "hub", "cycle"]


class LabelDiagram(_Station):
    type: Literal["LabelDiagram"]
    layout: Layout
    center: str = Field(default="", max_length=40)
    parts: list[Part] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def _ok(self):
        _unique([p.label for p in self.parts], "labels")
        return self


class Weight(_Strict):
    label: str = Field(min_length=1, max_length=30)
    value: float = Field(gt=0, le=1e6)


class BalanceScale(_Station):
    type: Literal["BalanceScale"]
    unit: str = Field(default="", max_length=12)
    left: list[Weight] = Field(min_length=1, max_length=4)
    tray: list[Weight] = Field(min_length=2, max_length=6)
    answer: list[int] = Field(min_length=1, max_length=6)  # tray indices that balance the left pan

    @model_validator(mode="after")
    def _ok(self):
        if len(set(self.answer)) != len(self.answer) or any(not 0 <= i < len(self.tray) for i in self.answer):
            raise ValueError("answer must list distinct tray indices")
        lhs, rhs = sum(w.value for w in self.left), sum(self.tray[i].value for i in self.answer)
        if not _close(lhs, rhs, 1e-6 * max(1, lhs)):
            raise ValueError(f"answer does not balance: {lhs} vs {rhs}")
        return self


class Marker(_Strict):
    label: str = Field(min_length=1, max_length=30)
    value: float


class NumberLine(_Station):
    type: Literal["NumberLine"]
    min: float
    max: float
    step: float = Field(gt=0)
    unit: str = Field(default="", max_length=12)
    markers: list[Marker] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def _ok(self):
        if not self.min < self.max or (self.max - self.min) / self.step > 400:
            raise ValueError("bad range or step")
        if any(not self.min <= m.value <= self.max for m in self.markers):
            raise ValueError("markers must lie on the line")
        _unique([m.label for m in self.markers], "marker labels")
        if len({round(m.value / self.step) for m in self.markers}) != len(self.markers):
            raise ValueError("markers need distinct positions")
        return self


class Link(_Strict):
    cause: str = Field(min_length=1, max_length=80)
    effect: str = Field(min_length=1, max_length=80)


class CauseEffect(_Station):
    type: Literal["CauseEffect"]
    links: list[Link] = Field(min_length=3, max_length=5)

    @model_validator(mode="after")
    def _ok(self):
        _unique([x.cause for x in self.links], "causes")
        _unique([x.effect for x in self.links], "effects")
        return self


class ClozeBank(_Station):
    type: Literal["ClozeBank"]
    text: str = Field(min_length=20, max_length=800)  # gaps written as [[word]]
    distractors: list[Annotated[str, Field(min_length=1, max_length=30)]] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def _ok(self):
        import re

        words = re.findall(r"\[\[([^\[\]]{1,30})\]\]", self.text)
        if not 2 <= len(words) <= 5:
            raise ValueError("the text needs 2-5 [[gaps]]")
        if self.text.count("[[") != len(words):
            raise ValueError("malformed [[gap]]")
        _unique(words + list(self.distractors), "gap words and distractors")
        return self


class Segment(_Strict):
    label: str = Field(min_length=1, max_length=30)
    value: float = Field(gt=0, le=100)


class ProportionBar(_Station):
    type: Literal["ProportionBar"]
    whole: str = Field(min_length=1, max_length=40)
    segments: list[Segment] = Field(min_length=2, max_length=5)
    tolerance: float = Field(default=6, ge=1, le=15)  # percentage points

    @model_validator(mode="after")
    def _ok(self):
        _unique([s.label for s in self.segments], "segment labels")
        if not _close(sum(s.value for s in self.segments), 100, 0.6):
            raise ValueError("segments must add up to 100")
        return self


class Force(_Strict):
    label: str = Field(min_length=1, max_length=30)
    direction: Literal["left", "right", "up", "down"]
    value: float = Field(ge=0)  # starting magnitude
    adjustable: bool = False
    max: float = Field(gt=0, le=1e5)


class ForceArrows(_Station):
    type: Literal["ForceArrows"]
    object: str = Field(min_length=1, max_length=30)
    unit: str = Field(default="N", max_length=8)
    step: float = Field(default=1, gt=0)
    forces: list[Force] = Field(min_length=2, max_length=4)
    target_x: float = 0  # net force wanted (right/up positive)
    target_y: float = 0
    answer: list[float]  # magnitude of every force at the solution

    @model_validator(mode="after")
    def _ok(self):
        if len(self.answer) != len(self.forces):
            raise ValueError("answer needs one magnitude per force")
        if not any(f.adjustable for f in self.forces):
            raise ValueError("at least one force must be adjustable")
        for f, a in zip(self.forces, self.answer):
            if not 0 <= a <= f.max or f.value > f.max:
                raise ValueError("magnitudes must lie within 0..max")
            if not f.adjustable and not _close(a, f.value, 1e-9):
                raise ValueError("a fixed force keeps its value")
            if f.adjustable and not _on_grid(a, self.step):
                raise ValueError(f"answer {a} is not a multiple of the slider step {self.step}")
        nx, ny = net_force(self.forces, self.answer)
        if not (_close(nx, self.target_x, self.step / 2) and _close(ny, self.target_y, self.step / 2)):
            raise ValueError("the answer does not give the target net force")
        if all(_close(f.value, a, 1e-9) for f, a in zip(self.forces, self.answer)):
            raise ValueError("the start is already the solution")
        return self


def net_force(forces: list[Force], mags: list[float]) -> tuple[float, float]:
    sx = {"left": (-1, 0), "right": (1, 0), "up": (0, 1), "down": (0, -1)}
    return (sum(sx[f.direction][0] * m for f, m in zip(forces, mags)), sum(sx[f.direction][1] * m for f, m in zip(forces, mags)))


class Ingredient(_Strict):
    label: str = Field(min_length=1, max_length=30)
    unit: str = Field(default="", max_length=12)
    max: float = Field(gt=0, le=1e5)
    step: float = Field(gt=0)
    answer: float = Field(gt=0)  # one correct mix; any multiple of it also works


class Mixer(_Station):
    type: Literal["Mixer"]
    product: str = Field(min_length=1, max_length=80)
    ingredients: list[Ingredient] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def _ok(self):
        _unique([i.label for i in self.ingredients], "ingredients")
        for i in self.ingredients:
            if i.answer > i.max or i.max / i.step > 400:
                raise ValueError("answer beyond max or step too small")
            if not _on_grid(i.answer, i.step):
                raise ValueError(f"{i.label}: answer {i.answer} is not a multiple of the step {i.step}")
        return self


class Outcome(_Strict):
    on: list[str] = Field(max_length=4)  # switches that are on; the rest are off
    result: str = Field(min_length=1, max_length=80)


class ToggleSystem(_Station):
    type: Literal["ToggleSystem"]
    switches: list[Annotated[str, Field(min_length=1, max_length=30)]] = Field(min_length=2, max_length=4)
    outcomes: list[Outcome] = Field(min_length=1, max_length=16)
    default_result: str = Field(min_length=1, max_length=80)
    target_result: str = Field(min_length=1, max_length=80)

    @model_validator(mode="after")
    def _ok(self):
        _unique(self.switches, "switches")
        seen = set()
        for o in self.outcomes:
            if any(s not in self.switches for s in o.on):
                raise ValueError("an outcome names an unknown switch")
            key = frozenset(o.on)
            if key in seen:
                raise ValueError("two outcomes for the same switch setting")
            seen.add(key)
        if self.target_result not in [o.result for o in self.outcomes]:
            raise ValueError("the target result is never produced")
        return self


class Detail(_Strict):
    label: str = Field(min_length=1, max_length=40)
    detail: str = Field(min_length=2, max_length=260)


class ExploreDiagram(_Station):
    type: Literal["ExploreDiagram"]
    layout: Layout
    center: str = Field(default="", max_length=40)
    parts: list[Detail] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def _ok(self):
        _unique([p.label for p in self.parts], "labels")
        return self


# ---------------------------------------------------------------------------
# 15 interactive simulations and explorables


class Param(_Strict):
    name: str
    label: str = Field(min_length=1, max_length=40)
    unit: str = Field(default="", max_length=12)
    min: float
    max: float
    step: float = Field(gt=0)
    value: float  # where the slider starts
    answer: float  # a setting that meets the goal

    @model_validator(mode="after")
    def _ok(self):
        if not NAME.match(self.name) or self.name in ("x", "t", "pi", "e"):
            raise ValueError(f"bad parameter name '{self.name}'")
        if not self.min < self.max or (self.max - self.min) / self.step > 1000:
            raise ValueError("bad slider range")
        if not (self.min <= self.value <= self.max and self.min <= self.answer <= self.max):
            raise ValueError("start and answer must be within the slider range")
        # the browser slider only stops on min + k*step: check the goal at the values it can reach
        self.value = min(self.max, _snap(self.value, self.step, self.min))
        self.answer = min(self.max, _snap(self.answer, self.step, self.min))
        return self


def _params_ok(params: list[Param]) -> None:
    _unique([p.name for p in params], "parameter names")
    if all(_close(p.value, p.answer, p.step / 2) for p in params):
        raise ValueError("the sliders already start at the answer")


class ParameterLab(_Station):
    type: Literal["ParameterLab"]
    expression: str  # output as a formula of the parameter names
    output_label: str = Field(min_length=1, max_length=40)
    output_unit: str = Field(default="", max_length=12)
    params: list[Param] = Field(min_length=1, max_length=3)
    target: float
    tolerance: float = Field(gt=0)

    @model_validator(mode="after")
    def _ok(self):
        _params_ok(self.params)
        try:
            tree = compile_expr(self.expression, [p.name for p in self.params])
            at = evaluate(tree, {p.name: p.answer for p in self.params})
            start = evaluate(tree, {p.name: p.value for p in self.params})
        except ExprError as exc:
            raise ValueError(str(exc)) from exc
        if not _close(at, self.target, self.tolerance):
            raise ValueError(f"the answer gives {at:.4g}, not the target {self.target}")
        if _close(start, self.target, self.tolerance):
            raise ValueError("the start already meets the target")
        return self


class FunctionPlot(_Station):
    type: Literal["FunctionPlot"]
    expression: str  # y as a formula of x and the parameter names
    x_min: float
    x_max: float
    x_label: str = Field(default="x", max_length=30)
    y_label: str = Field(default="y", max_length=30)
    params: list[Param] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def _ok(self):
        if not self.x_min < self.x_max:
            raise ValueError("bad x range")
        _params_ok(self.params)
        try:
            tree = compile_expr(self.expression, ["x", *[p.name for p in self.params]])
            ya = sample(tree, "x", self.x_min, self.x_max, {p.name: p.answer for p in self.params})
            yv = sample(tree, "x", self.x_min, self.x_max, {p.name: p.value for p in self.params})
        except ExprError as exc:
            raise ValueError(str(exc)) from exc
        span = max(max(ya + yv) - min(ya + yv), 1e-9)
        if max(abs(a - b) for a, b in zip(ya, yv)) < 0.05 * span:
            raise ValueError("the start curve already matches the target")
        return self


class Slider(_Strict):
    min: float
    max: float
    value: float
    answer: float

    @model_validator(mode="after")
    def _ok(self):
        if not self.min < self.max or not (self.min <= self.value <= self.max and self.min <= self.answer <= self.max):
            raise ValueError("bad slider")
        return self


class Projectile(_Station):
    type: Literal["Projectile"]
    speed: Slider  # m/s
    angle: Slider  # degrees
    gravity: float = Field(default=9.8, gt=0, le=30)
    target_distance: float = Field(gt=0)
    tolerance: float = Field(gt=0)

    @model_validator(mode="after")
    def _ok(self):
        if not (0 < self.angle.min and self.angle.max < 90):
            raise ValueError("angle must stay between 0 and 90 degrees")
        d = projectile_range(self.speed.answer, self.angle.answer, self.gravity)
        if not _close(d, self.target_distance, self.tolerance):
            raise ValueError(f"the answer lands at {d:.1f}, not {self.target_distance}")
        if _close(projectile_range(self.speed.value, self.angle.value, self.gravity), self.target_distance, self.tolerance):
            raise ValueError("the start already hits the target")
        return self


def projectile_range(v: float, deg: float, g: float) -> float:
    return v * v * math.sin(2 * math.radians(deg)) / g


class Pendulum(_Station):
    type: Literal["Pendulum"]
    length: Slider  # metres
    gravity: float = Field(default=9.8, gt=0, le=30)
    target_period: float = Field(gt=0)
    tolerance: float = Field(gt=0)

    @model_validator(mode="after")
    def _ok(self):
        if self.length.min <= 0:
            raise ValueError("length must be positive")
        if not _close(pendulum_period(self.length.answer, self.gravity), self.target_period, self.tolerance):
            raise ValueError("the answer length does not give the target period")
        if _close(pendulum_period(self.length.value, self.gravity), self.target_period, self.tolerance):
            raise ValueError("the start already has the target period")
        return self


def pendulum_period(length: float, g: float) -> float:
    return 2 * math.pi * math.sqrt(length / g)


class WaveExplorer(_Station):
    type: Literal["WaveExplorer"]
    amplitude: Slider
    frequency: Slider  # cycles per unit of x
    phase: Slider  # degrees
    x_label: str = Field(default="time", max_length=30)
    y_label: str = Field(default="displacement", max_length=30)

    @model_validator(mode="after")
    def _ok(self):
        if self.frequency.min <= 0 or self.amplitude.min < 0:
            raise ValueError("frequency must be positive")
        a, v = self.amplitude, self.frequency
        if _close(a.value, a.answer, 1e-9) and _close(v.value, v.answer, 1e-9) and _close(self.phase.value, self.phase.answer, 1e-9):
            raise ValueError("the start already matches")
        return self


class GrowthCurve(_Station):
    type: Literal["GrowthCurve"]
    model: Literal["exponential", "decay", "logistic"]
    start_value: float = Field(gt=0)
    capacity: float | None = Field(default=None, gt=0)  # logistic only
    rate: Slider  # per unit of time
    t_max: float = Field(gt=0)
    t_label: str = Field(default="time", max_length=30)
    y_label: str = Field(default="amount", max_length=30)
    target_time: float = Field(gt=0)
    target_value: float = Field(gt=0)

    @model_validator(mode="after")
    def _ok(self):
        if self.model == "logistic" and (self.capacity is None or self.capacity <= self.start_value):
            raise ValueError("logistic growth needs a capacity above the start value")
        if self.target_time > self.t_max or self.rate.min < 0:
            raise ValueError("target time beyond the graph, or negative rate")
        y = growth(self.model, self.start_value, self.capacity, self.rate.answer, self.target_time)
        if not _close(y, self.target_value, 0.05 * self.target_value):
            raise ValueError(f"the answer rate gives {y:.4g} at the target time, not {self.target_value}")
        if _close(growth(self.model, self.start_value, self.capacity, self.rate.value, self.target_time), self.target_value, 0.05 * self.target_value):
            raise ValueError("the start already meets the target")
        return self


def growth(model: str, n0: float, k: float | None, r: float, t: float) -> float:
    if model == "exponential":
        return n0 * math.exp(r * t)
    if model == "decay":
        return n0 * math.exp(-r * t)
    return k / (1 + (k / n0 - 1) * math.exp(-r * t))


class Point(_Strict):
    x: float
    y: float


class TrendLine(_Station):
    type: Literal["TrendLine"]
    points: list[Point] = Field(min_length=4, max_length=12)
    x_label: str = Field(min_length=1, max_length=30)
    y_label: str = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def _ok(self):
        xs = [p.x for p in self.points]
        if max(xs) - min(xs) <= 0:
            raise ValueError("points need different x values")
        return self


class Series(_Strict):
    label: str = Field(min_length=1, max_length=30)
    points: list[Point] = Field(min_length=3, max_length=20)


class DataCursor(_Station):
    type: Literal["DataCursor"]
    series: list[Series] = Field(min_length=1, max_length=3)
    x_label: str = Field(min_length=1, max_length=30)
    y_label: str = Field(min_length=1, max_length=30)
    question: str = Field(min_length=4, max_length=200)
    answer_x: float
    tolerance: float = Field(gt=0)

    @model_validator(mode="after")
    def _ok(self):
        xs = [p.x for s in self.series for p in s.points]
        if not min(xs) <= self.answer_x <= max(xs):
            raise ValueError("the answer lies outside the data")
        for s in self.series:
            if any(b.x <= a.x for a, b in zip(s.points, s.points[1:])):
                raise ValueError("points must be in increasing x")
        return self


class Stage(_Strict):
    label: str = Field(min_length=1, max_length=40)
    duration: float = Field(gt=0)
    detail: str = Field(min_length=2, max_length=220)


class ProcessScrubber(_Station):
    type: Literal["ProcessScrubber"]
    unit: str = Field(default="", max_length=16)
    stages: list[Stage] = Field(min_length=3, max_length=6)
    target_stage: str = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def _ok(self):
        _unique([s.label for s in self.stages], "stages")
        if self.target_stage not in [s.label for s in self.stages[1:]]:
            raise ValueError("target stage must be one of the stages after the first")
        return self


class Change(_Strict):
    label: str = Field(min_length=1, max_length=40)  # the quantity that is measured
    before: float = Field(ge=0)
    after: float = Field(ge=0)


class PredictObserve(_Station):
    type: Literal["PredictObserve"]
    setup: str = Field(min_length=4, max_length=320)
    change: str = Field(min_length=4, max_length=200)
    options: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=2, max_length=4)
    answer: str
    observation: str = Field(min_length=4, max_length=320)
    measure: Change

    @model_validator(mode="after")
    def _ok(self):
        _unique(self.options, "options")
        if self.answer not in self.options:
            raise ValueError("the answer must be one of the options")
        return self


class Choice(_Strict):
    text: str = Field(min_length=1, max_length=110)
    correct: bool
    feedback: str = Field(min_length=2, max_length=220)


class Step(_Strict):
    situation: str = Field(min_length=4, max_length=320)
    choices: list[Choice] = Field(min_length=2, max_length=3)

    @model_validator(mode="after")
    def _ok(self):
        if sum(c.correct for c in self.choices) != 1:
            raise ValueError("each step needs exactly one correct choice")
        return self


class ScenarioBranch(_Station):
    type: Literal["ScenarioBranch"]
    steps: list[Step] = Field(min_length=2, max_length=4)


class Statement(_Strict):
    text: str = Field(min_length=4, max_length=170)
    wrong: bool
    correction: str = Field(default="", max_length=170)

    @model_validator(mode="after")
    def _ok(self):
        if self.wrong and len(self.correction) < 4:
            raise ValueError("a wrong statement needs its correction")
        return self


class SpotTheError(_Station):
    type: Literal["SpotTheError"]
    statements: list[Statement] = Field(min_length=3, max_length=6)

    @model_validator(mode="after")
    def _ok(self):
        n = sum(s.wrong for s in self.statements)
        if not 1 <= n < len(self.statements):
            raise ValueError("some, but not all, statements must be wrong")
        return self


class Edge(_Strict):
    source: str = Field(min_length=1, max_length=30)
    target: str = Field(min_length=1, max_length=30)
    label: str = Field(min_length=1, max_length=30)


class ConceptMap(_Station):
    type: Literal["ConceptMap"]
    nodes: list[Annotated[str, Field(min_length=1, max_length=30)]] = Field(min_length=3, max_length=6)
    edges: list[Edge] = Field(min_length=2, max_length=6)

    @model_validator(mode="after")
    def _ok(self):
        _unique(self.nodes, "nodes")
        _unique([e.label for e in self.edges], "link labels")
        for e in self.edges:
            if e.source not in self.nodes or e.target not in self.nodes or e.source == e.target:
                raise ValueError("a link joins two different listed nodes")
        return self


class Card(_Strict):
    front: str = Field(min_length=1, max_length=130)
    back: str = Field(min_length=1, max_length=220)


class Flashcards(_Station):
    type: Literal["Flashcards"]
    cards: list[Card] = Field(min_length=3, max_length=8)


class Bar(_Strict):
    label: str = Field(min_length=1, max_length=24)
    value: float = Field(ge=0)


class DraggableBars(_Station):
    type: Literal["DraggableBars"]
    unit: str = Field(default="", max_length=12)
    y_max: float = Field(gt=0)
    bars: list[Bar] = Field(min_length=2, max_length=6)
    tolerance: float = Field(gt=0)

    @model_validator(mode="after")
    def _ok(self):
        _unique([b.label for b in self.bars], "bar labels")
        if any(b.value > self.y_max for b in self.bars):
            raise ValueError("a bar is taller than the axis")
        if self.tolerance > 0.25 * self.y_max:
            raise ValueError("tolerance too loose")
        return self


HANDS_ON = (SequenceSort, CategorySort, MatchPairs, CycleBuilder, Timeline, LabelDiagram, BalanceScale, NumberLine,
            CauseEffect, ClozeBank, ProportionBar, ForceArrows, Mixer, ToggleSystem, ExploreDiagram)
SIMULATIONS = (ParameterLab, FunctionPlot, Projectile, Pendulum, WaveExplorer, GrowthCurve, TrendLine, DataCursor,
               ProcessScrubber, PredictObserve, ScenarioBranch, SpotTheError, ConceptMap, Flashcards, DraggableBars)
CATALOG = {c.model_fields["type"].annotation.__args__[0]: c for c in HANDS_ON + SIMULATIONS}

Station = Annotated[Union[tuple(HANDS_ON + SIMULATIONS)], Field(discriminator="type")]  # type: ignore[valid-type]  # noqa: UP007
_station = TypeAdapter(Station)


class Lab(_Strict):
    schema_version: Literal["lab-ui/1"] = LAB_VERSION
    title: str = Field(min_length=2, max_length=100)
    intro: str = Field(min_length=4, max_length=400)
    toolbox: list[Annotated[str, Field(min_length=2, max_length=200)]] = Field(min_length=1, max_length=6)
    stations: list[Station] = Field(min_length=1, max_length=5)  # type: ignore[valid-type]
    source: Literal["gemini", "template", "mixed"] = "gemini"
    model: str = ""
    latency_ms: float = 0.0
    rejected: list[str] = Field(default_factory=list)  # why stations were dropped


def parse_station(data) -> tuple[BaseModel | None, str | None]:
    """A validated station, or the reason it was rejected."""
    if not isinstance(data, dict) or data.get("type") not in CATALOG:
        return None, f"unknown component {data.get('type') if isinstance(data, dict) else type(data).__name__!r}"
    try:
        return _station.validate_python(data), None
    except ValidationError as exc:
        e = exc.errors()[0]
        return None, f"{data['type']}: {'.'.join(str(p) for p in e['loc'][1:])} {e['msg']}"[:200]
