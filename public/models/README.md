# Model Artifact Slot

Place the exported ONNX guidance model here as `ai-policy-value.onnx`.

This directory is a deployment slot, not a source directory. The browser worker probes `/models/ai-policy-value.onnx` with a small ranged `GET`, loads it lazily through [`src/ai/model/guidance.ts`](../../src/ai/model/guidance.ts), and falls back to search-only play if the file is absent or unusable.

Important constraints:

- the runtime model is optional;
- policy priors are used for move ordering;
- `valueEstimate` is diagnostic only and is not injected into [`evaluateState()`](../../src/ai/evaluation.ts);
- the file is cached by the PWA runtime caching rule in [`vite.config.ts`](../../vite.config.ts).

To produce the artifact, follow [`training/README.md`](../../training/README.md).
