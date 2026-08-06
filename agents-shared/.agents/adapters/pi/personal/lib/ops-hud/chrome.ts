/**
 * Charcoal-ops chrome helpers — gradient frames for working indicator + status pulse.
 * Pure functions; no I/O. Colors sampled from the reference TUI screenshot:
 *   sky blue #66a6f8 · teal #74bcbc · amber/gold #dca84c · soft green #60a670
 */

export const CHROME = {
	sky: "#66a6f8",
	skyDeep: "#5c94dd",
	skySoft: "#7eb6fa",
	teal: "#74bcbc",
	tealSoft: "#8ac8c8",
	tealDeep: "#5aa0a0",
	amber: "#dca84c",
	amberBright: "#f4cc50",
	amberSoft: "#e8bc6a",
	gold: "#f0d060",
	green: "#60a670",
	fog: "#888888",
} as const;

const RESET = "\x1b[39m";

/** Truecolor foreground SGR. */
export function fgHex(hex: string, text: string): string {
	const n = hex.replace("#", "");
	if (n.length !== 6) return text;
	const r = Number.parseInt(n.slice(0, 2), 16);
	const g = Number.parseInt(n.slice(2, 4), 16);
	const b = Number.parseInt(n.slice(4, 6), 16);
	if ([r, g, b].some((c) => Number.isNaN(c))) return text;
	return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

/** Linear RGB blend between two #rrggbb colors. t in [0,1]. */
export function blendHex(a: string, b: string, t: number): string {
	const parse = (hex: string) => {
		const n = hex.replace("#", "");
		return [
			Number.parseInt(n.slice(0, 2), 16),
			Number.parseInt(n.slice(2, 4), 16),
			Number.parseInt(n.slice(4, 6), 16),
		] as const;
	};
	const [ar, ag, ab] = parse(a);
	const [br, bg, bb] = parse(b);
	const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
	const u = Math.max(0, Math.min(1, t));
	const r = clamp(ar + (br - ar) * u);
	const g = clamp(ag + (bg - ag) * u);
	const bl = clamp(ab + (bb - ab) * u);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

/** Evenly sample a multi-stop gradient. stops are #rrggbb. */
export function gradientStops(stops: readonly string[], steps: number): string[] {
	if (stops.length === 0 || steps < 1) return [];
	if (stops.length === 1) return Array.from({ length: steps }, () => stops[0]!);
	const out: string[] = [];
	for (let i = 0; i < steps; i++) {
		const t = steps === 1 ? 0 : i / (steps - 1);
		const scaled = t * (stops.length - 1);
		const idx = Math.min(stops.length - 2, Math.floor(scaled));
		const local = scaled - idx;
		out.push(blendHex(stops[idx]!, stops[idx + 1]!, local));
	}
	return out;
}

/** Soft blue→teal→blue loop used for live status dots and braille spinners. */
export function skyTealGradient(steps = 12): string[] {
	return gradientStops(
		[CHROME.skyDeep, CHROME.sky, CHROME.skySoft, CHROME.tealSoft, CHROME.teal, CHROME.tealDeep, CHROME.sky],
		steps,
	);
}

/** Warm gold pulse matching the screenshot's half-moon working spinner. */
export function amberGradient(steps = 8): string[] {
	return gradientStops(
		[CHROME.amber, CHROME.amberBright, CHROME.gold, CHROME.amberSoft, CHROME.amber],
		steps,
	);
}

/**
 * Working indicator frames: gold half-moon phases (screenshot match) with
 * a subtle amber→gold gradient across the rotation.
 */
export function workingIndicatorFrames(): { frames: string[]; intervalMs: number } {
	const moons = ["◐", "◓", "◑", "◒"] as const;
	const colors = amberGradient(moons.length * 2);
	const frames = moons.flatMap((moon, i) => [
		fgHex(colors[i]!, moon),
		fgHex(colors[i + moons.length] ?? colors[i]!, moon),
	]);
	return { frames, intervalMs: 110 };
}

/**
 * Busy/ops indicator: braille spinner walking a sky→teal gradient
 * (progress-bar blue from the screenshot, softened into teal).
 */
export function opsIndicatorFrames(): { frames: string[]; intervalMs: number } {
	const braille = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
	const colors = skyTealGradient(braille.length);
	return {
		frames: braille.map((ch, i) => fgHex(colors[i]!, ch)),
		intervalMs: 80,
	};
}

/**
 * Status chip leading glyph for a given animation frame index.
 * Cycles sky→teal so footer status feels alive without strobing.
 */
export function statusDotFrame(frameIndex: number): string {
	const colors = skyTealGradient(16);
	const color = colors[((frameIndex % colors.length) + colors.length) % colors.length]!;
	return fgHex(color, "●");
}

/** Dim suffix text for status chips (keeps hierarchy quiet). */
export function statusDim(text: string): string {
	return fgHex(CHROME.fog, text);
}
