# Horizontal Tiler

A GNOME Shell extension for GNOME 46 that tiles windows horizontally across the screen.

## Features

- **Auto-Tiling**: Toggle automatic horizontal tiling on/off for the current workspace via the panel indicator or keyboard shortcut
- **Window Navigation**: Move between tiled windows with keyboard shortcuts or on-screen controls
- **Window Swapping**: Reorder windows by swapping their positions
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
- **Move Viewport Left** — Shift the viewport to show the previous window in the order on the leftmost monitor
- **Move Viewport Right** — Shift the viewport to show the next window in the order on the leftmost monitor

### On-Screen Controls

When tiling is enabled with multiple windows, navigation buttons appear on the edge monitors:

- **Leftmost monitor**: Shows left arrow (move left), shuffle icon (swap left), and the title of the window to the left
- **Rightmost monitor**: Shows right arrow (move right), shuffle icon (swap right), and the title of the window to the right
- **Middle monitors** (if 3+): No controls shown

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Super+Shift+T` | Toggle tiling on/off |
| `Super+,` | Move window to the left |
| `Super+.` | Move window to the right |
| `Super+Shift+,` | Swap window with left neighbor |
| `Super+Shift+.` | Swap window with right neighbor |

All shortcuts can be customized in **GNOME Settings → Keyboard → View and Customize Shortcuts → Extensions → Horizontal Tiler**.

## How It Works

When auto-tiling is enabled, the extension listens for:
- Windows being added or removed on the current workspace
- Workspace switches
- Display size changes

It then shows one window per monitor, filling the full height of the work area (excluding panels and docks). Windows are arranged in a circular order, and navigation cycles through them.

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
