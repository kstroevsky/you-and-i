# Performance Report

Generated: 2026-03-23T23:05:38.635Z

## Summary
- [GOOD] Desktop FCP: 100ms
- [GOOD] Mobile FCP: 44ms
- [BAD] Desktop move dialog: 373.4ms
- [BAD] Mobile move dialog: 335.9ms
- [GOOD] Mobile hard AI opening: 1274.1ms
- [GOOD] Domain full action scan: 0.2208ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0051ms

## Load
- Desktop: FCP 100ms, LCP 100ms, load 59.7ms
- Mobile: FCP 44ms, LCP 192ms, load 22.4ms

## Render / UI
- Desktop DOM nodes: 421, checker nodes: 36
- Mobile DOM nodes: 351, checker nodes: 36
- Desktop move dialog open: 373.4ms
- Mobile move dialog open: 335.9ms
- Mobile tab switch: Info 54.2ms, History 57.7ms

## AI
- Mobile opening turn: easy 198ms, medium 456.1ms, hard 1274.1ms
- Mobile reply turn: easy 189.5ms, medium 463.3ms, hard 1263.2ms

## Weak Device (CPU Throttle)
- 4x: move dialog 390.6ms, hard opening 1313.7ms, hard reply 1311.8ms
- 6x: move dialog 427.9ms, hard opening 1356.1ms, hard reply 1344.4ms

## Late-Game AI (Hard)
- 1x: opening 1261.3ms, turn50 1261.6ms, turn100 1274ms, turn200 1294.3ms
- 4x: opening 1353.8ms, turn50 1364.9ms, turn100 1422.3ms, turn200 1505.6ms
- 6x: opening 1382.7ms, turn50 1435.4ms, turn100 1466.5ms, turn200 1636.6ms

## Domain
- hashPosition avg: 0.0051ms
- getLegalActions avg: 0.2208ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.1967ms
- hasLegalAction check avg: 0.0297ms
- Cell-vs-full action speedup: 1104x
- Hash-vs-full action speedup: 43.29x

## Root Ordering Cache Benchmark
- opening: baseline 204.1767ms, optimized 33.3502ms, gain 170.8265ms (83.67%)
- turn50: baseline 150.8835ms, optimized 25.1693ms, gain 125.7141ms (83.32%)
- turn100: baseline 142.5852ms, optimized 22.9099ms, gain 119.6754ms (83.93%)
- turn200: baseline 137.5792ms, optimized 23.5366ms, gain 114.0426ms (82.89%)

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
