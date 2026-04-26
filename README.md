# Horizontal Tiler

A GNOME Shell extension for GNOME 46 that tiles windows horizontally across the screen.

## Features

- **Auto-Tiling**: Toggle automatic horizontal tiling on/off for the current workspace via the panel indicator or keyboard shortcut
- **Tile All Windows**: Manually tile all windows on the current monitor horizontally
- **Tile Focused Window**: Position the focused window to its correct slot in the horizontal layout
- **Focus Navigation**: Move focus between tiled windows with keyboard shortcuts
- **Reset Windows**: Restore windows to their default centered size
- **Per-Workspace**: Tiling state is independent per workspace

## Installation

1. Copy the `horizontal-tiler@allan` folder to `~/.local/share/gnome-shell/extensions/`:
   ```bash
   cp -r horizontal-tiler@allan ~/.local/share/gnome-shell/extensions/
   ```

2. Restart GNOME Shell:
   - Press `Alt+F2`, type `r`, press `Enter`

3. Enable the extension:
   ```bash
   gnome-extensions enable horizontal-tiler@allan
   ```

## Usage

### Panel Indicator

Click the grid icon in the top panel to open the menu:

- **Tiling Enabled** toggle switch — Enable/disable auto-tiling for the current workspace
- **Tile All Windows** — Manually tile all windows
- **Tile Focused Window** — Tile the currently focused window
- **Reset All Windows** — Restore windows to default size
- **Focus Window Left** — Move focus to the window on the left
- **Focus Window Right** — Move focus to the window on the right

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Super+Shift+T` | Toggle tiling on/off |
| `Super+Alt+H` | Tile all windows horizontally |
| `Super+Shift+H` | Tile focused window |
| `Super+Alt+R` | Reset all windows |
| `Super+,` | Focus window to the left |
| `Super+.` | Focus window to the right |

All shortcuts can be customized in **GNOME Settings → Keyboard → View and Customize Shortcuts → Extensions → Horizontal Tiler**.

## How It Works

When auto-tiling is enabled, the extension listens for:
- Windows being added or removed on the current workspace
- Workspace switches
- Display size changes

It then automatically divides all normal windows equally across the available screen width, filling the full height of the work area (excluding panels and docks).

## Files

```
horizontal-tiler@allan/
├── extension.js          # Main extension code
├── metadata.json         # Extension metadata (GNOME 46)
├── stylesheet.css        # Custom styles
├── schemas/
│   ├── gschemas.compiled # Compiled GSettings schema
│   └── org.gnome.shell.extensions.horizontal-tiler.gschema.xml  # Schema definitions
└── README.md             # This file
```
