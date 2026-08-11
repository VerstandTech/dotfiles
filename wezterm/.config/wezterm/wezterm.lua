-- ~/.config/wezterm/wezterm.lua
-- Charcoal ops • JetBrainsMono Nerd Font • matched to pi herd-dark / reference TUI.
-- Docs: https://wezfurlong.org/wezterm/config/files.html

local wezterm = require("wezterm")
local act = wezterm.action
local config = wezterm.config_builder()

-- Load the custom tab bar (defined in tabbar.lua next to this file).
require("tabbar").setup(config)

--------------------------------------------------------------------------------
-- Charcoal ops palette (screenshot-matched)
-- Neutral #181818 base — deliberately NOT Catppuccin/Tokyo blue-lavender.
--------------------------------------------------------------------------------
local ops = {
	bg = "#181818",
	bg_elevated = "#1c1c1c",
	panel = "#222222",
	hairline = "#383838",
	border = "#5a5a5a",
	fog = "#888888",
	ink = "#e0e0e0",
	ink_soft = "#c8c8c8",
	sky = "#66a6f8",
	sky_deep = "#5c94dd",
	teal = "#74bcbc",
	amber = "#dca84c",
	gold = "#f4cc50",
	green = "#60a670",
	rose = "#d07070",
	violet = "#b0a0d0",
}

config.colors = {
	foreground = ops.ink_soft,
	background = ops.bg,
	cursor_bg = ops.ink,
	cursor_fg = ops.bg,
	cursor_border = ops.ink,
	selection_fg = ops.ink,
	selection_bg = "#2a3038",
	scrollbar_thumb = ops.hairline,
	split = ops.hairline,

	ansi = {
		ops.bg, -- black
		ops.rose, -- red
		ops.green, -- green
		ops.amber, -- yellow
		ops.sky_deep, -- blue
		ops.violet, -- magenta
		ops.teal, -- cyan
		ops.ink_soft, -- white
	},
	brights = {
		ops.fog, -- bright black
		"#e08888", -- bright red
		"#78c088", -- bright green
		ops.gold, -- bright yellow
		ops.sky, -- bright blue
		"#c8b8e0", -- bright magenta
		"#8ac8c8", -- bright cyan
		ops.ink, -- bright white
	},

	compose_cursor = ops.amber,

	tab_bar = {
		background = ops.bg_elevated,
		active_tab = {
			bg_color = ops.panel,
			fg_color = ops.ink,
			intensity = "Bold",
		},
		inactive_tab = {
			bg_color = ops.bg_elevated,
			fg_color = ops.fog,
		},
		inactive_tab_hover = {
			bg_color = ops.hairline,
			fg_color = ops.ink_soft,
		},
		new_tab = {
			bg_color = ops.bg_elevated,
			fg_color = ops.fog,
		},
		new_tab_hover = {
			bg_color = ops.hairline,
			fg_color = ops.teal,
		},
	},
}

--------------------------------------------------------------------------------
-- Appearance
--------------------------------------------------------------------------------
-- Do not set color_scheme — it would override the charcoal ops colors above.

config.font = wezterm.font_with_fallback({
	{ family = "JetBrainsMono Nerd Font", weight = "Medium" },
	"Symbols Nerd Font Mono", -- glyph fallback
	"Apple Color Emoji",
})
config.font_size = 14.0
config.line_height = 1.05
config.cell_width = 1.0

-- Ligatures + stylistic sets. Set to {} to turn ligatures off.
config.harfbuzz_features = { "calt=1", "clig=1", "liga=1", "ss01", "ss19", "zero" }

config.freetype_load_target = "Normal"
config.freetype_render_target = "HorizontalLcd"

-- Window / chrome — solid charcoal (target TUI is fully opaque, not glass-blue)
config.window_background_opacity = 1.0
config.macos_window_background_blur = 0
config.window_decorations = "RESIZE" -- keep resize handles, drop the title bar
config.window_padding = { left = 12, right = 12, top = 8, bottom = 6 }
config.initial_cols = 120
config.initial_rows = 34
config.adjust_window_size_when_changing_font_size = false

-- Cursor
config.default_cursor_style = "BlinkingBar"
config.cursor_blink_rate = 550
config.cursor_blink_ease_in = "EaseOut"
config.cursor_blink_ease_out = "EaseOut"
config.animation_fps = 60
config.max_fps = 120

-- Scrollback / bell
config.scrollback_lines = 20000
config.audible_bell = "Disabled"
config.visual_bell = {
	fade_in_duration_ms = 60,
	fade_out_duration_ms = 120,
	target = "CursorColor",
}

-- Misc quality-of-life
config.hide_mouse_cursor_when_typing = true
config.warn_about_missing_glyphs = false
config.check_for_updates = false
config.front_end = "WebGpu" -- GPU-accelerated rendering

--------------------------------------------------------------------------------
-- Key bindings — tuned for coding (splits, tabs, copy-mode, quick actions)
--   MULTIPLEXER: leader is CTRL+SPACE (tmux-style). Press it, then a follow-up
--   key: `|` splits side-by-side, `-` splits stacked, h/j/k/l move, etc.
--------------------------------------------------------------------------------
config.leader = { key = "phys:Space", mods = "CTRL", timeout_milliseconds = 2000 }

