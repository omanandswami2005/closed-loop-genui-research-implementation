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
# open http://localhost:8000/demo.html   (research testbed still at http://localhost:8000/)
```

Gemini (Vertex AI, `gemini-3.7-flash`, global endpoint) uses the same auth as the
research plant: on Cloud Run the service account token, locally
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
| 3. Topic outline | `bank.py`, one Gemini call | Real Gemini call with a JSON response schema: 2 to 5 topics, summary, key points. |
| 4. Question bank | `bank.py`, one Gemini call per topic, in parallel | Real. 12 questions per topic, 3 at each level: recognise (multiple choice), understand (multiple choice), recall (fill the gap), apply (multiple choice in a new situation). Each has 3 hints and an explanation. |
| 5. Validation of the bank | `bank.clean_question`, `bank.build_topic` | Deterministic. Answer must be one of the options, a blank has exactly one gap and a 1-3 word answer, no hint equals the answer, no duplicate prompts; a topic needs every level. Invalid questions are dropped and counted. |
| 6. Cache | `PackStore` | Pack id = SHA-256 of the extracted text. Same file again = instant. Sample packs ship in `closedloop_demo/packs/`. |
| 7. Each screen | `loop.DemoSession` | BKT tracker, PID governor and `SurrogatePolicy` are imported from `closedloop` unchanged. The policy's abstraction level picks a question of that level; `plant.plan` finds the closest layout to the budget. |
| 8. Screen text | `plant.GeminiLearnPlant` | Real Gemini call per screen: rewrites key ideas, worked example and hints for the learner's level and interests inside the fixed layout. |
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
| `ChoiceQuestion` style `guided` | options shown (2-4) | 1 |
| `ChoiceQuestion` style `plain` | options + optional "why" box | 2 |
| `BlankQuestion` | 1 input + word-bank chips (0 or 2-4) | 3 |
| `ChoiceQuestion` style `apply` | options + "why" box + key-idea checkboxes (0-4) | 4 |
| `HintAccordion` | one reveal per hint (1-3) | - |
| `ConceptCard`, `WorkedExplanation`, `Prompt` | 0 (static) | - |
| `Stack` | container, adds one level of depth | - |

The question node holds only a `question_id`. The server fills in the prompt and the
shown options from the validated bank, so a generated screen cannot change the answer
key, and the key is never sent to the browser.

Every reachable (budget, policy decision) pair for every question in the sample packs
has a template within the 0.05 tolerance (checked in `tests/demo/test_plant.py`).

## What did not change

- `backend/closedloop/**`, `frontend/src/` outside `src/demo/`, `results/`, `paper/`.
- `uvicorn closedloop.service:app` runs exactly what it ran before.
- The live research service `genui` and its `deploy.yml` workflow. The demo deploys
  as a separate Cloud Run service, `genui-demo`, from `Dockerfile.demo`.
- One existing file was edited: `frontend/vite.config.ts` adds `demo.html` as a
  second page of the build.

## Tests

```
cd backend && python -m pytest tests/demo            # demo unit + API tests (Gemini faked)
cd backend && python -m pytest tests --ignore=tests/demo   # existing suite, unchanged
cd e2e && npm ci && npx playwright test              # browser tests, real server, real Gemini
```

The Playwright suite (`e2e/tests/demo.spec.ts`) starts the demo server itself (or set
`E2E_BASE_URL` to test a deployment). It covers: onboarding, live Gemini topic
generation from pasted text, six adaptive items, the progress report, PDF upload
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
| `GENUI_DEMO_MODEL` | `gemini-3.7-flash` | Model for the bank and the screens. |
| `GENUI_DEMO_BANK_THINKING` | `LOW` | Thinking level for bank generation. |
| `GENUI_DEMO_ITEM_TIMEOUT` | `25` | Seconds before a screen call gives up (template shown). |
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
