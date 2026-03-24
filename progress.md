Original prompt: PLEASE IMPLEMENT THIS PLAN:
# Long-Horizon AI Upgrade for White Maybe Black

## Summary
- Treat this game as a logistics-and-conversion game, not a capture game. Good play means: create space from the full starting board, use stacks as temporary transport/control tools, freeze only when it blocks key lanes, and commit to either `homeField` dispersion or `sixStacks` conversion instead of mixing both every turn.
- Keep alpha-beta as the main search. In the current repo, local perf output already shows `hard` often ends opening searches at `completedDepth: 0`, so the next gain is not “more brute force” but `better node quality + better throughput + better long-range evaluation`.
- Use a staged hybrid. Phase 1 makes the current engine strategically competent and less loop-prone. Phase 2 adds an offline-trained policy/value model to give the engine a longer-horizon sense of which structures actually lead to wins.

## Phase 1: Strategic Alpha-Beta
- Normalize search scores to `side to move`, keep TT scores in the same orientation, and add `PVS + aspiration windows + quiescence`. Quiescence must resolve jump continuations, freeze/unfreeze swings, immediate `homeField` completions, immediate `sixStacks` completions, and forced rescue moves before static evaluation.
- Remove exact `getLegalActions()` mobility calls from every leaf. Replace them with one cached board-feature pass per hash; exact move generation stays at the root, in quiescence triggers, and in terminal-threat checks only.
- Replace the current flat evaluator with a phase-aware dual-plan evaluator. Compute `homePlanPotential`, `stackPlanPotential`, `laneOpenness`, `freezeTempo`, `transportValue`, `buriedOwnDebt`, and `conversionReadiness`, then choose `intent = home | sixStack | hybrid` from the board plus the last two own moves in history.
- Fix the current structural bias explicitly: a full owned height-3 stack gets the big completion bonus only on the actual front home row, never elsewhere; progress-to-home terms count every checker in a stack, not only the top checker.
- Tag every move with strategic families: `openLane`, `advanceMass`, `freezeBlock`, `rescue`, `frontBuild`, `captureControl`, `decompress`. Move ordering becomes `TT/PV > forced tactic > tactical > high plan score > history/killer > quiet`.
- Add anti-loop scoring: repetition penalty from `positionCounts`, self-undo penalty for restoring the same local pattern within 2 plies, and a novelty penalty when the AI repeats the same regional motif while a near-equal alternative exists.
- Hard mode becomes `strategic variety`. After search, keep up to 3 root moves within `max(60, 1.5% of |bestScore|)` of the best score, reject anything that fails a forced tactic, prefer candidates with different strategic tags, then sample with temperature `0.15`. Forced wins, only-move defenses, and losing-save draws stay deterministic.

## Phase 2: Learned Guidance
- Add an offline Python + PyTorch training pipeline and keep browser inference local through `onnxruntime-web`. If the model is missing or fails to load, the worker falls back to the phase-1 engine.
- Generate self-play data from the phase-1 engine with stochastic root choice for the first 8 plies, horizontal mirroring, and player-perspective normalization. Store `(state, maskedPolicyTarget, outcomeValue, strategicIntent)`.
- Encode each position as 16 planes on `6x6`: own active singles, own frozen singles, own top-on-height-2, own top-on-height-3, own buried depth-1, own buried depth-2, the same 6 planes for the opponent, plus `empty`, `own-home-mask`, `own-front-row-mask`, and `pending-jump-source`.
- Use a small residual CNN: 4 residual blocks, 32 channels, one policy head and one value head. The policy head outputs a fixed masked action space of `2736` logits: `36 manual-unfreeze`, `288 jump-direction`, `1152 adjacent-action`, `1260 friendly-transfer`. The value head outputs `[-1, 1]`.
- Use the model only as guidance: policy logits become move-order priors and root widening priors; value replaces the deepest quiet eval as a blend of `0.7 model / 0.3 heuristic` after quiescence.
- Re-run self-play after integration and iterate training twice. Do not switch to MCTS in this plan unless guided alpha-beta fails the opening-depth and self-play benchmarks.

## Public Interfaces
- Extend `AiDifficultyPreset` with `repetitionPenalty`, `selfUndoPenalty`, `varietyTopCount`, `varietyThreshold`, `varietyTemperature`, and `policyPriorWeight`.
- Extend `AiSearchResult` with `principalVariation`, `rootCandidates`, `diagnostics`, and `strategicIntent`.
- Each root candidate records `action`, `score`, `policyPrior`, `tags`, `intentDelta`, and `forced`.
- Keep the worker request shape unchanged except for the richer `AiSearchResult`; no new user-facing toggles in v1.

