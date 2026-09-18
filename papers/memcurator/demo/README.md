# MemCurator — interactive demo

Dependency-free static site. Plan/structure: `../brainstorm/DEMO.md`.

## Run

```bash
cd MemGuide/demo && python3 -m http.server 4180 --directory .
# open http://localhost:4180
```

Also works by opening `index.html` directly (data is a plain `<script>`, no fetch/CORS).

## Structure

One **scrolling page** with sections, plus one **tab**:

- **Overview** — narrative landing: what agentic memory is, the write-time problem,
  the read-time idea, an interactive timing slider (write → read → turn), a hero
  scoreboard, and "explore" cards.
- **Mechanisms** — animated pipeline (icons + a labelled token that flows along the
  active edge) for No-Memory / ReasoningBank / SkillOS / MemCurator / MemGuide, plus a
  "same-trajectory compare" showing one trace → fixed note vs task-adaptive payload.
- **Results** — grouped bars per benchmark × executor; SkillOS and MemCurator each shown
  with a frozen and an RL-trained curator; callouts + a drawer (transfer / efficiency /
  ablations).
- **Future work** — MemGuide (turn-level guidance), clearly badged WIP.
- **Live demo (tab)** — Trajectory Lab: step a recorded τ²-bench episode and watch what
  each method injects, and when.

## Files

- `index.html` — page shell (`#page-main` sections + `#page-lab`).
- `styles.css` — dark theme; timing accents violet=write / cyan=read / amber=turn.
- `app.js` — router + scrollspy, timing slider, pipeline + frame engine, compare mode,
  trajectory stepper, results charts. **No number lives here** — all data is in `data.js`.
- `data.js` — mechanism storyboards, results (draft Tables 1–2), one recorded τ² episode.

## Presenter aids

- Arrow keys step the Mechanisms / Lab; space plays the mechanism.
- Deep-links: `?m=<method>&f=<step>` (a specific mechanism step), `?compare=1`
  (same-trajectory compare), `?bench=<alfworld|webshop|tau2>` (a results view),
  and `#lab` / `#results` / etc. for sections.

## Notes

- Everything is **recorded/scripted** — no live model calls.
- Efficiency and ablation-SR cells are marked *preliminary* (still TODO in the draft).
