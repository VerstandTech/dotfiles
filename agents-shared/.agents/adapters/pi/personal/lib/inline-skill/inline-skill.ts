/**
 * Mid-prompt skill invocation for Pi.
 *
 * Built-in slash autocomplete only opens when the *message* starts with `/`,
 * and the editor hard-skips `/` as a custom triggerCharacter. So:
 *
 * - `/skill:name` still works mid-prompt (Tab completes; submit expands)
 * - `$` is the natural mid-prompt trigger (auto-dropdown); completion inserts
 *   `/skill:name` so expansion stays unified
 * - `@skill:name` also autocompletes (uses built-in `@` trigger) without
 *   stealing normal `@path` file completion
 */

export type SkillRef = {
	/** Skill name without `skill:` prefix */
	name: string;
	description?: string;
	/** Absolute path to SKILL.md (or skill .md file) */
	filePath: string;
	/** Directory used for relative references inside the skill */
	baseDir?: string;
};

export type InlineSkillToken = {
	/** Full matched token including trigger, e.g. `/skill:bdd`, `$bd`, `@skill:` */
	prefix: string;
	/** Name query used to filter skills */
	nameQuery: string;
	/** Start index of `prefix` within the line text before cursor */
	start: number;
	/** How the token was introduced */
	kind: "slash" | "dollar" | "at-skill";
};

/**
 * Detect an in-progress inline skill token just before the cursor.
 * Line-leading `/…` slash commands return null (Pi built-in owns those).
 */
export function extractInlineSkillToken(textBeforeCursor: string): InlineSkillToken | null {
	// Mid-line progressive `/s`…`/skill` and `/skill:name`
	const slash = matchToken(
		textBeforeCursor,
		/(?:^|[\t ])(\/(?:skill:([a-zA-Z0-9_-]*)|s(?:k(?:i(?:l(?:l)?)?)?)?))$/,
		"slash",
		(m) => m[2] ?? "",
	);
	if (slash) {
		if (isLineStart(textBeforeCursor, slash.start)) return null;
		return slash;
	}

	// `$` / `$name` / `$skill:` / `$skill:name` — primary auto-dropdown trigger
	const dollar = matchToken(
		textBeforeCursor,
		/(?:^|[\t ])(\$(?:skill:([a-zA-Z0-9_-]*)|([a-zA-Z0-9_-]*)))$/,
		"dollar",
		(m) => m[2] ?? m[3] ?? "",
	);
	if (dollar) return dollar;

	// `@skill:` / progressive `@s`… only when building toward `skill` (not `@src`)
	const atSkill = matchToken(
		textBeforeCursor,
		/(?:^|[\t ])(@(?:skill:([a-zA-Z0-9_-]*)|s(?:k(?:i(?:l(?:l)?)?)?)?))$/,
		"at-skill",
		(m) => m[2] ?? "",
	);
	if (atSkill) return atSkill;

	return null;
}

function matchToken(
	textBeforeCursor: string,
	re: RegExp,
	kind: InlineSkillToken["kind"],
	nameQueryOf: (m: RegExpMatchArray) => string,
): InlineSkillToken | null {
	const m = textBeforeCursor.match(re);
	if (!m || m.index === undefined) return null;
	const prefix = m[1];
	const ws = m[0].length - prefix.length;
	const start = m.index + ws;
	return {
		prefix,
		nameQuery: nameQueryOf(m),
		start,
		kind,
	};
}

function isLineStart(textBeforeCursor: string, tokenStart: number): boolean {
	return textBeforeCursor.slice(0, tokenStart).trim() === "";
}

export function formatSkillItem(
	skill: SkillRef,
	opts?: { maxDesc?: number },
): { value: string; label: string; description?: string } {
	const maxDesc = opts?.maxDesc ?? 80;
	let description = skill.description?.replace(/\s+/g, " ").trim();
	if (description && description.length > maxDesc) {
		description = `${description.slice(0, maxDesc - 1)}…`;
	}
	// Always insert canonical /skill:name so submit-time expansion is uniform
	return {
		value: `/skill:${skill.name}`,
		label: `/skill:${skill.name}`,
		description,
	};
}

export function filterSkills(
	skills: SkillRef[],
	nameQuery: string,
	limit = 20,
): ReturnType<typeof formatSkillItem>[] {
	const q = nameQuery.trim().toLowerCase();
	const scored = skills
		.map((s) => {
			const name = s.name.toLowerCase();
			let score = 0;
			if (!q) score = 1;
			else if (name === q) score = 100;
			else if (name.startsWith(q)) score = 80;
			else if (name.includes(q)) score = 40;
			else if (s.description?.toLowerCase().includes(q)) score = 10;
			else score = 0;
			return { s, score };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));

	return scored.slice(0, limit).map((x) => formatSkillItem(x.s));
}

/**
 * Skill mention tokens expanded on submit.
 * `/skill:name`, `$skill:name`, `@skill:name`, and bare `$name` (known skills only).
 */
