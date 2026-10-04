# Paper

IEEE conference draft (IEEEtran). Build from this folder:

```
pdflatex closed-loop-genui && bibtex closed-loop-genui && pdflatex closed-loop-genui && pdflatex closed-loop-genui
```

References come from `../docs/references.bib`; see `../docs/source-check.md` for which claim each source supports.
Every number comes from `../results/`. Charts are regenerated with `python3 figures/make_figures.py`; the architecture diagram is TikZ (`figures/architecture.tex`); the two screens are cropped captures of the testbed client.
