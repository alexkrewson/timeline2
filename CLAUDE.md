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

The full v1 specification lives in the repo's initial commit message and the
README. Section numbers referenced in code comments (§3.3, §5.2, §9.3 …) point
at that spec.
