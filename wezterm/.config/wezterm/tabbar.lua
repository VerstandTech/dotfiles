-- ~/.config/wezterm/tabbar.lua
-- Compact iconed tab bar + status line — charcoal ops palette (matches herd-dark).

local wezterm = require("wezterm")

local M = {}

-- Charcoal ops (aligned with pi herd-dark + wezterm.lua)
local c = {
	bg = "#181818",
	elevated = "#1c1c1c",
	panel = "#222222",
	hairline = "#383838",
	border = "#5a5a5a",
	fog = "#888888",
	ink = "#e0e0e0",
	ink_soft = "#c8c8c8",
	sky = "#66a6f8",
	teal = "#74bcbc",
	amber = "#dca84c",
	green = "#60a670",
	rose = "#d07070",
}

-- Map common process names to Nerd Font icons for the tab title.
local process_icons = {
	["nvim"] = wezterm.nerdfonts.custom_vim,
	["vim"] = wezterm.nerdfonts.custom_vim,
	["node"] = wezterm.nerdfonts.mdi_hexagon,
	["python"] = wezterm.nerdfonts.dev_python,
	["python3"] = wezterm.nerdfonts.dev_python,
	["cargo"] = wezterm.nerdfonts.dev_rust,
	["rustc"] = wezterm.nerdfonts.dev_rust,
	["go"] = wezterm.nerdfonts.mdi_language_go,
	["git"] = wezterm.nerdfonts.dev_git,
	["lazygit"] = wezterm.nerdfonts.dev_git,
	["docker"] = wezterm.nerdfonts.dev_docker,
	["ssh"] = wezterm.nerdfonts.md_ssh,
	["bash"] = wezterm.nerdfonts.cod_terminal_bash,
	["zsh"] = wezterm.nerdfonts.dev_terminal,
	["fish"] = wezterm.nerdfonts.dev_terminal,
	["claude"] = wezterm.nerdfonts.md_robot,
	["pi"] = wezterm.nerdfonts.md_robot,
}

local function basename(s)
	return string.gsub(s or "", "(.*[/\\])(.*)", "%2")
end

local function tab_title(tab)
	local proc = basename(tab.active_pane.foreground_process_name)
	local icon = process_icons[proc] or wezterm.nerdfonts.cod_terminal
	-- Prefer an explicitly set tab title, else the process name.
	local title = tab.tab_title
	if title == nil or #title == 0 then
		title = proc ~= "" and proc or "shell"
	end
	return string.format(" %s  %s ", icon, title)
end

function M.setup(config)
	config.use_fancy_tab_bar = false
	config.tab_bar_at_bottom = false
	config.hide_tab_bar_if_only_one_tab = false
	config.show_new_tab_button_in_tab_bar = false
	config.tab_max_width = 32

	-- Flat tab blocks (no powerline arrows). Each tab is a clean colored block;
	-- a thin gap in the tab-bar background keeps adjacent tabs distinct without
	-- any protruding "tail" glyphs.
	wezterm.on("format-tab-title", function(tab, tabs, panes, cfg, hover, max_width)
		local title = tab_title(tab)
		local active = tab.is_active
		local fg = active and c.bg or c.fog
		local bg = active and c.teal or c.panel
		if hover and not active then
			bg = c.hairline
			fg = c.ink_soft
		end
		return {
			-- leading gap in the bar background = flat separation, no arrow
			{ Background = { Color = c.elevated } },
			{ Foreground = { Color = c.elevated } },
			{ Text = " " },
			-- the tab block itself
			{ Background = { Color = bg } },
			{ Foreground = { Color = fg } },
			{ Attribute = { Intensity = active and "Bold" or "Normal" } },
			{ Text = title },
		}
	end)

	-- Right status: cwd • git branch • time (sky / green / amber chips)
	wezterm.on("update-status", function(window, pane)
		local cells = {}

		local cwd_uri = pane:get_current_working_dir()
		if cwd_uri then
			local cwd = cwd_uri.file_path or tostring(cwd_uri)
			cwd = basename(cwd:gsub("/$", ""))
			table.insert(cells, { c.sky, wezterm.nerdfonts.cod_folder .. "  " .. cwd })
		end

		local ok, branch = pcall(function()
			local success, stdout = wezterm.run_child_process({
				"git",
				"-C",
				(cwd_uri and (cwd_uri.file_path or "")) or ".",
				"rev-parse",
				"--abbrev-ref",
				"HEAD",
			})
			if success then
				return (stdout:gsub("%s+$", ""))
			end
			return nil
		end)
		if ok and branch and #branch > 0 then
			table.insert(cells, { c.green, wezterm.nerdfonts.dev_git_branch .. "  " .. branch })
		end

		table.insert(cells, { c.amber, wezterm.nerdfonts.md_clock_outline .. "  " .. wezterm.strftime("%H:%M") })

		local elements = {}
		for i, cell in ipairs(cells) do
			table.insert(elements, { Foreground = { Color = cell[1] } })
			table.insert(elements, { Text = cell[2] })
			if i < #cells then
				table.insert(elements, { Foreground = { Color = c.fog } })
				table.insert(elements, { Text = "   " })
			end
		end
		table.insert(elements, { Text = "  " })
		window:set_right_status(wezterm.format(elements))

		-- Left status: leader indicator + active key table (e.g. resize mode)
		local left = {}
		if window:leader_is_active() then
			table.insert(left, { Foreground = { Color = c.bg } })
			table.insert(left, { Background = { Color = c.amber } })
			table.insert(left, { Text = "  " .. wezterm.nerdfonts.md_keyboard .. " LEADER  " })
		end
		local kt = window:active_key_table()
		if kt then
			table.insert(left, { Foreground = { Color = c.bg } })
			table.insert(left, { Background = { Color = c.teal } })
			table.insert(left, { Text = "  " .. kt:upper() .. "  " })
		end
		window:set_left_status(wezterm.format(left))
	end)
end

return M