config.keys = {
	{ key = "Enter", mods = "SHIFT", action = act.SendString("\27[13;2u") },
	-- Splits (leader then | or -). `|` = vertical divider => panes side by side.
	-- `-` = horizontal divider => panes stacked. New pane inherits the cwd.
	{ key = "mapped:|", mods = "LEADER", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "mapped:|", mods = "LEADER|SHIFT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "mapped:|", mods = "LEADER|ALT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "mapped:|", mods = "LEADER|SHIFT|ALT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "-", mods = "LEADER", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
	-- Backslash also works for side-by-side if you don't want to reach for Shift.
	{ key = "\\", mods = "LEADER", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "\\", mods = "LEADER|SHIFT", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "d", mods = "CMD", action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
	{ key = "d", mods = "CMD|SHIFT", action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },

	-- Move between panes: leader then h/j/k/l (vim/tmux style), or CMD+alt+arrows
	{ key = "h", mods = "LEADER", action = act.ActivatePaneDirection("Left") },
	{ key = "j", mods = "LEADER", action = act.ActivatePaneDirection("Down") },
	{ key = "k", mods = "LEADER", action = act.ActivatePaneDirection("Up") },
	{ key = "l", mods = "LEADER", action = act.ActivatePaneDirection("Right") },
	{ key = "LeftArrow", mods = "CMD|ALT", action = act.ActivatePaneDirection("Left") },
	{ key = "RightArrow", mods = "CMD|ALT", action = act.ActivatePaneDirection("Right") },
	{ key = "UpArrow", mods = "CMD|ALT", action = act.ActivatePaneDirection("Up") },
	{ key = "DownArrow", mods = "CMD|ALT", action = act.ActivatePaneDirection("Down") },

	-- Pane management: zoom (fullscreen a pane), close, swap
	{ key = "z", mods = "LEADER", action = act.TogglePaneZoomState },
	{ key = "x", mods = "LEADER", action = act.CloseCurrentPane({ confirm = true }) },
	{ key = "w", mods = "CMD", action = act.CloseCurrentPane({ confirm = true }) },

	-- Resize panes: leader then s, then h/j/k/l (repeatable; Esc/Enter to exit)
	{ key = "s", mods = "LEADER", action = act.ActivateKeyTable({ name = "resize", one_shot = false, timeout_milliseconds = 1000 }) },

	-- Tabs (leader c = new tab, like tmux "new window")
	{ key = "c", mods = "LEADER", action = act.SpawnTab("CurrentPaneDomain") },
	{ key = "t", mods = "CMD", action = act.SpawnTab("CurrentPaneDomain") },
	{ key = "[", mods = "CMD|SHIFT", action = act.ActivateTabRelative(-1) },
	{ key = "]", mods = "CMD|SHIFT", action = act.ActivateTabRelative(1) },
	{ key = "p", mods = "LEADER", action = act.ActivateTabRelative(-1) },
	{ key = "n", mods = "LEADER", action = act.ActivateTabRelative(1) },

	-- Explicit local Herdr attach. WezTerm remains the outer shell; Herdr owns
	-- durable workspaces and session state. SpawnCommandInNewTab inherits cwd.
	{ key = "a", mods = "LEADER", action = act.SpawnCommandInNewTab({ args = { "herdr" } }) },

	-- Copy mode & search (great for reading logs / grabbing output)
	{ key = "[", mods = "LEADER", action = act.ActivateCopyMode },
	{ key = "f", mods = "CMD", action = act.Search({ CaseInSensitiveString = "" }) },

	-- Quick actions
	{ key = "k", mods = "CMD", action = act.ClearScrollback("ScrollbackAndViewport") },
	{ key = "r", mods = "LEADER", action = act.ReloadConfiguration },
	{ key = "Enter", mods = "CMD", action = act.ToggleFullScreen },
	-- Font size
	{ key = "=", mods = "CMD", action = act.IncreaseFontSize },
	{ key = "-", mods = "CMD", action = act.DecreaseFontSize },
	{ key = "0", mods = "CMD", action = act.ResetFontSize },
	-- Command palette / launcher
	{ key = "P", mods = "CMD|SHIFT", action = act.ActivateCommandPalette },
}

-- Jump to tab N with CMD+number
for i = 1, 9 do
	table.insert(config.keys, {
		key = tostring(i),
		mods = "CMD",
		action = act.ActivateTab(i - 1),
	})
end

config.key_tables = {
	resize = {
		{ key = "h", action = act.AdjustPaneSize({ "Left", 3 }) },
		{ key = "l", action = act.AdjustPaneSize({ "Right", 3 }) },
		{ key = "k", action = act.AdjustPaneSize({ "Up", 3 }) },
		{ key = "j", action = act.AdjustPaneSize({ "Down", 3 }) },
		{ key = "Escape", action = "PopKeyTable" },
		{ key = "Enter", action = "PopKeyTable" },
	},
}

-- URLs, file paths, git hashes → clickable / quick-select friendly
config.mouse_bindings = {
	{
		event = { Up = { streak = 1, button = "Left" } },
		mods = "CMD",
		action = act.OpenLinkAtMouseCursor,
	},
}

return config
