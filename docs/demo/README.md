# Demo extension: "Bring your own material"

A learner uploads a document (PDF, PPTX, TXT, MD) or pastes text. Gemini turns it
into topics with a question bank, and the learner studies a topic through the same
closed loop as the research testbed: BKT mastery estimate, PID complexity budget,
rule-based policy, a generated screen, and the validation gate with a deterministic
fallback. A progress report summarises each topic for the learner or a teacher.

> **Scope.** This is a demo extension, not part of the evaluated system. The paper's
> results cover linear equations with simulated learners only. Nothing here measures
> learning; "mastery" is the BKT model's estimate.

Progress is tracked in [DEV_CHECKLIST.md](DEV_CHECKLIST.md).

## Run it

```
cd backend
pip install -e ".[service]" && pip install -r requirements-demo.txt
cd ../frontend && npm ci && npm run build && cd ../backend
GENUI_STATIC_DIR=../frontend/dist uvicorn closedloop_demo.app:app --port 8000
# open http://localhost:8000/demo.html   (landing page; research testbed still at http://localhost:8000/)
```

Gemini on Vertex AI (global endpoint) uses the same auth as the research plant: on Cloud Run the service account token, locally
`GENUI_GEMINI_TOKEN=$(gcloud auth print-access-token)`. Without Gemini the demo
still works: the three sample packs are pre-generated, and every screen falls back to
the deterministic template (`GENUI_DEMO_PLANT=deterministic` forces that).

For development with hot reload: run the uvicorn command above without
`GENUI_STATIC_DIR`, then `cd frontend && npm run dev` and open
`http://localhost:5173/demo.html`.

## What happens, step by step

| Step | Where | Real or not |
|---|---|---|
| 1. Onboarding: name, level, interests, prior knowledge | `src/demo/Onboarding.tsx`, `POST /api/demo/learners` | Real. Prior knowledge sets the BKT start value P(L0): new 0.10, a little 0.25, fairly well 0.45. |
| 2. Text extraction | `closedloop_demo/ingest.py` | Real (pypdf, python-pptx incl. speaker notes, UTF-8 text). Max 15 MB; 60,000 characters go to Gemini. |
| 3. Topic outline | `bank.py`, one Gemini call (`gemini-3-flash-preview`) | Real Gemini call with a JSON response schema: 2 to 5 topics, summary, key points. |
| 4. Question bank | `bank.py`, one Gemini call per topic, in parallel | Real. 12 questions per topic, 3 at each level: recognise (multiple choice), understand (multiple choice), recall (fill the gap), apply (multiple choice in a new situation). Each has 3 hints and an explanation. A call that stalls for 45 s is sent again (up to 3 copies; the first reply wins). Typical total: 16-21 s. |
| 5. Validation of the bank | `bank.clean_question`, `bank.build_topic` | Deterministic. Answer must be one of the options, a blank has exactly one gap and a 1-3 word answer, no hint equals the answer, no duplicate prompts; a topic needs every level. Invalid questions are dropped and counted. |
| 6. Cache | `PackStore` | Pack id = SHA-256 of the extracted text. Same file again = instant. Sample packs ship in `closedloop_demo/packs/`. |
| 7. Each screen | `loop.DemoSession` | BKT tracker, PID governor and `SurrogatePolicy` are imported from `closedloop` unchanged. The policy's abstraction level picks a question of that level; `plant.plan` finds the closest layout to the budget. |
| 8. Screen text | `plant.GeminiLearnPlant` (`gemini-3.5-flash-lite`) | Real Gemini call per screen, about 1-2 s: rewrites the key ideas, nudge, worked example and hints for the learner's level and interests. The call carries a response schema built from the layout (`plant.layout_schema`): node types, order and every count are fixed, only the text is free. A call that has not answered after 7 s is sent again (up to 3 copies). A screen that is only the question, with no text, is not sent to Gemini; the gate log says so. |
| 9. Gate | `plant.admit` | Deterministic: schema, the screen references the right bank question, generated text does not contain the answer, measured complexity within 0.05 of the budget. Any failure renders the deterministic template. |
| 10. Marking | `loop.grade` | Deterministic. Multiple choice: exact option. Blank: case and punctuation ignored, accepted variants, one spelling slip allowed in words of 5+ letters. Gemini never marks. |
| 11. Progress report | `loop.topic_report`, `GET /api/demo/learners/{id}/report` | Per topic: answers, estimate start to now, highest level, hints, questions to review with explanations, status and advice. Printable. |

