# Fix protocol

The counterpart to `docs/review.md`. The review is bounded; without a bound here the fixes become
the next round's findings, which is measurably what happens: fix commits touching four or more files
produced a finding in the following round every time, and fix commits that stayed inside the file
the finding named produced none.

- **One commit per finding**, touching only the files the finding names. A finding that cannot be
  fixed inside those files is a new candidate, not a bigger commit.
- **Fix the class, not the instance.** Before you commit a helper, a guard or a bound, grep every
  call site and wire all of them. Wiring two of three sites costs a whole round — the next reviewer
  finds the third.
- **Do not act on `DROPPED` items.** They were killed in writing. Reopening one re-litigates a
  decision the report already recorded.
- **Adding prose is not a fix.** A comment answering a finding about behaviour leaves the behaviour
  wrong, and the comment is more surface for the next round to read.
- **Anything you notice that is not in the report goes at the bottom of the report as a new
  candidate.** You do not fix it.

Then the gates: `npm run lint`, `npm run typecheck`, `npm run typecheck:test`, `npm run test`,
`npm run build`. Report what is still open, and stop — the next review is a separate action.
