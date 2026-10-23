# Interactive labs: generative UI you learn by doing

Each topic of an uploaded document starts with an interactive lab. Gemini designs it for
the learner, the server checks it, and the browser renders it with a fixed library of 30
components. After the lab comes the adaptive check (at most 10 questions), then a topic
summary.

> **Scope.** Part of the demo extension, not of the evaluated system. Nothing here
> measures learning. The lab results (solved, tries, solution shown) are recorded and
> reported, but they do not feed the BKT estimate; only the check's answers do.

## Why it looks like this

The design follows Google Research's write-up of generative-UI practice interactives
for teachers, ["The future of practice: enabling teachers to create learning interactives
with generative UI"](https://research.google/blog/the-future-of-practice-enabling-teachers-to-create-learning-interactives-with-generative-ui/):

| Idea in the Google write-up | How it appears here |
|---|---|
| Levels that get progressively harder | 3-4 levels per lab, ordered easiest to hardest; a stepper shows progress |
| An intro that activates prior knowledge | Each level opens with a 1-2 sentence intro linked to the learner's interests where natural |
| A toolbox of formulas and facts | The lab's toolbox panel: 3-5 key facts from the material |
| Multiple hint levels | 2-3 hints per level, revealed one at a time (gentle nudge to strong clue) |
| Feedback on each attempt | The component reports what is still wrong ("2 labels are on the wrong part", "it landed at 17.3 m; the target is 20 m") |
| Worked solution after attempts | "Show worked solution" appears after 2 failed checks; it puts the component into the solved state and explains why |
| Self-correcting generation (check pedagogy, mechanics and solvability, then fix) | The server validates every level and re-computes its solution; rejected levels are sent back to Gemini once with the validator's reasons; anything still missing is filled from a deterministic template |

## Why our own library (not CopilotKit or the A2UI renderer)

We considered CopilotKit and Google's A2UI renderer and chose an A2UI-style library of our
own: Gemini emits declarative JSON for a fixed catalog, never code. Reasons:
the learning components (balance scale, projectile, label-a-diagram, ...) do not exist in
either library and would have to be written anyway; a chat-centred framework does not fit
the lab-apparatus style of this project; and owning the schema lets the server check
solvability per component, which a generic renderer cannot.

## The flow

```
POST /api/demo/sessions                    -> stage "explore"
POST /api/demo/sessions/{id}/lab           -> lab-ui/1 JSON (Gemini, validated, cached)
POST /api/demo/sessions/{id}/lab/results   <- per level: solved, tries, solution shown, seconds
POST /api/demo/sessions/{id}/lab/finish    -> stage "check"
POST /api/demo/sessions/{id}/responses     -> up to 10 answers, then stage "done" (409 after)
GET  /api/demo/gallery                     -> one validated example of every component
GET  /api/demo/catalog                     -> the component names
```

## How a lab is made (`backend/closedloop_demo/labs.py`)

1. **Prompt.** The topic's title, summary, key points and an excerpt, the learner's name,
   level and interests, and the compact catalog (`CATALOG_DOC`). Gemini must mix at least
   one hands-on component with one simulation or explorable, and may use a quantitative
   simulation only when the topic has a real quantitative relationship (no invented formulas).
2. **Call.** `gemini-3-flash-preview` returns JSON. A call that has not answered after 35 s
   is sent again (up to 3 copies; first reply wins; 100 s deadline).
3. **Gate.** `widgets.parse_station` validates each level with a Pydantic model per
   component (shared fields plus the component's own) and re-computes the solution, for example:
   - BalanceScale: the `answer` weights must exactly balance the left pan.
   - ForceArrows: the answer magnitudes must give the target net force and sit on the slider grid.
   - ParameterLab / FunctionPlot: the formula is parsed by a safe arithmetic language
     (`expr.py`: numbers, named parameters, `+ - * / ^`, a few math functions; no names,
     attributes or calls outside that list), the answer must hit the target and the start must not.
     Slider values are snapped to the slider's grid before the check, so the browser can reach them.
   - Projectile / Pendulum / GrowthCurve: physics or growth model at the answer must hit the target.
   - ClozeBank 2-5 gaps, ProportionBar sums to 100, ScenarioBranch exactly one right choice per
     step, SpotTheError some but not all statements false, ConceptMap edges join listed nodes,
     ToggleSystem target reachable, and so on.
4. **Repair.** Rejected levels and their reasons go back to Gemini once.
5. **Top-up.** If fewer than 3 levels survive (or Gemini is down), deterministic levels built
   from the validated question bank fill the lab (explore the key ideas, fill the gaps, flashcards).
6. **Cache.** Per pack, topic, learner level and interests, in memory and on disk. A lab that
   is only fallback is not cached, so the next visit tries Gemini again.

The page shows how the lab was made: model, time, how many drafts the gate rejected and why.

## The 30 components (`lab-ui/1`)

Renderer: `frontend/src/demo/genui/` (`registry.tsx`, `Station.tsx` level shell,
`LabStage.tsx`, `widgets/handsOn.tsx`, `widgets/sims.tsx`, `kit.tsx`, `expr.ts`).
Every component works by tapping (pick, then place) as well as dragging, so it works on phones.

### Hands-on manipulatives

| Component | The learner... |
|---|---|
| SequenceSort | drags steps into order |
| CategorySort | sorts items into 2-3 groups |
| MatchPairs | matches terms with definitions or examples |
| CycleBuilder | places stages around a cycle |
| Timeline | places events on a time axis |
| LabelDiagram | labels the boxes of a diagram (flow, layers, hub or cycle) from clues |
| BalanceScale | puts weights on a scale until it balances |
| NumberLine | drags markers to where they belong on a scale |
| CauseEffect | draws arrows from causes to effects |
| ClozeBank | drags words into the gaps of a passage (with decoys) |
| ProportionBar | moves dividers to estimate a composition |
| ForceArrows | sets forces until the net force hits a target |
| Mixer | mixes amounts in the right ratio |
| ToggleSystem | flips switches to reach a target outcome |
| ExploreDiagram | opens every part of a diagram to read about it |

### Simulations and explorables

| Component | The learner... |
|---|---|
| ParameterLab | moves sliders until a computed output hits a target (live sweep chart) |
| FunctionPlot | moves sliders until their curve matches a target curve |
| Projectile | sets speed and angle and launches until it lands on the target (animated) |
| Pendulum | sets the length for a target period (animated) |
| WaveExplorer | matches a target wave with amplitude, frequency and phase |
| GrowthCurve | sets the rate so an exponential, decay or logistic curve passes a point |
| TrendLine | fits a line to data with slope and intercept |
| DataCursor | drags a cursor across real data to answer a question |
| ProcessScrubber | scrubs or plays an animated process and stops at a stage |
| PredictObserve | predicts, runs the experiment, then sees the measured result |
| ScenarioBranch | makes decisions in a realistic situation, with feedback per choice |
| SpotTheError | finds the false statements and sees the corrections |
| ConceptMap | labels the links between concepts |
| Flashcards | recalls, flips and self-checks |
| DraggableBars | drags bars to estimate real values |

The gallery (`#/gallery`) shows one example of each. The examples in
`backend/closedloop_demo/gallery.json` were written by Gemini once and are re-validated
by the gate on every load.

## Tests

- `backend/tests/demo/test_expr.py`: the formula language evaluates arithmetic and rejects
  everything else (imports, attributes, lambdas, unknown names, ...).
- `backend/tests/demo/test_widgets.py`: 15 + 15 components; all gallery examples pass;
  unsolvable or broken levels are rejected; slider values snap to the grid.
- `backend/tests/demo/test_labs.py`: composition, caching, the repair round, duplicates,
  the fallback when Gemini is down, template levels for every sample topic.
- `backend/tests/demo/test_loop.py`, `test_routes.py`: the 10-question limit, the early
  finish at mastery, lab results in the report, the lab routes, 409 after the end.
- `e2e/tests/genui.spec.ts`: in a real browser, each of the 30 components renders; 23 are
  solved from their data by the clicks, drags and slider moves a learner would make, then
  checked; every non-self-finishing component is put into a correct state by its worked
  solution; no console errors.
- `e2e/tests/demo.spec.ts`: a live Gemini lab played level by level, then the check runs to
  its end and the summary appears.

## Known limits

- Lab quality depends on Gemini. The gate checks structure and solvability, not whether
  every fact is right; the prompt asks Gemini to stay faithful to the material.
- SequenceSort, CycleBuilder, ProportionBar, TrendLine, DataCursor, ProcessScrubber and
  ConceptMap are covered in the browser test by their worked solution, not by a scripted
  solve (they need drags or exact slider positions that are awkward to script).
- The first lab for a topic takes 8-35 s; later visits are instant from the cache.