## Architecture

```
Browser: frontend/demo.html -> src/demo/*
  onboarding -> material (upload / paste / samples) -> topics -> learn screen -> progress report
        |                    |                                  |
        v                    v                                  v
  /api/demo/learners   /api/demo/packs              /api/demo/sessions[/{id}/responses]
                             |                                  |
                       ingest.extract                    DemoSession (one per learner x topic)
                             |                             BKTTracker  (closedloop.bkt)      unchanged
                       PackStore.create                    PIDGovernor (closedloop.governor) unchanged
                         outline call (Gemini)             SurrogatePolicy (closedloop.policy) unchanged
                         question calls (Gemini, parallel) plan + build (learn-ui/1 template)
                         clean + validate + cache          GeminiLearnPlant -> admit (gate) -> fallback
                                                           grade (deterministic)

closedloop_demo.app = FastAPI(/api/demo routes) + mount("/", closedloop.service.app)
```

### `learn-ui/1` components

Measured with the research metric: M_I = (rho, alpha, delta) with equal weights.

| Node | Interactive elements (rho) | Abstraction (alpha) |
|---|---|---|
| `ChoiceQuestion` style `guided` | options shown (2-4); optional static `key_idea` nudge | 1 |
| `ChoiceQuestion` style `plain` | options + optional "why" box | 2 |
| `BlankQuestion` | 1 input + word-bank chips (0 or 2-4) | 3 |
| `ChoiceQuestion` style `apply` | options + "why" box + key-idea checkboxes (0-4) | 4 |
| `HintAccordion` | one reveal per hint (1-3) | - |
| `ConceptCard`, `WorkedExplanation`, `Prompt` | 0 (static) | - |
| `Stack` | container, adds one level of depth | - |

A guided question on a screen too small for a concept card (the lowest budgets) carries a one-line
`key_idea` nudge instead, taken from the question's first hint. It adds no interactive element and no
depth, and the gate checks it for answer leaks like the hints.

The question node holds only a `question_id`. The server fills in the prompt and the
shown options from the validated bank, so a generated screen cannot change the answer
key, and the key is never sent to the browser.

Every reachable (budget, policy decision) pair for every question in the sample packs
has a template within the 0.05 tolerance (checked in `tests/demo/test_plant.py`).

## Frontend and design

The demo pages live in `frontend/src/demo/` and are a separate Vite page (`demo.html`).
They use their own stylesheet (`demo.css`: Tailwind v4 tokens, Inter and JetBrains Mono),
so the research app's styles are not touched.

| Route | Page |
|---|---|
| `#/` | Animated landing page: hero, live loop diagram, formats marquee, features, numbers, honest scope, call to action |
| `#/start` | Onboarding in three steps (about you, interests, starting point); shows the starting estimate P(L0) |
| `#/library` | Upload or paste material, or pick a sample pack; full-screen progress while Gemini writes the pack |
| `#/pack/:id` | Topics of one pack, with progress for topics already started |
| `#/learn/:sid` | Learning screen: the generated screen, "why this screen", and "under the hood" (trace chart, telemetry, gate log) |
| `#/report` | Progress report per topic; printable |

Animated components are copied into the repo (no runtime CDN), adapted only to import `cn()`
from `src/demo/lib/utils.ts`:

