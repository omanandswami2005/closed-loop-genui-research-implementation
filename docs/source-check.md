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
| Setpoint 0.85 row | Correct as written. One warning: do not cite the "85% rule" (`wilson2019eighty`) as support. That paper is about the best **accuracy rate during training** (about 85% correct), not a **mastery probability** threshold. Mention it only as a loose analogy, if at all. | No change. |
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

- PID gains Kp = 1.25, Ki = 0.10, Kd = 0.35; filter γ = 0.10; integral clamp 3.0; slope k = 2.0; hysteresis 0.06; setpoint P* = 0.85.
- BKT defaults P(L0) = 0.15, P(T) = 0.12, P(G) = 0.20, P(S) = 0.08. The spec calls these "standard calibrated priors". They are not from any published fit; change that wording.
- M_I weights 0.40 / 0.35 / 0.25, the bounds ρ ∈ [1, 8] and δ ∈ [1, 4], and the α ordering 1 to 4.
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

After about 40 correct answers the number becomes exactly 1.0 in floating
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