## Test Plan
- Add regression fixtures for the user’s loop patterns and assert the AI chooses a non-looping equal-or-better move.
- Add phase tests: opening positions must prefer decongestion; clear `homeField` positions must prefer dispersion over local stack churn; clear `sixStacks` positions must prefer front-row scaffolds and completion.
- Add parity and stability tests: odd/even depth agreement, timeout fallback, quiescence boundaries, TT reuse, repetition avoidance, and self-undo rejection.
- Add creativity tests: in stable non-tactical roots, hard mode must produce at least 2 distinct openings across repeated runs without dropping below the near-equal threshold; in forced tactical roots, hard mode stays deterministic.
- Add learned-model tests: legal-action masking, worker fallback when ONNX is unavailable, single-load model caching, and no main-thread regression.
- Acceptance targets: hard mode completes at least depth `1` on the current `initialState` and `afterOpening` perf fixtures, cuts voluntary two-ply repeats by at least `75%`, and scores at least `+15%` more wins than the current hard engine over a 200-game mirrored gauntlet.

## Assumptions And References
- Defaults chosen: browser-local inference, offline Python training allowed, hard mode favors strategic and human-like variety, and plan-switching is allowed only when the new intent clearly beats the old one.
- Best-practice conclusion: use variable-depth/quiescence before deeper brute force, use game-specific phase/intention features before adding randomness, and use self-play policy/value learning once terminal rewards are too far away for hand-tuned eval to stay reliable.
- References: [Kaindl 1983](https://www.ijcai.org/Proceedings/83-2/Papers/039.pdf), [Browne et al. 2012](https://repository.essex.ac.uk/4117/1/MCTS-Survey.pdf), [Chaslot et al. 2008](https://cris.maastrichtuniversity.nl/en/publications/progressive-strategies-for-monte-carlo-tree-search/), [Lanctot et al. 2014](https://arxiv.org/abs/1406.0486), [Tesauro 1992](https://research.ibm.com/publications/temporal-difference-learning-of-backgammon-strategy), [Tesauro 2002](https://bkgm.com/articles/tesauro/ProgrammingBackgammon.pdf), [Silver et al. 2017](https://arxiv.org/abs/1712.01815).

Notes:
- Current repo already has partial phase-1 work: quiescence, repetition/self-undo penalties, root candidate diagnostics, and default threefold draws in computer matches.
- Remaining implementation work is focused on richer strategic evaluation, strategic move tags/variety, learned-guidance scaffolding, and broader regression coverage.

Update 2026-03-12:
- Implemented a cached strategic analysis layer in `src/ai/strategy.ts` and rewrote `src/ai/evaluation.ts` to score `home` / `sixStack` / `hybrid` plans instead of exact leaf mobility.
- Extended move ordering with strategic tags, intent deltas, novelty penalties, and optional policy priors.
- Added PVS, aspiration re-search accounting, richer diagnostics, and strategic-intent/root-candidate reporting in the alpha-beta search.
- Added optional ONNX guidance plumbing:
  - TS action-space and board encoders in `src/ai/model/`
  - worker-side optional model loading with cheap asset probing before importing ONNX runtime
  - offline self-play dataset export script in `scripts/ai-selfplay-dataset.ts`
  - Python/PyTorch training scaffold in `training/`
- Added/updated regression coverage for:
  - strategic intent and richer preset/result contracts
  - model encoding/action mapping/fallback
  - hard-mode variety selection
  - existing AI/store integration and soak behavior

Verification:
- `npm run build`
- `npm run test:run -- src/ai/model.test.ts src/ai/search.behavior.test.ts src/ai/search.timeout.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run test:run -- src/ai/search.soak.test.ts`
- `npm run ai:selfplay -- --games=1 --max-turns=2 --out=output/training/test.jsonl`
- Browser smoke via local Playwright against `npm run preview -- --host 127.0.0.1 --port 4177`

Known limitation:
- The optional learned-guidance path is integrated as root policy guidance in the browser worker. The recursive search remains synchronous, so the ONNX value head is loaded and exposed in guidance results but is not yet queried at deep leaf nodes inside negamax/quiescence.

Update 2026-03-13:
- Implemented the checker-participation / anti-concentration pass:
  - new `src/ai/participation.ts` model rebuilt from recent same-side turns
  - participation-aware eval bonuses/penalties for fresh activation, wider frontier, idle-reserve release, and source-family reuse
  - participation deltas threaded through move ordering, negamax, quiescence, root candidates, and ordered timeout fallback
  - root variety now buckets near-equal candidates by `sourceFamily` before sampling
- Extended AI contracts and presets with participation knobs and diagnostics:
  - `participationBias`, `participationWindow`, `sourceReusePenalty`, `frontierWidthWeight`, `familyVarietyWeight`
  - result diagnostics now include `orderedFallbacks`, `participationPenalties`, and `sourceFamilyCollisions`
- Added/updated regression coverage:
  - `src/ai/search.behavior.test.ts`
  - `src/ai/search.timeout.test.ts`
  - `src/ai/search.variety.test.ts`
  - `src/app/store/createGameStore.ai.test.ts`
  - helper/report updates in `src/ai/test/metrics.ts` and `scripts/ai-variety.report.ts`

Verification 2026-03-13:
- `npm run build`
- `npm run test:run -- src/ai/search.behavior.test.ts src/ai/search.variety.test.ts src/ai/search.timeout.test.ts src/ai/model.test.ts src/app/store/createGameStore.ai.test.ts`
- Browser smoke on built preview (`vite preview`): computer game starts, first human move triggers a valid computer reply, and the worker returns `orderedRoot` fallback with diversified root candidates instead of failing

Current note:
- `npm run ai:variety -- --pairs=2 --max-turns=40` still exits non-zero because the checked-in baseline/target thresholds flag older variety issues (`stagnationWindowRate`, `decompressionSlope`, `twoPlyUndoRate`), but the new checker-concentration metrics are now present in the report:
  - easy: `sameFamilyQuietRepeatRate=0`, `sourceFamilyOpeningHhi=0.421875`
  - medium: `sameFamilyQuietRepeatRate=0.333333`, `sourceFamilyOpeningHhi=0.296875`
  - hard: `sameFamilyQuietRepeatRate=0.4`, `sourceFamilyOpeningHhi=0.296875`

Update 2026-03-13 (multijump follow-up, in progress):
- Implementing the rules change where a jump with further continuation keeps the same player on move until they switch to a non-jump move or the latest jump runs out of continuations.
- Plan is to keep `pendingJump` serialized as-is for compatibility, but reinterpret it as optional follow-up context and replace the store's forced jump preselection with a neutral follow-up interaction state.

Update 2026-03-13 (multijump follow-up, complete):
- Domain:
  - `pendingJump` now means an optional same-player follow-up window after a jump, not a forced same-source lock.
  - move generation and validation now allow any legal continued action during that window; only same-source continuation jumps reuse the stored visited jump-state keys.
  - a non-jump follow-up clears `pendingJump`, while a jump that still has continuation reopens it with the new landing source.
- Store/UI:
  - added neutral `jumpFollowUp` interaction copy/state instead of auto-selecting the jumper after the first jump.
  - cancel/rehydrate/boot now restore that neutral follow-up state, while `buildingJumpChain` remains only for picking the landing of the currently selected jump.
- Docs/help text:
  - updated rulebook, technical docs, glossary text, and AI/domain readmes to describe the continued-jump follow-up rule.
- Regression coverage:
  - domain tests now cover alternate-piece follow-up moves, continued jump chains beyond two jumps, and immediate win-on-jump behavior.
  - store tests now cover neutral follow-up state, pass only after switching away from jumps or exhausting them, hydration of saved `pendingJump` sessions, and AI auto-scheduling of repeated jump follow-ups.

Verification 2026-03-13:
- `npm run build`
- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/rules/gameEngine.session.test.ts src/app/store/createGameStore.history.test.ts src/app/store/createGameStore.ai.test.ts src/app/App.test.tsx src/app/rendering.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx`
- Manual Playwright smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - imported a valid saved session with an active `pendingJump`
  - UI showed the new neutral follow-up prompt (`jumpFollowUp`)
  - selected another checker, performed a non-jump follow-up move, and confirmed the turn handed off only after that second action
  - browser console showed only the pre-existing missing `favicon.ico` 404 on load

Correction 2026-03-13:
- The first multijump follow-up implementation still capped jump chaining after the second action because `applyValidatedAction()` only reopened `pendingJump` when no follow-up was already active.
- Fixed the reducer so every jump that lands with further continuation reopens `pendingJump`, even when the move already happened during a follow-up window.
- Updated docs and regressions to match the actual intended rule: the same player may keep jumping indefinitely while each latest jump still has continuations, and the turn ends only after a non-jump move or a jump with no continuation.

Verification 2026-03-13 (correction):
- `npm run build`
- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/app/store/createGameStore.history.test.ts src/app/store/createGameStore.ai.test.ts`
- Fixed a follow-up TypeScript issue in `src/app/store/createGameStore.history.test.ts` where repeated `store.getState()` calls prevented narrowing `interaction` to `jumpFollowUp`; this was breaking `tsc --noEmit` while Vitest still passed.
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - loaded a valid full-checker hot-seat session tailored to the repeated-jump scenario
  - executed `White: Jump A1 -> C3`, then `White: Jump A3 -> C5`
  - confirmed the UI still showed the neutral follow-up prompt and kept White on move after the second jump
  - executed the third jump `White: Jump C5 -> E3` and confirmed the turn only passed after that jump exhausted its continuations
  - the bundled `develop-web-game` Playwright client still cannot import `playwright` from its skill directory in this repo layout, so browser verification used the built-in Playwright MCP instead

Update 2026-03-13 (AI cold start + false ONNX detection):
- Tightened `src/ai/model/guidance.ts` so the optional model probe uses a ranged `GET`, rejects app-shell HTML responses by content type or prefix, and skips importing `onnxruntime-web` when the model asset is effectively missing.
- Added a per-worker cold-start watchdog buffer in `src/app/store/createGameStore/aiController.ts` so the first AI request can survive runtime/bootstrap latency while warm follow-up requests keep the shorter timeout.
- Added regression coverage in:
  - `src/ai/model.test.ts`
  - `src/app/store/createGameStore.ai.test.ts`

Verification 2026-03-13 (AI cold start + false ONNX detection):
- `npm run test:run -- src/ai/model.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run build`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - started a fresh `Play vs computer` game as Black on `Easy`
  - confirmed the first computer move completed and history advanced to `Total: 1`
  - confirmed no `/assets/ort.bundle...` or `/assets/ort-wasm...` requests were made when the model path resolved to the app shell instead of a real ONNX file
- Live deploy note:
  - `https://white-maybe-black.ks7-1498.workers.dev` still serves the pre-fix bundle, so the old failure mode remains there until redeploy

Update 2026-03-19 (Frozen jumps / AI pacing / follow-up UX):
- Domain and UI changes completed:
  - frozen singles can now always be jumped, and the jumped checker thaws regardless of owner
  - AI move chains now pause for `AI_MOVE_REVEAL_MS = 550` before scheduling the next computer request
  - the jump follow-up UI now uses a source highlight plus a dedicated callout instead of forced preselection
- Verification:
  - `npm run build`
  - `npm run lint`
  - `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/app/store/createGameStore.ai.test.ts src/app/App.test.tsx src/app/rendering.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx src/ai/search.behavior.test.ts`
  - Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
    - desktop hot-seat smoke proved `A1 -> C3 -> E5` can jump over frozen enemy singles and thaw them
    - compact computer smoke used a fake worker to prove the reveal pause between AI jump segments and captured the source-highlight follow-up state
- Notes:
  - the repo still contains legacy documentation note files in `docs/Documentation.md` and `docs/technical-spec.md`; they were left untouched by this change
  - no open follow-up tasks remain for the requested rule/UI update

Update 2026-03-23 (Perf harness late-game AI states):
- Added deterministic imported-session perf fixtures for `opening`, `turn50`, `turn100`, and `turn200`.
- `scripts/perf-report.mjs` now measures hard-AI replies on those imported states under the same mobile CPU profiles (`1x`, `4x`, `6x`) used by the weak-device harness.
- Updated `README.md` and `src/ai/README.md` so docs now mention root ordering precompute/rescore reuse plus the expanded perf-report coverage.

Update 2026-03-24 (Multi-jump revisit restriction):
- Replaced the old jump-loop guard that keyed on `(landing coord, board hash)` with explicit visited-landing tracking for the active jump chain.
- New rule behavior: during a multi-jump, a jumping piece may not land on any coordinate it has already occupied earlier in that same chain, even if the intervening jumps changed frozen states elsewhere on the board.
- `pendingJump` now stores `visitedCoords` for live/search states, while session guards still accept legacy `visitedStateKeys` payloads so older saves remain readable.
- Added a domain regression where a four-segment loop could previously revisit `C3` through a different route after changing other board cells; that revisit is now excluded while fresh continuation targets remain legal.

Verification 2026-03-24 (Multi-jump revisit restriction):
- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/rules/gameEngine.session.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run test:run`
- `npm run build`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - verified the app shell, board, history, and move sidebar render successfully after the rule change
  - browser console reported no errors

Correction 2026-03-24 (Multi-jump loop rule):
- Replaced the just-added visited-landing restriction with the intended rule: a multi-jump may revisit earlier landing cells, including the start, but it may not jump over the same checker twice in the same chain.
- `pendingJump` now stores `jumpedCheckerIds` as the live/search continuation payload.
- Legacy `visitedCoords` / `visitedStateKeys` payloads remain readable, and the jump helper reconstructs jumped-checker history from legacy landing sequences or from committed history when needed.
- Added regressions for:
  - returning to the initial cell through a different jumped checker;
  - revisiting an earlier landing through a different checker while still rejecting continuations that reuse an already-jumped checker.

Verification 2026-03-24 (Multi-jump checker-repeat rule):
- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/rules/gameEngine.session.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run build`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - the bundled `develop-web-game` Playwright client still cannot import `playwright` from its skill directory in this repo layout, so browser verification used Playwright MCP instead
  - verified the preview renders the board, selecting `Cell A3` updates the move sidebar, and browser console output remains clean
