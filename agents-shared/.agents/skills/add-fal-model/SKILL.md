---
name: add-fal-model
description: Register a new FAL.ai model (image or video) into the olhaminha.bio codebase. Use when the user says "add fal model", "add new model from fal", "register fal model", "/add-fal-model", or provides a FAL.ai model name/path to integrate. Handles domain interfaces, infrastructure model classes, pricing/credits, DI wiring, UI metadata, and FloatingInput settings UI.
---

# Add FAL.ai Model

## Workflow

### Step 1 — Research the model at FAL.ai

Fetch the model's documentation page to extract:
- **Input schema**: all parameters, their types, defaults, and which are required
- **Output schema**: response structure
- **Pricing**: USD cost per unit (per image, per megapixel, per second, per video)

Use live web research on `https://fal.ai/models/{model-path}` and/or `https://fal.ai/models/{model-path}/api` to get the schemas. Record the official URL and retrieval date. Prefer FAL's API schema/pricing over third-party summaries; if an accepted input or price modifier is undocumented, treat it as unknown.

### Step 2 — Determine model type and classify

| Type | Enum file | Checklist |
|------|-----------|-----------|
| Image generation | `image-generation-models.enum.ts` | [image-model-checklist.md](references/image-model-checklist.md) |
| Image edit | `image-generation-models.enum.ts` | [image-model-checklist.md](references/image-model-checklist.md) |
| Video (T2V/I2V/V2V/effects) | `video-generation-models.enum.ts` | [video-model-checklist.md](references/video-model-checklist.md) |

Read the appropriate checklist reference for the full file-by-file implementation guide.

### Step 3 — Build fail-closed pricing

```
CREDITS_PER_DOLLAR = 250
credits = Math.ceil(documentedUnitPrice_USD * documentedUnits * CREDITS_PER_DOLLAR)
```

Enumerate every pricing dimension the model accepts: endpoint/mode, image count or megapixels, duration, resolution/quality, and audio/sound on/off. Build the complete pricing shape before activation.

- Use `0` only as an explicit incomplete placeholder while the model remains unreachable. No reachable/active variant may resolve to zero, missing, `NaN`, or fallback pricing.
- Do not guess a sound/audio multiplier. If official pricing does not state the surcharge or separate unit price, keep sound-enabled variants disabled/constrained and leave the model inactive when sound cannot be excluded.
- Use only documented modifiers. Never infer one variant from another or copy a competitor/model-family ratio.
- Default examples always define `documentedUnits` explicitly:
  - **Image per item**: `documentedUnits = documentedDefaultImageCount`; `Math.ceil(unitPrice * documentedUnits * 250)`
  - **Image per megapixel**: `documentedUnits = documentedDefaultImageCount * documentedWidth * documentedHeight / 1_000_000`; never assume `1.05 MP`
  - **Video per second**: `documentedUnits = documentedDefaultDuration`; `Math.ceil(unitPrice * documentedUnits * 250)`

**Positive coverage/constraint gate:** before activation, prove with tests that every UI/API-reachable combination maps to a documented price and a strictly positive credit charge, and that every unknown combination is rejected or impossible to select. If the gate cannot be complete, do not add the model to active UI metadata/DI routing.

### Step 4 — Implement following the checklist

Follow the checklist from Step 2 exactly. Key rules:

1. **Input schema fidelity**: The domain interface MUST include ALL fields from the FAL.ai input schema (except `prompt`/`seed` which are in `IBaseImageGenerationInput`). Use TypeScript optional (`?`) for non-required fields.

2. **Output schema fidelity**: The domain output interface MUST include every documented field beyond `IBaseImageGenerationOutput` (images, timings, seed, requestId). Implement complete response mapping; never ship placeholder output shapes such as `images: []` or fabricated defaults merely to satisfy TypeScript.

3. **sanitizeInput**: Only forward fields the model actually accepts. Preserve valid `false` and `0` with a nullish check:
   ```typescript
   ...(rest.field != null && { field: rest.field })
   ```
   Do not use truthiness for optional booleans/numbers; it silently drops schema-valid boundary values.

4. **UI Settings**: For the model's unique parameters, add conditional rendering in `prompt-input-settings.tsx`:
   - If parameters match an existing family (guidance_scale, negative_prompt, etc.), add to existing condition
   - If truly new parameters, add new state in `model-context.tsx` + new UI block + wire to `generation-context.tsx`
   - Image models: conditional blocks use `effectiveFamily === '{family}'`
   - Video models: mostly metadata-driven (set flags in `VideoModelMetadata`)

5. **Translations**: Add keys to `messages/en-us/domains/ai/components.json` for model name, description, and any new setting labels.

6. **Activation last**: Keep enum/interface/pricing work unreachable until schema mapping, pricing coverage, constraints, and tests are complete. The final change that exposes UI metadata or DI/service routing must be gated by all-positive reachable pricing coverage.

### Step 5 — Verify before activation

Run focused tests for input sanitization, complete output mapping, each documented pricing dimension, positive credits for every reachable combination, and rejection/constraint of unknown combinations. Include sound on/off coverage when the API exposes sound; undocumented sound pricing must remain unreachable.

Require sensitivity examples/tests that prove the gate can fail: `false` and `0` survive sanitization, increasing image count/megapixels/duration changes credits by documented units, a deliberate zero/missing price fails activation, and an undocumented sound combination is rejected. Restore each mutation and rerun green.

Then run `bun run typecheck` and the relevant full test suite. Typecheck alone is not an activation gate.

## Naming Conventions

| Concept | Convention | Example |
|---------|-----------|---------|
| Enum key | `SCREAMING_SNAKE` | `NANO_BANANA_PRO` |
| Enum value | `'fal-ai/{path}'` | `'fal-ai/nano-banana-pro'` |
| Interface | `I{PascalCase}Input/Output` | `INanoBananaInput` |
| Model class | `{PascalCase}ImageModel` | `NanoBananaImageModel` |
| Interface file | `{kebab-case}.interface.ts` | `nano-banana.interface.ts` |
| Model class file | `{kebab-case}-image.model.ts` | `nano-banana-image.model.ts` |
| UI family | `'{kebab-case}'` | `'nano-banana'` |
| UI name | `camelCase` | `'nanoBananaPro'` |
| UI descriptionKey | `camelCase` | `'nanoBananaPro'` |
