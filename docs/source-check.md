# Source check: is every design choice backed by a real paper?

Checked on 2026-10-03. Every paper named here was looked up in Crossref, the
arXiv API, or the publisher's page, and the title, authors, venue and year
were matched. BibTeX for all of them is in [`references.bib`](references.bib).

**How to read this file**

- **Supported**: a published paper says this directly.
- **Adapted**: the idea comes from a paper, but we use it in a new place.
  The paper must say "following X, we..." and not "X showed...".
- **Ours**: we picked it. The paper must call it a design parameter.
- **Unconfirmed**: the source exists but I could not read the passage that
  backs the claim. Fine to cite for the general idea, not for the detail.

## 1. Plain summary

- All 20 references in `docs/sources.md` (on the engine branch) are real
  papers or books with the right authors, venue and year.
- Five rows need a small fix: one bound is credited to the wrong paper, two
  rows say "Cited" where "Adapted" is honest, one row leans on a paper for a
  claim I could not find in it, and one row misses the paper that actually
  explains the "five wrong answers" problem. Details in section 2.
- The gaps the coordinator listed are now filled with confirmed sources
  (section 3): parameter ranges, the fast/slow decision split, generative UI,
  linear-equation misconceptions, the rule-based baseline, and adaptive-UI
  stability.
- Many numbers are still our own choices with no paper behind them
  (section 4). That is normal, but the paper must say so.
- Section 5 explains, with sources, why five wrong answers did not lower the
  difficulty, and lists the fixes the literature offers.

## 2. Corrections to `docs/sources.md`

All fixes below were applied to `docs/sources.md` on the engine branch on 2026-10-03.

