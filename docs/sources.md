# Sources for every design choice

Each row says where a choice in `backend/closedloop` comes from. **Cited** means a
published source supports it directly. **Adapted** means the idea comes from the
cited work, but we apply it in a new setting. **Assumption** means we chose the
value ourselves; the paper must state it as a design parameter, not as a fact.

## Learner model (BKT)

| Choice | Status | Source |
|---|---|---|
| Two-state BKT update (posterior + learning transition) | Cited | Corbett & Anderson 1995 [1] |
| Priors P(L0)=0.15, P(T)=0.12, P(G)=0.20, P(S)=0.08 | Assumption, within published bounds | Corbett & Anderson bound guess < 0.3 and slip < 0.1 [1]; Baker et al. use the looser guess, slip < 0.5 [2]; both are compared in [23]. P(G)+P(S) < 1 and P(T) < 1 − P(S)/(1 − P(G)) keep the model non-degenerate [21, Eqs. 15–16]; see also [3]. Values are not fitted to data. pyBKT [4] can fit them to ASSISTments logs later |
| Per-learner parameter variation | Cited | Individualized priors [5]; individualized learning rates [22] |
| Forgetting transition P(F) | Cited | BKT+Forgets: Qiu et al. 2011 [6]; Khajah et al. 2016 [7] |
| Saturation after success runs (the "5 wrong answers" problem) | Cited (cause); Adapted (fix) | Under correct answers the BKT estimate converges to a stable fixed point at 1 [21, Sec. 4]. Forgetting was introduced for recency effects [7] and time between sessions [6]; using it against saturation is our application. In float64 plain BKT reaches exactly 1.0 after 24 straight correct answers and then can never decrease (`backend/tests/test_bkt.py`) |
| CUSUM lapse detector on the tracker (our extension) | Adapted | CUSUM change detection: Page 1954 [8], Basseville & Nikiforov 1993 [9]. Applying it to reset a BKT estimate inside a UI control loop is our contribution |
| Lapse detector threshold h = 6.5 | Assumption, tested | About three straight errors from a saturated estimate; the sweep in `results/benchmark/lapse_sensitivity.csv` shows the trade-off for h = 3 to 12 |

## Simulated learners

| Choice | Status | Source |
|---|---|---|
| Synthetic learners sampled from a BKT model (Monte Carlo) | Cited | Simulated students for testing designs [24]; review of simulated learners [25]; BKT-generated data for evaluating mastery assessment [10], [23] |
| Three archetypes (novice, inconsistent, fast) and their ranges | Assumption | Values from `start-here.md`, centered on the spec's numbers; not fitted. All ranges satisfy [21] and the 0.5 bound of [2], but the novice slip (0.20–0.30) and guesser guess/slip (up to 0.40/0.30) deliberately exceed the 0.3/0.1 bound of [1] |
| Lapse cohort with true forgetting 0.02 to 0.06 per item | Assumption | Motivated by forgetting effects found in [6] and [7]; the range is ours |
| Paired design (same responses through every arm) | Assumption | Standard variance reduction (common random numbers); no learning-gain claims |

## Controller

| Choice | Status | Source |
|---|---|---|
| Discrete PID, anti-windup clamp, filtered derivative | Cited | Åström & Hägglund 2006 [12]; Åström & Murray 2008 [13] |
| Kp=0.865, Ki=0.377, Kd=0.672, γ=0.398, S_max=1.253, hysteresis 0.141 | Tuned by a stated procedure | No paper can give gains for a new plant [12]. `closedloop.sim.tune search`: cost = ITAE-style time-weighted mismatch [35] between the shown level and the learner's true state + 1 × jitter; random search over 200 settings plus the spec's values on a tuning cohort (seed 20261004); slope k = ln(19)/(Kp + Ki·S_max) = 2.202. All reported numbers use the test cohort (seed 20261003). Cost surface is flat: 0.104 vs 0.110 for the spec values (rank 22 of 201). Procedure, space and chosen values: `results/tuning/tuning.json`, `search.csv`; ±50% per parameter: `parameter_sensitivity.csv` |
| Hysteresis deadband against the last committed value | Adapted | A standard deadband against chattering (general practice; no specific page in [12], [13] is claimed). Its width is tuned as above |
| Setpoint P* = 0.95 (changed from 0.85 on 2026-10-03) | Cited | The standard BKT mastery threshold [1]; called "the widely adopted threshold" in [26] |
| Level slew limit (one level per step) | Adapted | Rate limiting is standard in control [12]; using it against level skips is ours |

