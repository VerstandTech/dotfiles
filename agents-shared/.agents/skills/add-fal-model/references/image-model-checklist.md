# Image Model Registration Checklist

## Files to Create

### 1. Domain Interface
**Path**: `src/domain/ai/services/image-generation/models/{model-name}.interface.ts`

```typescript
import type {
  IBaseImageGenerationInput,
  IBaseImageGenerationOutput,
  ImageGenerationSize,
} from '../image-generation.service.interface'
import type { ImageGenerationModel } from '../image-generation-models.enum'

export interface I{ModelName}Input extends IBaseImageGenerationInput {
  model_id: ImageGenerationModel.{ENUM_KEY}
  // Add ALL fields from FAL.ai input schema (except prompt/seed which are in base)
  // Use optional (?) for non-required fields
}

export interface I{ModelName}Output extends IBaseImageGenerationOutput {
  // Add extra output fields from FAL.ai output schema
  // images/timings/seed/requestId are in base already
}
```

### 2. Infrastructure Model Class
**Path**: `src/infrastructure/services/ai/image-generation/models/{model-name}-image.model.ts`

```typescript
import { injectable } from 'tsyringe'
import type { I{ModelName}Input, I{ModelName}Output } from '@/domain/ai/services/image-generation/models/{model-name}.interface'
import { BaseFalImageModel } from './base-fal.model'

@injectable()
export class {ModelName}ImageModel extends BaseFalImageModel<I{ModelName}Input, I{ModelName}Output> {
  protected override sanitizeInput(input: I{ModelName}Input): Record<string, unknown> {
    const { model_id: _, ...rest } = input
    return {
      prompt: rest.prompt,
      // Map each optional field conditionally:
      // ...(rest.field_name != null && { field_name: rest.field_name }), // preserves false/0
    }
  }

  // Implement the BaseFalImageModel output hook using the current production
  // contract. Map every documented response field from real FAL data; do not
  // fabricate values or return `images: []` merely to satisfy the interface.
}
```

### 3. (If edit variant) Domain Edit Interface
**Path**: `src/domain/ai/services/image-generation/models/{model-name}-edit.interface.ts`

Same pattern but with `image_url` required and edit-specific fields.

### 4. (If edit variant) Infrastructure Edit Model Class
**Path**: `src/infrastructure/services/ai/image-generation/models/{model-name}-edit-image.model.ts`

Same pattern extending `BaseFalImageModel`.

## Files to Modify

### 5. Enum — Add model ID(s)
**File**: `src/domain/ai/services/image-generation/image-generation-models.enum.ts`

```typescript
// {Model Name}
{ENUM_KEY} = 'fal-ai/{model-path}',
// If edit variant:
{ENUM_KEY}_EDIT = 'fal-ai/{model-path}/edit',
```

### 6. Union Types — Add to input/output unions
**File**: `src/domain/ai/services/image-generation/image-generation.service.interface.ts`

- Add `import type { I{ModelName}Input, I{ModelName}Output } from './models/{model-name}.interface'`
- Add `| I{ModelName}Input` to `IImageGenerationInput` union
- Add `| I{ModelName}Output` to `IImageGenerationOutput` union

### 7. Generation Service — Add injection + switch case
**File**: `src/infrastructure/services/ai/image-generation/image-generation.service.ts`

- Add import for interface type and model class
- Add `@inject({ModelName}ImageModel) private readonly {modelName}Model: {ModelName}ImageModel` to constructor
- Add `case ImageGenerationModel.{ENUM_KEY}: return this.{modelName}Model.generate(input as I{ModelName}Input)` to switch

### 8. Credit Costs — Add pricing entries
**File**: `src/config/credit-costs.ts`

- Add to `CREDIT_COSTS.image_generation` using the documented default units—not a hardcoded one-image assumption:
  ```typescript
  const documentedDefaultUnits = pricingUnit === 'megapixel'
    ? documentedDefaultCount * documentedDefaultWidth * documentedDefaultHeight / 1_000_000
    : documentedDefaultCount
  [ImageGenerationModelEnum.{ENUM_KEY}]: Math.ceil(documentedUnitPrice * documentedDefaultUnits * CREDITS_PER_DOLLAR),
  ```
  Adapt to the repository's actual value shape, but preserve documented default count/dimensions/MP units explicitly.
