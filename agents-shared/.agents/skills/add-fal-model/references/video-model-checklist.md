# Video Model Registration Checklist

## Files to Modify

### 1. Enum — Add model ID(s)
**File**: `src/domain/ai/services/video-generation/video-generation-models.enum.ts`

```typescript
{ENUM_KEY} = 'fal-ai/{model-path}',
```

Also add to the appropriate category set if needed:
- `IMAGE_TO_VIDEO_MODELS` — if it's an I2V model
- `VIDEO_TO_VIDEO_MODELS` — if it's a V2V model
- `EFFECTS_MODELS` — if it's an effects model
- `FIRST_LAST_FRAME_MODELS` — if it uses first-last frame

Note: `TEXT_TO_VIDEO_MODELS` is computed automatically (excludes I2V, V2V, effects, first-last-frame).

### 2. Video Model Metadata
**File**: `src/domain/ai/services/video-generation/video-model-metadata.ts`

```typescript
[VideoGenerationModel.{ENUM_KEY}]: {
  type: '{type}', // 'text-to-video' | 'image-to-video' | 'video-to-video' | 'effects' | 'first-last-frame'
  displayName: '{Display Name}',
  supportedAspectRatios: ['16:9', '9:16', '1:1'], // from FAL docs
  durationConfig: { values: [5, 10], format: 'number' }, // or range: { min: 3, max: 15 }
  supportsAudio: true,
  supportsSeed: false,
  supportsNegativePrompt: false,
  supportsResolution: false,
  supportsStyle: false,
  // For I2V models:
  imageFieldName: 'image_url', // or 'start_image_url'
  imageConstraints: {
    maxFileSizeMB: 20,
    supportedFormats: ['jpg', 'jpeg', 'png', 'webp'],
  },
  // For end-frame support:
  supportsEndFrame: false,
  // For effects:
  requiresEffect: false,
  // For V2V:
  requiresVideoInput: false,
},
```

If the model supports end frames, also add to `END_FRAME_MODELS` Set.

### 3. Video Generation Service — Add injection + switch case
**File**: `src/infrastructure/services/ai/video-generation/video-generation.service.ts`

- Add `@inject(BaseFalVideoModel) private readonly {modelName}Model: BaseFalVideoModel` (or specific model class)
- Add `case VideoGenerationModel.{ENUM_KEY}: return this.{modelName}Model.generate(input)` to switch

Note: Video models typically use `BaseFalVideoModel` directly since video metadata drives parameter mapping.

### 4. Credit Costs
**File**: `src/config/credit-costs.ts`

- Add to `CREDIT_COSTS.video_generation`:
  ```typescript
  [VideoGenerationModelEnum.{ENUM_KEY}]: {calculated_credits},
  ```
- Add to `MODEL_PRICING_FALLBACK` only from official pricing:
  ```typescript
  [VideoGenerationModelEnum.{ENUM_KEY}]: { unitPrice: {documented_price_per_unit}, unit: '{documented_unit}' },
  ```
- Build the complete pricing shape for every reachable duration, resolution/quality, mode, and sound/audio state. Zero may be an explicit incomplete placeholder only while the model is inactive; every active combination must charge strictly positive credits.
- Never guess a sound/audio multiplier. If FAL does not document the sound surcharge/price, constrain sound off or keep the model inactive when sound cannot be excluded.
- Do not let unknown combinations fall through to a cheaper generic model fallback.

### 5. UI Model Metadata
**File**: `src/app/_components/ai/floating-prompt-input/model-config.ts`

- If new family, add to `ModelMetadata.family` union type
- Add entry:
  ```typescript
  {
    id: VideoGenerationModel.{ENUM_KEY},
    name: '{camelCaseName}',
    descriptionKey: '{camelCaseName}',
    category: 'video',
    family: '{family-name}',
    type: '{video-model-type}',
    supportsEndFrame: false,
  },
  ```

### 6. UI Settings
**File**: `src/app/_components/ai/floating-prompt-input/prompt-input-settings.tsx`

Video model settings are mostly **metadata-driven** (unlike image models which use family-based conditionals).
The UI reads `VideoModelMetadata` flags to decide what to render:
- `supportsResolution` → resolution buttons
- `supportsStyle` → style dropdown
- `supportsNegativePrompt` → negative prompt textarea
- `supportsAudio` → audio toggle
- `supportedAspectRatios` → aspect ratio buttons
- `durationConfig` → duration picker

So for most video models, setting the metadata correctly is sufficient. Only add custom UI blocks if the model has parameters not covered by existing metadata flags.

### 7. Translations
**File**: `messages/en-us/domains/ai/components.json`

Add model name and description translation keys.

### 8. Positive Pricing Coverage / Constraint Gate

Before adding active UI metadata or DI/service routing, add tests that prove:

1. each selectable duration × resolution/quality × mode × audio state maps to official pricing and `credits > 0`;
2. undocumented combinations are rejected or impossible to select;
3. duration/quality boundary values cannot undercharge;
4. sound on/off uses independently documented pricing—never an inferred multiplier; and
5. metadata constraints match API schema constraints; and
6. sensitivity mutations fail when `false`/`0` inputs are dropped, duration/quality changes do not change documented units, a price becomes zero/missing, or unknown sound is allowed.

Restore mutations and rerun green. If any reachable combination is zero, missing, guessed, or falls back, keep the model inactive.

## Duration Format Reference

| Format | Example Value | Sent to API |
|--------|--------------|-------------|
| `number` | `5` | `5` (number) |
| `string` | `5` | `"5"` (string) |
| `string-with-suffix` | `5` | `"5s"` (string) |
