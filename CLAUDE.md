# Timeline — notes for future sessions

Read `../apps-shared/CHANGELOG.md` first, then `best-practices.md` and
`css-best-practices.md` there. Say "sync shared" to have those re-applied here.

## Non-negotiables

- **Never use `Date` for storage or arithmetic in `src/time/` or `src/model/`.**
  It caps at ±273,790 years and fails silently. Integer days only. The one place
  a `Date` is read is `todayDay()`.
- **Don't change the tick ladder without re-running `ladder.test.ts`.** The
  55–200px band ratio (3.64) must stay above the largest adjacent-rung ratio
  (3.5). Break that and spacing oscillates.
- **Rows are a view, never a property of an event.** If a change makes display
  state live on the event, it's the wrong change.
- `src/time/` and `src/render/` must stay DOM-free and separately testable.

## Commands

```bash
npm run dev · npm test · npm run build
node scripts/build-corpus.mjs   # after editing scripts/corpus-source.mjs
```

## Spec

Section numbers in code comments (§3.3, §5.2, §9.3 …) refer to the v1 technical
specification, which was supplied in chat and is **not stored in this repo**.
The README paraphrases its load-bearing decisions; the initial commit message
summarises the rest. If a §-reference needs resolving, ask for the spec.

## Deployment

Repo is `alexkrewson/timeline2` (public), deployed to
https://alexkrewson.github.io/timeline2/ on push to `main`. `base` in
`vite.config.ts` must match the repo name or the deployed page is blank.
The local directory is still named `timeline` — that mismatch is cosmetic.