- Add to `MODEL_PRICING_FALLBACK` only from official documented pricing:
  ```typescript
  [ImageGenerationModelEnum.{ENUM_KEY}]: { unitPrice: {documented_price_per_unit}, unit: '{unit}' },
  ```
- If edit variant, add to both `CREDIT_COSTS.image_edit` and `MODEL_PRICING_FALLBACK` too.
- Build the complete shape for every reachable count/size/quality/mode. Zero may mark an incomplete variant only while the model remains inactive; active variants must all calculate strictly positive credits.
- Unknown price dimensions must be constrained/rejected, never absorbed by a generic fallback.

### 9. UI Model Metadata
**File**: `src/app/_components/ai/floating-prompt-input/model-config.ts`

- If new family, add family string to `ModelMetadata.family` union type
- Add entry to `MODELS_METADATA`:
  ```typescript
  {
    id: ImageGenerationModel.{ENUM_KEY},
    name: '{camelCaseName}',
    descriptionKey: '{camelCaseName}',
    category: 'generation',
    family: '{family-name}',
  },
  ```

### 10. UI Settings — Add conditional rendering block
**File**: `src/app/_components/ai/floating-prompt-input/prompt-input-settings.tsx`

Add a conditional block for the new model family's unique parameters:
```tsx
{effectiveFamily === '{family-name}' && (
  <div className="space-y-6">
    {/* Render controls for each model-specific parameter */}
    {/* Use Slider for numeric ranges, Switch for booleans, buttons for enums */}
  </div>
)}
```

If the model shares parameters with an existing family (e.g., guidance_scale like nano-banana/flux),
add the family to the existing condition instead:
```tsx
{(effectiveFamily === 'nano-banana' || effectiveFamily === 'flux' || effectiveFamily === '{family-name}') && (
```

### 11. UI State Context — Add state variables (if new parameter types)
**File**: `src/app/_components/ai/floating-prompt-input/context/model-context.tsx`

Only needed if the model has parameters not already in the context. Existing parameters:
- `guidanceScale`, `inferenceSteps`, `negativePrompt`, `safetyChecker`
- `quality`, `style`, `strength`, `resolution`
- `webSearch`, `safetyTolerance`, `promptExpansion`, `background`, `inputFidelity`

If a new parameter is needed, add `useState` + expose via context.

### 12. UI Generation Context — Map params to submission
**File**: `src/app/_components/ai/floating-prompt-input/context/generation-context.tsx`

If new state variables were added, include them in the options object assembled during submission.

### 13. Translations
**File**: `messages/en-us/domains/ai/components.json`

Add translation keys for any new UI labels under `floatingPromptInput.settings`.

## Credit Calculation Formula

```
CREDITS_PER_DOLLAR = 250
credits = Math.ceil(unitPrice_USD * documentedUnits * CREDITS_PER_DOLLAR)
```

| Unit Type | `documentedUnits` |
|-----------|-------------------|
| `image` | documented image count |
| `megapixel` | image count × documented width × documented height ÷ 1,000,000 |
| `second` | documented duration seconds |
| `video` | documented video count |

The `CREDIT_COSTS` value must include every documented default pricing unit: default output count and, when applicable, each default width/height or documented megapixel quantity. Never substitute a one-output assumption for documented defaults.

## Activation Gate

Before adding the model to active UI metadata or DI/service routing, add focused tests that prove:

1. every reachable input/pricing combination has official evidence and charges `> 0` credits;
2. every unknown combination is rejected or impossible to select;
3. count, dimensions, and quality/mode boundaries cannot undercharge;
4. sanitization forwards only supported fields; and
5. output mapping contains the documented response shape without fabricated placeholders; and
6. focused sensitivity mutations fail when `false`/`0` are dropped, documented units change without a credit change, or pricing becomes zero/missing.

Restore mutations and rerun green. Typecheck without this positive coverage/constraint gate is insufficient.
