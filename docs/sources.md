# Sources for every design choice

Each row says where a choice in `backend/closedloop` comes from. **Cited** means a
published source supports it directly. **Adapted** means the idea comes from the
cited work, but we apply it in a new setting. **Assumption** means we chose the
value ourselves; the paper must state it as a design parameter, not as a fact.

## Learner model (BKT)

| Choice | Status | Source |
|---|---|---|
| Two-state BKT update (posterior + learning transition) | Cited | Corbett & Anderson 1995 [1] |
| Priors P(L0)=0.15, P(T)=0.12, P(G)=0.20, P(S)=0.08 | Assumption, within published bounds | Guess < 0.3 and slip < 0.1 are the usual non-degenerate bounds [1][2]; P(G)+P(S) < 1 makes BKT identifiable [3]. Values are not fitted to data. pyBKT [4] can fit them to ASSISTments logs later |
| Per-learner parameter variation | Cited | Individualized BKT priors and learning rates [5] |
| Forgetting transition P(F) | Cited | BKT+Forgets: Qiu et al. 2011 [6]; Khajah et al. 2016 [7] |
| Saturation after success runs (the "5 wrong answers" problem) | Cited | Overconfidence of BKT predictions is what [6] and [7] correct with forgetting |
| CUSUM lapse detector on the tracker (our extension) | Adapted | CUSUM change detection: Page 1954 [8], Basseville & Nikiforov 1993 [9]. Applying it to reset a BKT estimate inside a UI control loop is our contribution |
| Lapse detector threshold h = 6.5 | Assumption | Chosen from the sensitivity sweep in `results/benchmark/lapse_sensitivity.csv` |

## Simulated learners

| Choice | Status | Source |
|---|---|---|
| Synthetic learners sampled from a BKT model (Monte Carlo) | Cited | Simulated data from BKT is standard for evaluating mastery policies: Fancsali, Nixon & Ritter 2013 [10]; Pelánek 2017 [11] |
| Three archetypes (novice, inconsistent, fast) and their ranges | Assumption | Values from `start-here.md`, centered on the spec's numbers; not fitted |
| Lapse cohort with true forgetting 0.02 to 0.06 per item | Assumption | Motivated by forgetting effects found in [6] and [7]; the range is ours |
| Paired design (same responses through every arm) | Assumption | Standard variance reduction (common random numbers); no learning-gain claims |

## Controller

| Choice | Status | Source |
|---|---|---|
| Discrete PID, anti-windup clamp, filtered derivative | Cited | Åström & Hägglund 2006 [12]; Åström & Murray 2008 [13] |
| Gains Kp=1.25, Ki=0.10, Kd=0.35, γ=0.10, S_max=3 | Assumption | From `start-here.md`; hand-tuned, not derived |
| Hysteresis deadband against the last committed value | Cited | Standard relay-with-hysteresis practice [13] |
| Setpoint P* = 0.85 | Assumption | The classic mastery threshold is 0.95 [1]; 0.85 is a spec choice and should be stated as such |
| Level slew limit (one level per step) | Adapted | Rate limiting is standard in control [12]; using it against level skips is ours |

## Interface and pedagogy

| Choice | Status | Source |
|---|---|---|
| Fewer elements and more guidance for novices, less for experts | Cited | Cognitive load theory: Sweller 1988 [14]; expertise reversal effect: Kalyuga et al. 2003 [15] |
| Worked examples that fade into problem solving | Cited | Renkl & Atkinson 2003 [16] |
| Scaffolding concept | Cited | Wood, Bruner & Ross 1976 [17] |
| Balance-scale model for linear equations | Cited, with a caveat | Vlassis 2002 [18] reports the balance model helps, but students then struggle with negative numbers. Cite it as a known limitation too |
| Structural complexity metric M_I (density, abstraction, depth; weights 0.40/0.35/0.25) | Assumption | Our own composite. Miniukovich & De Angeli 2014 [19] quantify *visual* complexity of GUIs; cite as related work, not as the source of M_I |
| ε = 0.05 tolerance | Assumption | Our choice |

## Generation and safety

| Choice | Status | Source |
|---|---|---|
| Model emits JSON constrained by a schema | Cited | Constrained/guided generation: Willard & Louf 2023 [20] |
| Schema check plus deterministic fallback template | Assumption | Our design |
| Surrogate plant fault rates (15% off-budget, 3% malformed) | Assumption | Placeholders until measured on real Gemini output |

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
