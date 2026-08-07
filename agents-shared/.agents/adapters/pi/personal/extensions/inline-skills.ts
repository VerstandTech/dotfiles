/**
 * Inline skills — invoke a skill anywhere in the prompt, with autocomplete.
 *
 * Why `$`?
 *   Pi’s editor only auto-opens `/` completions at the *start of the message*,
 *   and hard-skips `/` as a custom triggerCharacter. `$` is a valid trigger, so
 *   mid-prompt `$` opens the skill dropdown. Choosing an item inserts
 *   `/skill:name` (canonical form).
 *
 * Also supported:
 *   - mid-line `/skill:…` (Tab completes; expands on submit)
 *   - `@skill:…` (uses built-in `@` trigger; does not steal `@path`)
 *   - bare `$name` expands on submit when `name` is a known skill
 *   - submit-time expansion of `/skill:name`, `$skill:name`, `@skill:name`
 */
import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import {
	applyTokenCompletion,
	expandInlineSkills,
	extractInlineSkillToken,
	filterSkills,
	skillsFromCommands,
	stripSkillFrontmatter,
	type SkillRef,
} from "../lib/inline-skill/inline-skill.ts";

function loadSkills(pi: ExtensionAPI): SkillRef[] {
	try {
		return skillsFromCommands(pi.getCommands());
	} catch {
		return [];
	}
}

function skillsByName(skills: SkillRef[]): Map<string, SkillRef> {
	return new Map(skills.map((s) => [s.name, s]));
}

function readSkillBody(skill: SkillRef): string | null {
	try {
		const raw = readFileSync(skill.filePath, "utf-8");
		return stripSkillFrontmatter(raw).trim();
	} catch {
		return null;
	}
}

function createInlineSkillProvider(
	current: AutocompleteProvider,
	getSkills: () => SkillRef[],
): AutocompleteProvider {
	return {
		triggerCharacters: ["$", ...(current.triggerCharacters ?? [])],

		async getSuggestions(
			lines,
			cursorLine,
			cursorCol,
			options,
		): Promise<AutocompleteSuggestions | null> {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);
			const token = extractInlineSkillToken(before);

			if (!token) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const skills = getSkills();
			if (options.signal.aborted || skills.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const items = filterSkills(skills, token.nameQuery) as AutocompleteItem[];
			if (items.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return {
				items,
				prefix: token.prefix,
			};
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);
			const token = extractInlineSkillToken(before);
			// Single source of truth: only apply when the live token matches prefix
			if (token && token.prefix === prefix) {
				return applyTokenCompletion(
					lines,
					cursorLine,
					cursorCol,
					item.value,
					prefix,
				);
			}
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);
			// IMPORTANT: Pi force-Tab aborts entirely when this returns false.
			// Return true for skill tokens so mid-line `/skill:` Tab reaches getSuggestions.
			if (extractInlineSkillToken(before)) return true;
			return (
				current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
				true
			);
		},
	};
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.addAutocompleteProvider((current) =>
			createInlineSkillProvider(current, () => loadSkills(pi)),
		);
	});

	pi.on("input", (event) => {
		if (event.source === "extension") return;

		const text = event.text;
		if (!/(?:\/skill:|@skill:|\$)/.test(text)) return;

		const map = skillsByName(loadSkills(pi));
		if (map.size === 0) return;

		const { text: expanded, expanded: names } = expandInlineSkills(
			text,
			map,
			readSkillBody,
		);

		if (expanded === text || names.length === 0) return;

		return {
			action: "transform" as const,
			text: expanded,
			images: event.images,
		};
	});

	pi.registerCommand("inline-skills", {
		description: "Show mid-prompt skill invocation help",
		handler: async (_args, ctx) => {
			const skills = loadSkills(pi);
			const sample = skills
				.slice(0, 12)
				.map(
					(s) =>
						`- \`/skill:${s.name}\`${s.description ? ` — ${s.description}` : ""}`,
				)
				.join("\n");
			const body = [
				"**Inline skills** (personal extension)",
				"",
				"Invoke a skill **anywhere** in the prompt:",
				"",
				"| How | Behavior |",
				"|-----|----------|",
				"| `$` then pick | Auto-dropdown → inserts `/skill:name` |",
				"| `$name` | Expands on submit when `name` is a known skill |",
				"| `/skill:name` mid-line | Tab completes; expands on submit |",
				"| `@skill:name` | Autocomplete via `@`; expands on submit |",
				"| Leading `/skill:name` | Unchanged Pi built-in |",
				"",
				`Loaded skills: **${skills.length}**`,
				sample
					? `\n${sample}${skills.length > 12 ? `\n- … +${skills.length - 12} more` : ""}`
					: "",
			].join("\n");

			pi.sendMessage(
				{ customType: "inline-skills-status", content: body, display: true },
				{ triggerTurn: false },
			);
			if (ctx.hasUI) {
				ctx.ui.notify(
					`${skills.length} skills · mid-prompt $ / /skill: / @skill:`,
					"info",
				);
			}
		},
	});
}