## Interface and pedagogy

| Choice | Status | Source |
|---|---|---|
| Fewer elements and more guidance for novices, less for experts | Cited | Cognitive load theory: Sweller 1988 [14]; expertise reversal effect: Kalyuga et al. 2003 [15] |
| Worked examples that fade into problem solving | Cited | Renkl & Atkinson 2003 [16] |
| Scaffolding concept | Cited | Wood, Bruner & Ross 1976 [17] |
| Balance-scale model for linear equations | Cited, with a caveat | Vlassis 2002 [18] reports the balance model helps, but students then struggle with negative numbers. Cite it as a known limitation too |
| M_I term 1: number of interactive elements | Cited | Element interactivity drives cognitive load [29]; decision time grows with the number of choices [30]; element counts are standard UI complexity metrics [31], [19] |
| M_I term 2: abstraction scale (balance scale → operation pad → symbols → graph) | Cited | Concreteness fading: start concrete, fade to abstract [32] |
| M_I term 3: nesting depth | Cited | Deeper interface hierarchies cost more navigation and memory [33] |
| M_I as a weighted sum of the three | Adapted | Our composite; prior layout-complexity metrics are weighted feature sums checked against human ratings [19] |
| M_I weights: equal (1/3 each) | Cited (method), tested | No data exist to fit the weights, so the terms are weighted equally, the standard default for an unfitted linear composite [34]. `results/tuning/weight_sensitivity.csv` re-runs the main arms under the spec's original 0.40 / 0.35 / 0.25, each term dropped in turn, and density-, abstraction- and depth-heavy weights |
| ε = 0.05 tolerance | Assumption | Our choice |

## Generation and safety

| Choice | Status | Source |
|---|---|---|
| Model emits JSON constrained by a schema | Adapted | Token-level constrained decoding: [20], [27]; reliability of schema-constrained output: [28]. Our engine checks output after generation and falls back, which is a different mechanism |
| Schema check plus deterministic fallback template | Assumption | Our design |
| Surrogate plant fault rates (15% off-budget, 3% malformed) | Placeholder | Development only. The paper's numbers will use rates measured on real Gemini output |

## References