const SKILL_MENTION_RE =
	/(^|[\s])(?:\/skill:|\$skill:|@skill:|\$)([a-zA-Z0-9_-]+)\b/g;

export function buildSkillBlock(skill: SkillRef, body: string): string {
	const location = skill.filePath;
	const base = skill.baseDir ?? dirnameOf(skill.filePath);
	const trimmed = body.trim();
	return (
		`<skill name="${skill.name}" location="${location}">\n` +
		`References are relative to ${base}.\n\n` +
		`${trimmed}\n` +
		`</skill>`
	);
}

function dirnameOf(filePath: string): string {
	const norm = filePath.replace(/\\/g, "/");
	const i = norm.lastIndexOf("/");
	return i <= 0 ? "." : norm.slice(0, i);
}

/** Strip YAML frontmatter (Pi skill bodies). */
export function stripSkillFrontmatter(content: string): string {
	if (!content.startsWith("---")) return content;
	const end = content.indexOf("\n---", 3);
	if (end === -1) return content;
	const after = content.slice(end + 4);
	return after.replace(/^\r?\n/, "");
}

/**
 * Expand skill mentions in text.
 *
 * Pure start-of-message `/skill:name args…` matches built-in behavior.
 * Mid-prompt `/skill:name`, `$skill:name`, `@skill:name`, and bare `$name` expand in place.
 */
export function expandInlineSkills(
	text: string,
	skillsByName: Map<string, SkillRef>,
	readBody: (skill: SkillRef) => string | null,
): { text: string; expanded: string[]; missing: string[] } {
	const expanded: string[] = [];
	const missing: string[] = [];

	const pure = text.match(/^\/skill:([a-zA-Z0-9_-]+)(?:[ \t]+([\s\S]*))?$/);
	if (pure) {
		const name = pure[1];
		const args = pure[2]?.trim() ?? "";
		const skill = skillsByName.get(name);
		if (!skill) return { text, expanded, missing: [name] };
		const body = readBody(skill);
		if (body === null) return { text, expanded, missing: [name] };
		expanded.push(name);
		const block = buildSkillBlock(skill, body);
		return { text: args ? `${block}\n\n${args}` : block, expanded, missing };
	}

	if (!/(?:\/skill:|@skill:|\$)/.test(text)) {
		return { text, expanded, missing };
	}

	const result = text.replace(
		SKILL_MENTION_RE,
		(full, pre: string, name: string) => {
			const skill = skillsByName.get(name);
			const explicit = /(?:\/skill:|\$skill:|@skill:)/.test(full);
			if (!skill) {
				// Bare $ENV stays put without counting as a missing skill.
				if (explicit && !missing.includes(name)) missing.push(name);
				return full;
			}
			const body = readBody(skill);
			if (body === null) {
				if (!missing.includes(name)) missing.push(name);
				return full;
			}
			if (!expanded.includes(name)) expanded.push(name);
			return `${pre}${buildSkillBlock(skill, body)}`;
		},
	);

	return { text: result, expanded, missing };
}

/** Apply an autocomplete item over `prefix` ending at cursorCol. */
export function applyTokenCompletion(
	lines: string[],
	cursorLine: number,
	cursorCol: number,
	itemValue: string,
	prefix: string,
	opts?: { trailingSpace?: boolean },
): { lines: string[]; cursorLine: number; cursorCol: number } {
	const line = lines[cursorLine] ?? "";
	const before = line.slice(0, Math.max(0, cursorCol - prefix.length));
	const after = line.slice(cursorCol);
	const space = opts?.trailingSpace === false ? "" : " ";
	const suffix = after.startsWith(" ") || after.startsWith("\t") ? "" : space;
	const newLine = before + itemValue + suffix + after;
	const next = [...lines];
	next[cursorLine] = newLine;
	return {
		lines: next,
		cursorLine,
		cursorCol: before.length + itemValue.length + suffix.length,
	};
}

/**
 * Map pi.getCommands() skill entries into SkillRef.
 * Skill command names are `skill:<name>`.
 */
export function skillsFromCommands(
	commands: Array<{
		name: string;
		description?: string;
		source?: string;
		sourceInfo?: { path?: string; baseDir?: string };
	}>,
): SkillRef[] {
	const out: SkillRef[] = [];
	for (const cmd of commands) {
		if (cmd.source && cmd.source !== "skill") continue;
		const name = cmd.name.startsWith("skill:")
			? cmd.name.slice("skill:".length)
			: cmd.name.startsWith("/skill:")
				? cmd.name.slice("/skill:".length)
				: null;
		if (!name) continue;
		const filePath = cmd.sourceInfo?.path;
		if (!filePath) continue;
		out.push({
			name,
			description: cmd.description,
			filePath,
			baseDir: cmd.sourceInfo?.baseDir,
		});
	}
	const seen = new Set<string>();
	return out.filter((s) => {
		if (seen.has(s.name)) return false;
		seen.add(s.name);
		return true;
	});
}
