# Performance Report

Generated: 2026-03-27T23:30:22.469Z

This file is a generated report artifact from `npm run perf:report`.
- Browser timings come from `scripts/perf-report.mjs` against a local `vite preview` build.
- Domain timings come from `scripts/domainPerformance.report.ts` and are merged into this summary.
- CPU throttle profiles use Chrome DevTools `Emulation.setCPUThrottlingRate` with `1x` meaning unthrottled, and `4x` / `6x` meaning progressively slower simulated devices.
- `GOOD`, `WARN`, and `BAD` in the summary are repository-specific guardrails encoded in `scripts/perf-report.mjs`, not universal SLAs.

## Summary
- [GOOD] Desktop FCP: 104ms
- [GOOD] Mobile FCP: 40ms
- [BAD] Desktop move dialog: 378.3ms
- [BAD] Mobile move dialog: 370.6ms
- [GOOD] Mobile hard AI opening: 1267.6ms
- [GOOD] Domain full action scan: 0.0975ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0051ms

## Load
- Desktop: FCP 104ms, LCP 344ms, load 64.2ms
- Mobile: FCP 40ms, LCP 168ms, load 20.8ms

## Render / UI
- Desktop DOM nodes: 419, checker nodes: 36
- Mobile DOM nodes: 349, checker nodes: 36
- Desktop move dialog open: 378.3ms
- Mobile move dialog open: 370.6ms
- Mobile tab switch: Info 54.6ms, History 58ms

## AI
- Mobile opening turn: easy 190.9ms, medium 467.9ms, hard 1267.6ms
- Mobile reply turn: easy 171.4ms, medium 457.8ms, hard 1257.2ms

## Weak Device (CPU Throttle)
- 4x: move dialog 366.6ms, hard opening 1296ms, hard reply 1290.9ms
- 6x: move dialog 415.1ms, hard opening 1320.5ms, hard reply 1307ms

## Late-Game AI (Hard)
- 1x: opening 1271.5ms, turn50 2764.5ms, turn100 1264.5ms, turn200 1289.2ms
- 4x: opening 1286.3ms, turn50 2840.7ms, turn100 1380.7ms, turn200 1483.8ms
- 6x: opening 1324.7ms, turn50 2902.5ms, turn100 1451.9ms, turn200 1566.8ms

## Domain
- hashPosition avg: 0.0051ms
- getLegalActions avg: 0.0975ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.0946ms
- hasLegalAction check avg: 0.0065ms
- Cell-vs-full action speedup: 487.5x
- Hash-vs-full action speedup: 19.12x

## Root Ordering Cache Benchmark
- opening: baseline 109.7769ms, optimized 18.6766ms, gain 91.1003ms (82.99%)
- turn50: baseline 81.3076ms, optimized 13.5154ms, gain 67.7921ms (83.38%)
- turn100: baseline 86.8372ms, optimized 14.4918ms, gain 72.3454ms (83.31%)
- turn200: baseline 84.3975ms, optimized 14.1692ms, gain 70.2283ms (83.21%)
