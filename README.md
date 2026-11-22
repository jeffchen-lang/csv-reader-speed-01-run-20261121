# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/jeffchen-lang/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/jeffchen-lang/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0 — a single-pass, slice-based CSV reader in `solve.js` (ES module, no dependencies) that returns exactly csv-reader 1.0.0's `{columns, rows, errors}` for every input, including its whole broken-row policy (BOM, stray CRs, quote junk, unterminated quotes, short/long rows, blank lines). `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each one alone with `run`, and writes `/output/answers.json`.

## How it is fast

- Unquoted fields are taken as slices, never built a character at a time.
- A whole line with no quote and no stray CR is split natively in one go.
- Quoted fields are located with `indexOf`; doubled quotes and line breaks inside quotes are resolved on the slice, not per character.
- Only the rare broken rows (a stray CR inside a field, junk after a closing quote, a quote that never closes) fall back to segment assembly.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<cases-dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Entry

Built for the make.fun bounty [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121).