| Row in sources.md | Problem | Fix |
|---|---|---|
| "Guess < 0.3 and slip < 0.1 are the usual non-degenerate bounds [1][2]" | The 0.3 / 0.1 bound is Corbett & Anderson's. Baker, Corbett & Aleven 2008 used a looser bound of 0.5 for each. Source for both statements: Slater & Baker 2018, Sec. 2 (read in full). | Credit 0.3 / 0.1 to `corbett1995knowledge` and 0.5 to `baker2008contextual`; add `slater2018degree` as the place that compares them. |
| Same row: "values are within published bounds" | True for the default priors (G = 0.20, S = 0.08). **Not** true for the cohorts: the Struggling Novice slip range is 0.20 to 0.30 and the Inconsistent Guesser has guess up to 0.40 and slip up to 0.30, which break the 0.3 / 0.1 bound. They do satisfy Baker's 0.5 bound and van de Sande's exact conditions G + S < 1 and T < 1 − S / (1 − G) (checked for every range end). | Say: "archetype ranges satisfy the non-degeneracy conditions of `vandesande2013properties` and the 0.5 bound of `baker2008contextual`, but deliberately exceed the tighter 0.3/0.1 bound of `corbett1995knowledge` to model noisy learners." |
| "P(G)+P(S) < 1 makes BKT identifiable [3]" | Doroudi & Brunskill 2017 does make this point (confirmed from its summary, not the full text). The derivation itself is in van de Sande 2013, Eqs. 15 and 16, which I read. | Cite `vandesande2013properties` (Eq. 15, 16) next to `doroudi2017misidentified`. |
| "Per-learner parameter variation: individualized priors and learning rates [5]" | Pardos & Heffernan 2010 individualizes the **prior** only. Their abstract says learning-rate individualization was still missing. | Add `yudelson2013individualized` for individual learning rates. |
| "Saturation after success runs ... Cited ... [6][7]" | Neither paper talks about saturation. Khajah et al. 2016 add forgetting to capture **recency effects**; Qiu et al. 2011 add forgetting tied to **time between sessions** (days), not per item. | Change status to **Adapted**. Cite `vandesande2013properties` for the cause: under correct answers the mastery estimate converges to a stable fixed point at 1 (Sec. 4). See section 5. |
| "Synthetic learners from BKT ... Fancsali 2013 [10]; Pelánek 2017 [11]" | Fancsali et al. 2013 is right: they simulate students from random BKT parameters (confirmed via a later paper's description). I could not confirm Pelánek 2017 discusses simulated learners. | Keep [10]. Replace [11] for this claim with `kaser2024simulated` (systematic review of simulated learners) and `vanlehn1994simulated` (the classic paper on why simulated students are used to test designs). Add `slater2018degree`, which also generates BKT data from chosen parameters. Keep Pelánek 2017 for the BKT-vs-alternatives overview. |
| "Hysteresis deadband ... Cited ... [13]" | Hysteresis against chattering is standard control practice, but I did not find the page in Åström & Murray that says it. | Mark **Unconfirmed** or **Adapted**; say "a standard hysteresis deadband" without a page claim. |
| "Model emits JSON constrained by a schema ... Cited [20]" | Willard & Louf 2023 is about token-level constrained decoding (Outlines). Our engine instead checks the output **after** generation and falls back. That is a different mechanism. | Status **Adapted**. Add `geng2023grammar`, `geng2025jsonschemabench` (how reliable schema-constrained output is in practice), `tam2024speak` (format limits can hurt model quality: a fair caveat), and `pezoa2016jsonschema` for JSON Schema itself. |
| Setpoint row | **Decision (omiii, 2026-10-03): the target moves from 0.85 to 0.95**, the usual mastery threshold. | Status becomes **Supported**: `corbett1995knowledge` set mastery at 0.95; `zhang2025mastery` (read in full) calls 0.95 "the widely adopted threshold" and reports that 0.98 helps a bit more. Do not cite the "85% rule" (`wilson2019eighty`) for any setpoint: it is about the best accuracy rate during training, not a mastery probability. |
| BKT docstring analogy "forgetting factor in recursive estimation" | Reasonable, but uncited. | Cite a recursive-estimation text if it stays in the paper, or drop it. |

Everything else in `sources.md` checked out: Corbett & Anderson (year 1995;
the issue is cover-dated 1994, so use 1995 everywhere, including the spec's
"1994"), pyBKT, Page 1954, Basseville & Nikiforov 1993, both Åström books,
Sweller 1988, Kalyuga et al. 2003, Renkl & Atkinson 2003, Wood et al. 1976,
Vlassis 2002 (the negative-numbers caveat is in the paper), Miniukovich &
De Angeli 2014 (correctly framed as related work only).

## 3. Gaps now filled

| Claim or choice | Status | Sources (BibTeX keys) |
|---|---|---|
| Typical ranges for guess, slip and learn in simulation | Supported | `slater2018degree` (simulates with G, S from 0.01 to 0.45, T from 0.01 to 0.35, L0 from 0.01 to 0.75); `corbett1995knowledge`, `baker2008contextual`, `vandesande2013properties` for bounds |
| Knowledge component as the unit of mastery | Supported | `koedinger2012kli`, `corbett1995knowledge` |
| BKT vs. other learner models (PFA, DKT, DBN) as related work | Supported | `pelanek2017bkt`, `desmarais2012review`, `pavlik2009pfa`, `gong2011construct`, `piech2015dkt`, `khajah2016deep`, `kaser2017dbn` |
| Tutors that adapt problems but not the interface (the gap) | Supported | `vanlehn2011relative`, `ritter2007cognitive`, `brusilovsky2001adaptive` |
| Rule-based baseline (3 right to step up, 2 wrong to step down) | Adapted | `levitt1971updown` (up-down staircase rules), `kelly2015mastery` (N-consecutive-correct mastery rule). The 3/2 numbers are ours |
| PID and anti-windup in general | Supported | `astrom1989windup` (original windup paper), `astrom2006advanced`, `astrom2008feedback` |
| Using control theory to steer software, not machines | Supported | `hellerstein2004feedback` |
| Adjusting difficulty to the player/learner in a loop | Supported | `hunicke2005dda` (games) |
| Interface changes must be stable and predictable (why jitter matters) | Supported | `gajos2008predictability`, `findlater2004menus`, `gajos2006design`, `lavie2010adaptive`. The jitter formula itself is **ours** |
| Generating personalized interfaces automatically | Supported | `gajos2010supple` |
| Generative UI (the open-loop baseline idea) | Supported (preprints) | `leviathan2026genui` (Google; also introduces the PAGEN dataset), `tu2026maicui` (generative courseware). Both are arXiv preprints, not peer reviewed; say so |
| Counting interactive elements as a load proxy (ρ in M_I) | Adapted | `sweller2010element` (element interactivity), `miniukovich2014quantification` |
| Balance scale, then operation pad, then symbols (the level ladder) | Adapted | `fyfe2014concreteness` (concreteness fading), `vlassis2002balance`, `otten2019balance` (review of the balance model) |
| Worked examples first for algebra novices, then fade | Supported | `sweller1985worked` (algebra specifically), `renkl2003structuring`, `salden2010expertise` (adaptive fading inside a Cognitive Tutor) |
| Less guidance for experts | Supported | `kalyuga2003expertise`, `kalyuga2005rapid` |
| Split attention (worked step text next to the math) | Supported | `chandler1991format` |
| Stepped hints | Supported | `aleven2003help` |
| Scaffolding in general | Supported | `wood1976tutoring`, `vandepol2010scaffolding` |
| Graph of lines as a separate representation (level 4) | Adapted | `ainsworth2006deft`, `koedinger2004story`. No source says the graph is "harder" than symbols; that ordering of α is **ours** |
| Linear-equation misconceptions (why error runs happen) | Supported | `kieran1981equality` (equal sign read as "write the answer"), `herscovics1994gap` (difficulty operating on the unknown), `alibali2007equal`, `booth2014persistent` (errors that persist through instruction) |
| Students who never reach mastery | Supported | `beck2013wheel` (wheel-spinning) |
| Fast "System 1" decider + slow "System 2" generator | Adapted | `kahneman2011thinking` for the terms only. It is a psychology analogy, not evidence for the architecture |
| Laya as the fast decider | **No paper exists** | Only a model card and vendor blog posts (`laya2026`). The engine uses a deterministic stand-in, so the paper should say Laya is "a drop-in option" and must not cite the vendor's latency numbers as results |
| Measuring cognitive load | Supported, but not done | `paas2003measurement`. We do not measure load, so cite only in Limitations / Future work |
| Simulated learners as a valid test method | Supported | `vanlehn1994simulated`, `kaser2024simulated`, `fancsali2013optimal`, `rafferty2016pomdp` |

## 4. Choices that are ours (no paper backs the number)

Say "we set" or "design parameter" for each of these in the paper:

- PID gains Kp = 1.25, Ki = 0.10, Kd = 0.35; filter γ = 0.10; integral clamp 3.0; slope k = 2.0; hysteresis 0.06. Section 6 explains how to turn these from "hand-picked" into "found by a documented tuning procedure".
- The setpoint is no longer ours: it is now 0.95, the published mastery threshold (section 2).
- BKT defaults P(L0) = 0.15, P(T) = 0.12, P(G) = 0.20, P(S) = 0.08. The spec calls these "standard calibrated priors". They are not from any published fit; change that wording.
- M_I weights 0.40 / 0.35 / 0.25, the bounds ρ ∈ [1, 8] and δ ∈ [1, 4], and the α ordering 1 to 4. Section 7 lists what each part of the formula can lean on, and what to do about the weights.
- Tolerance ε = 0.05, fallback grid of 40, recent-error window of 5, hint rule.
- Archetype ranges, cohort sizes 300 / 400 / 300, 40 steps per learner.
- Surrogate plant fault rates (15% off-budget, 3% broken JSON) and the open-loop noise 0.15. These are placeholders until measured on real Gemini output.
- Lapse detector threshold h = 6.5 and reset value 0.5.

Spec citations that do not match a real source as written: "Paas (2023)"
(no matching paper found; use `paas2003measurement` or `sweller2019cognitive`),
"Corbett & Anderson (1994)" (use 1995), and "Dreyfus (1986)" (a real book,
*Mind over Machine*, but not checked here and not needed).

## 5. The "five wrong answers" problem

**What happens.** BKT updates its guess of mastery after every answer. When a
learner answers correctly many times, the guess climbs toward 100%. van de
Sande 2013 (Sec. 4) proves that, with correct answers, the estimate is pulled
to a stable fixed point at exactly 1. Near that point a wrong answer only
moves it a tiny amount, because the model reads the error as a slip.

**Quick check with our default numbers** (G = 0.20, S = 0.08, T = 0.12):

| Correct answers first | Mastery after them | Mastery after 5 wrong answers in a row |
|---|---|---|
| 10 | 0.9999997 | 0.984 |
| 20 | 0.99999999999998 | 1.0 (no visible change) |
| 40 | exactly 1.0 in the computer | 1.0, and it can never move again |

After 24 correct answers the number becomes exactly 1.0 in floating
point. At exactly 1.0 the Bayes update cannot lower it, so plain BKT is stuck
for good. This is worth one sentence in Limitations.

**Fixes the literature offers** (for the engine thread, which owns the code):

1. **Let the model forget** (already on the engine branch). Add a chance P(F)
   that a known skill becomes unknown each step. This keeps the estimate
   below 1 so errors can pull it down. Sources: `qiu2011time`,
   `khajah2016deep`; pyBKT supports it (`badrinath2021pybkt`). Cost: every
   single slip now moves the estimate a little.
2. **Watch for a run of surprises and reset** (already on the engine branch).
   A CUSUM alarm adds up how surprising each answer is and, once the total
   crosses a line, resets mastery. Sources: `page1954cusum`,
   `basseville1993detection`. A Bayesian alternative for the same job is
   online change-point detection, `adams2007bocpd`. Using it inside a learner
   model is our own step, so call it **Adapted**.
3. **Add a "recent performance" signal** (new candidate, not built). Keep BKT,
   but also feed the controller a short-memory score that weights the last
   few answers more than old ones. Sources: `galyardt2015recent` show recent
   answers predict the next one better than old ones (recent-performance
   factors analysis); it builds on `pavlik2009pfa`. In control terms, this is
   a second, faster sensor next to the slow one.

Also cite `beck2013wheel` (wheel-spinning) when explaining why long error
runs matter, and `booth2014persistent` / `kieran1981equality` for the
misconceptions that can cause them.

## 6. Controller settings: what a paper can and cannot back

**The PID structure is fully supported.** Proportional, integral and
derivative terms, an integral clamp against windup, and a low-pass filter on
the derivative are textbook practice: `astrom2006advanced`,
`astrom2008feedback`, `astrom1989windup`. Using feedback control to steer
software is supported by `hellerstein2004feedback`.

**The gain numbers cannot come from a published table.** The classic tuning
rules (`ziegler1942optimum`, `cohen1953retarded`, the AMIGO rules in
`astrom2004revisiting`, the SIMC rules in `skogestad2003simple`) all start
from a measured model of the plant: how strongly and how fast the process
responds when the controller output changes. They then give the gains as
formulas of that response. Our case breaks that starting point in two ways:

1. The "plant" is a learner, and no one has measured how a learner's mastery
   responds to a change in screen complexity.
2. In our simulation the screen does **not** change the simulated learner's
   answers (see `backend/closedloop/sim/learners.py`: answers are drawn once
   and replayed through every arm). So the controller is shaping a signal,
   not steering a process that answers back. A Ziegler-Nichols style rule has
   nothing to measure.

So quoting Ziegler-Nichols or similar for Kp = 1.25 etc. would be an
over-claim. A reviewer in control would catch it.

**What we can honestly do instead (recommended): tune with a documented
procedure.** This turns "hand-picked" into "reproducible", which is what
reviewers ask for:

1. Write down one cost to minimize, for example tracking error plus a penalty
   on screen jumps (jitter). Weighting error by time is the classic ITAE
   criterion from `graham1953itae`.
2. Search the gains (Kp, Ki, Kd, γ, the clamp) on a **tuning** cohort with its
   own random seed.
3. Report every result on a separate **test** cohort, so the tuning does not
   leak into the numbers.
4. Show a small sensitivity table: how the results change when each gain moves
   up or down by, say, 50%. If the results barely move, the exact numbers
   matter little, which is a strong point in the paper.

Then the paper says: "gains were selected by minimizing an ITAE-type cost on
a held-out tuning cohort [graham1953itae]; the controller structure follows
[astrom2006advanced]". That is honest and defensible.

| Setting | Can a paper back it? | What to write |
|---|---|---|
| PID form, integral clamp, filtered derivative | Yes | Cite `astrom2006advanced`, `astrom1989windup` |
| Kp, Ki, Kd | No published value fits | "Selected by the tuning procedure above" |
| Derivative filter γ = 0.10 | The **idea** of filtering is standard; the number is not | Tune with the gains. Note: γ = 0.10 averages the change in error over roughly the last 10 steps |
| Integral clamp 3.0 | The idea yes, the number no | Tune with the gains, or derive it from the range of the error signal and state the reasoning |
| Sigmoid slope k = 2.0 | No paper; it follows from our own maths (spec section 6.3) | Keep the derivation in the paper; it is ours. It must be redone for the 0.95 target |
| Hysteresis 0.06 | The idea yes (standard deadband), the number no | Tune, or tie it to the size of one complexity level (0.25) and say so |

**Effect of the 0.95 target on the controller (for the engine thread).** The
error formula divides by (1 − target) above the target. At 0.85 that is 0.15;
at 0.95 it is 0.05, so tiny changes in mastery above 0.95 now swing the error
three times harder. The slope k and the reachable-range check in spec section
6.3 were derived for 0.85 and need to be redone; the gains should be re-tuned
after the change anyway.

## 7. Screen-complexity formula (M_I): what a paper can and cannot back

M_I adds up three parts: how many things you can click or drag (ρ), how
abstract the tool is (α), and how deeply the layout is nested (δ).

**Each part has support:**

| Part | Why it should raise complexity | Sources |
|---|---|---|
| ρ: number of interactive elements | More things that must be handled together means more load ("element interactivity"); more choices means slower decisions; working memory holds only about four items at once; screen density is a classic complexity measure | `sweller2010element`, `chen2017element`, `hick1952rate`, `hyman1953stimulus`, `cowan2001magical`, `tullis1983formatting` |
| α: abstraction (balance scale → steps → symbols → graph) | Concrete first, then fade to abstract | `fyfe2014concreteness`, `vlassis2002balance`, `otten2019balance`. Putting the graph above symbols is still **ours** |
| δ: nesting depth | Deeper menus and page structures cost users more | `kiger1984depth`, `larson1998web` |
| Computing complexity automatically from the layout | Prior work scores interfaces from layout features, then checks the scores against human ratings | `tullis1983formatting`, `ngo2003modelling`, `miniukovich2014quantification`, `miniukovich2015computation`, `oulasvirta2018aim` |

**The weights 0.40 / 0.35 / 0.25 have no source.** The papers that combine
layout features (for example `miniukovich2015computation`) get their weights
by fitting to human ratings. We have no human ratings, so we cannot do that.
Options, best first:

1. **Use equal weights (1/3 each) and say why.** `dawes1979robust` shows that
   simple equal-weight sums hold up well when there is no data to fit
   weights; tuned-looking weights without data add false precision. This
   gives a citation for the choice itself.
2. **Keep 0.40 / 0.35 / 0.25, but add a sensitivity check:** rerun the
   benchmark with other weight sets (equal weights, and each part dropped in
   turn) and show the conclusions do not change.
3. **Future work:** fit the weights to ratings, or validate M_I against a
   cognitive-load questionnaire such as `leppink2013instrument`,
   `paas1992training` or `ayres2006subjective`. These need human participants,
   so they belong in Future work, not in this paper.

My advice: do 1 and 2 together. Equal weights with a citation, plus a short
table showing the results are the same with other weights.

**Honest wording for the paper:** "M_I is a proxy built from three features
that the literature links to load and visual complexity
[sweller2010element; tullis1983formatting; kiger1984depth]. It has not been
validated against measured cognitive load; that requires a user study."
