# Frontend: CLT-UI renderer and testbed

React 19 + TypeScript + Tailwind 4 + KaTeX. It renders whatever CLT-UI tree
the backend admits and shows the controller's state next to it.

```
cd ../backend && pip install -e ".[service]" && uvicorn closedloop.service:app --port 8000
cd ../frontend && npm install && npm run dev        # http://localhost:5173, /api proxied to :8000
```

`VITE_API_BASE` points a production build at a separately hosted API.
`GENUI_API` changes the dev proxy target.

## Layout

| File | Role |
|---|---|
| `src/clt/Renderer.tsx` | Maps each AST node type to one component; nothing in the tree is executed |
| `src/clt/ConcreteBalanceScale.tsx` | C1: pan balance; weight tokens (click or drag) apply to both pans |
| `src/clt/WorkedSolutionStep.tsx` | C2: operation, result and explanation on one row |
| `src/clt/ScaffoldedOperationPad.tsx` | C3: inverse-operation buttons, optional value field |
| `src/clt/SymbolicEquationWorkspace.tsx` | C4: free lines, each checked by the server's symbolic checker |
| `src/clt/SteppedHintAccordion.tsx` | C5: hints revealed one tier at a time |
| `src/clt/CartesianVerificationPlane.tsx` | C6: both sides as lines; probe and sliders |
| `src/TelemetryBar.tsx` | P(L_n), e_n, u_n, M_I*, M_I, gate result, plant latency |
| `src/TracePlot.tsx` | P(L_n), M_I* and M_I over items, with P* |

Each component shows exactly the controls that `interactive_count` in
`backend/closedloop/ast_schema.py` counts (weight tokens, operation buttons and
value field, input lines, hint tiers, plane probe and sliders), so the M_I the
server measures tracks what the learner sees. Utility controls present on every
screen (undo, reset, submit, the answer field) are not counted.
