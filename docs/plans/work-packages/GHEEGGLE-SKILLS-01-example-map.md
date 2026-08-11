# GHEEGGLE-SKILLS-01 Example Map

## Story

Preserve the three locally installed Gheeggle workflow skills in version control so a fresh dotfiles installation retains their safety and validation contracts.

## Rules

### R1 — All approved skills are complete AI resources
- Each skill has canonical frontmatter, `SKILL.md`, and `agents/openai.yaml`.
- Skill names match their directory names.

Examples:
1. `add-linear-feature` is discoverable after checkout.
2. `qc-user-story-to-linear-issue` is discoverable after checkout.
3. `voyager-qc-task-implementation` is discoverable after checkout.

### R2 — Linear feature inventory edits remain validator-backed
- `add-linear-feature` retains its validator and focused tests.

Examples:
4. A valid `dataset/FEATURES.md` contract passes validation.
5. Invalid summary counts or duplicate Linear issues fail validation.

### R3 — QC issue writes require explicit approval
- The QC skill must require approval of the complete current draft before creating or updating Linear.
- UI and MCP coverage templates remain available.

Examples:
6. A draft cannot be created or updated before explicit approval.
7. Both UI and MCP coverage workflows have reference templates.

### R4 — Voyager task delivery remains provenance- and evidence-bound
- The Voyager skill preserves deterministic seed, paired mission, RewardKit, provenance, focused Harbor, and final-head CI requirements.

Examples:
8. A task cannot be called complete without layered validation and final-head evidence.

### R5 — Repository AI-resource validation remains green
- The repository validator recognizes all three skills.
- No generated Rulesync outputs are manually edited.

Examples:
9. `verify-ai-resources.py --repo` passes with the skills present.

## Questions

1. Should the two documentation-only skills gain executable project-specific fixture tests later?
2. Should skill installation migrate from copied directories to explicit Stow-managed links in a separate package-management change?
