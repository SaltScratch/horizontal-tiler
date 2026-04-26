#!/bin/bash

# Horizontal Tiler - GNOME Shell Extension Installer
# Installs the extension to ~/.local/share/gnome-shell/extensions/

set -e

EXTENSION_UUID="horizontal-tiler@allan"
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================"
echo " Horizontal Tiler - GNOME Shell Extension"
echo "============================================"
echo ""

# Check if running under X11 or Wayland
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "Detected: Wayland session"
else
    echo "Detected: X11 session"
fi

# Create extensions directory if it doesn't exist
if [ ! -d "$HOME/.local/share/gnome-shell/extensions" ]; then
    echo "Creating extensions directory..."
    mkdir -p "$HOME/.local/share/gnome-shell/extensions"
fi

# Remove existing installation if present
if [ -d "$EXTENSION_DIR" ]; then
    echo "Removing existing installation..."
    rm -rf "$EXTENSION_DIR"
fi

# Copy extension files
echo "Installing extension to $EXTENSION_DIR..."
cp -r "$SCRIPT_DIR" "$EXTENSION_DIR"

# Compile GSettings schema (in case it wasn't compiled)
echo "Compiling GSettings schema..."
if command -v glib-compile-schemas &> /dev/null; then
    glib-compile-schemas "$EXTENSION_DIR/schemas/" 2>/dev/null || true
fi

echo ""
echo "Installation complete!"
echo ""

# Enable the extension
echo "Enabling extension..."
if command -v gnome-extensions &> /dev/null; then
    gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || {
        echo "Note: Could not enable extension automatically."
        echo "Please enable it manually using: gnome-extensions enable $EXTENSION_UUID"
    }
else
    echo "Note: 'gnome-extensions' command not found."
    echo "Please enable the extension using GNOME Extensions app."
fi

echo ""
echo "============================================"
echo " IMPORTANT: Restart GNOME Shell"
echo "============================================"
echo ""
echo "Press Alt+F2, type 'r', and press Enter to restart."
echo ""
echo "After restart, you can configure keyboard shortcuts at:"
echo "  GNOME Settings → Keyboard → View and Customize Shortcuts"
echo "  → Extensions → Horizontal Tiler"
echo ""
echo "Default shortcuts:"
echo "  Super+Shift+T   - Toggle tiling on/off"
echo "  Super+,         - Move viewport left"
echo "  Super+.         - Move viewport right"
echo "  Super+Shift+,   - Swap window left"
echo "  Super+Shift+.   - Swap window right"
echo "============================================"