1. A. T. Corbett and J. R. Anderson, "Knowledge tracing: Modeling the acquisition of procedural knowledge," *User Modeling and User-Adapted Interaction*, vol. 4, no. 4, pp. 253–278, 1995.
2. R. S. J. d. Baker, A. T. Corbett, and V. Aleven, "More accurate student modeling through contextual estimation of slip and guess probabilities in Bayesian knowledge tracing," in *Proc. ITS*, 2008, pp. 406–415.
3. S. Doroudi and E. Brunskill, "The misidentified identifiability problem of Bayesian knowledge tracing," in *Proc. EDM*, 2017.
4. A. Badrinath, F. Wang, and Z. Pardos, "pyBKT: An accessible Python library of Bayesian knowledge tracing models," in *Proc. EDM*, 2021. arXiv:2105.00385.
5. Z. A. Pardos and N. T. Heffernan, "Modeling individualization in a Bayesian networks implementation of knowledge tracing," in *Proc. UMAP*, 2010, pp. 255–266.
6. Y. Qiu, Y. Qi, H. Lu, Z. A. Pardos, and N. T. Heffernan, "Does time matter? Modeling the effect of time with Bayesian knowledge tracing," in *Proc. EDM*, 2011.
7. M. Khajah, R. V. Lindsey, and M. C. Mozer, "How deep is knowledge tracing?" in *Proc. EDM*, 2016. arXiv:1604.02416.
8. E. S. Page, "Continuous inspection schemes," *Biometrika*, vol. 41, no. 1/2, pp. 100–115, 1954.
9. M. Basseville and I. V. Nikiforov, *Detection of Abrupt Changes: Theory and Application*. Prentice Hall, 1993.
10. S. E. Fancsali, T. Nixon, and S. Ritter, "Optimal and worst-case performance of mastery learning assessment with Bayesian knowledge tracing," in *Proc. EDM*, 2013.
11. R. Pelánek, "Bayesian knowledge tracing, logistic models, and beyond: An overview of learner modeling techniques," *User Modeling and User-Adapted Interaction*, vol. 27, pp. 313–350, 2017.
12. K. J. Åström and T. Hägglund, *Advanced PID Control*. ISA, 2006.
13. K. J. Åström and R. M. Murray, *Feedback Systems: An Introduction for Scientists and Engineers*. Princeton University Press, 2008.
14. J. Sweller, "Cognitive load during problem solving: Effects on learning," *Cognitive Science*, vol. 12, no. 2, pp. 257–285, 1988.
15. S. Kalyuga, P. Ayres, P. Chandler, and J. Sweller, "The expertise reversal effect," *Educational Psychologist*, vol. 38, no. 1, pp. 23–31, 2003.
16. A. Renkl and R. K. Atkinson, "Structuring the transition from example study to problem solving in cognitive skill acquisition: A cognitive load perspective," *Educational Psychologist*, vol. 38, no. 1, pp. 15–22, 2003.
17. D. Wood, J. S. Bruner, and G. Ross, "The role of tutoring in problem solving," *Journal of Child Psychology and Psychiatry*, vol. 17, no. 2, pp. 89–100, 1976.
18. J. Vlassis, "The balance model: Hindrance or support for the solving of linear equations with one unknown," *Educational Studies in Mathematics*, vol. 49, pp. 341–359, 2002.
19. A. Miniukovich and A. De Angeli, "Quantification of interface visual complexity," in *Proc. AVI*, 2014, pp. 153–160.
20. B. T. Willard and R. Louf, "Efficient guided generation for large language models," arXiv:2307.09702, 2023.
21. B. van de Sande, "Properties of the Bayesian knowledge tracing model," *Journal of Educational Data Mining*, vol. 5, no. 2, pp. 1–10, 2013.
22. M. V. Yudelson, K. R. Koedinger, and G. J. Gordon, "Individualized Bayesian knowledge tracing models," in *Proc. AIED*, 2013, pp. 171–180.
23. S. Slater and R. S. Baker, "Degree of error in Bayesian knowledge tracing estimates from differences in sample sizes," *Behaviormetrika*, vol. 45, no. 2, pp. 475–493, 2018.
24. K. VanLehn, S. Ohlsson, and R. Nason, "Applications of simulated students: An exploration," *Journal of Artificial Intelligence in Education*, vol. 5, 1994.
25. T. Käser and G. Alexandron, "Simulated learners in educational technology: A systematic literature review and a Turing-like test," *International Journal of Artificial Intelligence in Education*, vol. 34, no. 2, pp. 545–585, 2024.
26. J. Zhang, K. Vanacore, R. S. Baker, N. Ch, C. Mills, and O. Henkel, "How much mastery is enough mastery? The relationship between mastery in a lesson and the performance on the subsequent lesson," in *Proc. EDM*, 2025.
27. S. Geng, M. Josifoski, M. Peyrard, and R. West, "Grammar-constrained decoding for structured NLP tasks without finetuning," in *Proc. EMNLP*, 2023, pp. 10932–10952.
28. S. Geng et al., "JSONSchemaBench: A rigorous benchmark of structured outputs for language models," arXiv:2501.10868, 2025.
29. J. Sweller, "Element interactivity and intrinsic, extraneous, and germane cognitive load," *Educational Psychology Review*, vol. 22, pp. 123–138, 2010.
30. W. E. Hick, "On the rate of gain of information," *Quarterly Journal of Experimental Psychology*, vol. 4, no. 1, pp. 11–26, 1952.
31. A. Riegler and C. Holzmann, "Measuring visual user interface complexity of mobile applications with metrics," *Interacting with Computers*, vol. 30, no. 3, pp. 207–223, 2018.
32. E. R. Fyfe, N. M. McNeil, J. Y. Son, and R. L. Goldstone, "Concreteness fading in mathematics and science instruction: A systematic review," *Educational Psychology Review*, vol. 26, pp. 9–25, 2014.
33. J. I. Kiger, "The depth/breadth trade-off in the design of menu-driven user interfaces," *International Journal of Man-Machine Studies*, vol. 20, pp. 201–213, 1984.
34. R. M. Dawes, "The robust beauty of improper linear models in decision making," *American Psychologist*, vol. 34, no. 7, pp. 571–582, 1979.
35. D. Graham and R. C. Lathrop, "The synthesis of 'optimum' transient response: Criteria and standard forms," *Transactions of the AIEE, Part II: Applications and Industry*, 1953, doi:10.1109/TAI.1953.6371346 (`graham1953itae`).

Entries 1–28, with DOIs, are also in `docs/references.bib` (29–34 still to be added there); the check behind each correction is in `docs/source-check.md`.