| Component | Source | Used for |
|---|---|---|
| Animated beam, border beam, shine border, shimmer button, word rotate, marquee, number ticker, blur fade, flickering grid, animated circular progress bar | [Magic UI](https://magicui.design) (MIT), `src/demo/ui/magicui/` | Loop diagram, card highlights, call-to-action button, counters, gauges, entrance animations |
| Aurora, spotlight card, shiny text, blur text | [React Bits](https://reactbits.dev) (MIT + Commons Clause), `src/demo/ui/reactbits/` | Hero background, hover-lit cards, headline and badge animations |

New frontend dependencies: `motion` (animations), `clsx` + `tailwind-merge` (`cn()`),
`canvas-confetti` (a burst when a level is reached or a topic is mastered).

## What did not change

- `backend/closedloop/**`, `frontend/src/` outside `src/demo/`, `results/`, `paper/`.
- `uvicorn closedloop.service:app` runs exactly what it ran before.
- The live research service `genui` and its `deploy.yml` workflow. The demo deploys
  as a separate Cloud Run service, `genui-demo`, from `Dockerfile.demo`.
- Existing files edited: `frontend/vite.config.ts` adds `demo.html` as a second page of
  the build; `frontend/package.json` and `package-lock.json` add the four frontend
  dependencies above (the research app does not import them).

## Tests

```
cd backend && python -m pytest tests/demo            # demo unit + API tests (Gemini faked)
cd backend && python -m pytest tests --ignore=tests/demo   # existing suite, unchanged
cd e2e && npm ci && npx playwright test              # browser tests, real server, real Gemini
```

The Playwright suite (`e2e/tests/demo.spec.ts`) starts the demo server itself (or set
`E2E_BASE_URL` to test a deployment). It covers: the landing page, onboarding, live
Gemini topic generation from pasted text (a run stamp makes every run a fresh generation),
six adaptive items, the progress report, PDF upload
(cache hit), PPTX upload, unsupported/empty file errors, profile persistence, and
that research mode still works. In a sandbox with a preinstalled Chromium, set
`PW_CHROMIUM` to its path.

## Regenerating the sample packs

```
cd backend && python -m closedloop_demo.seed ../docs/demo/samples/*
```

The sample documents in `docs/demo/samples/` were written for this demo
(photosynthesis PDF, Newton's laws PPTX, water cycle Markdown).

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GENUI_DEMO_PLANT` | `gemini` | Default screen writer: `gemini` or `deterministic`. |
| `GENUI_DEMO_MODEL` | `gemini-3-flash-preview` | Model that writes topics and questions. |
| `GENUI_DEMO_SCREEN_MODEL` | `gemini-3.5-flash-lite` | Model that writes each screen's text. |
| `GENUI_DEMO_BANK_THINKING` | `LOW` | Thinking level for bank generation. |
| `GENUI_DEMO_BANK_HEDGE_AFTER` | `45` | Seconds before a stalled bank call is sent again. |
| `GENUI_DEMO_ITEM_TIMEOUT` | `25` | Seconds before a screen call gives up (template shown). |
| `GENUI_DEMO_HEDGE_AFTER` / `GENUI_DEMO_HEDGE_COPIES` | `7` / `3` | Re-send a slow screen call after this many seconds, up to this many copies. |
| `GENUI_DEMO_GEMINI_DAILY_CAP` | `0` (off) | Max screen calls per UTC day, then templates. |
| `GENUI_DEMO_CACHE` | `/tmp/genui-demo-packs` | Where generated packs are cached on disk. |
| `GENUI_DEMO_MAX_SESSIONS` | `300` | In-memory sessions kept (oldest dropped). |

## Known limits

- Learners, sessions and generated packs live in server memory (one instance), like
  the research app. A restart keeps the sample packs and the browser's profile, but
  loses sessions and runtime packs.
- Scanned PDFs (images only) have no text to extract; the page asks for pasted text.
- One BKT skill per topic; the guess parameter is 0.25 for every question type.
- Question quality depends on Gemini and is not evaluated; the checks above only
  catch structural problems.
- Why these models: on 2026-10-23 `gemini-3.7-flash` (the research plant's model) stalled
  for 25 s or more on about half of all calls. Measured in this sandbox: bank generation
  with `gemini-3-flash-preview` took 16-21 s in 8 of 8 runs (3.7-flash: 57-123 s, 1 of 3
  failed); screens with `gemini-3.5-flash-lite` and the layout schema passed the gate in
  32 of 32 tries at about 2 s. The research results in `results/` are unaffected.
