// Horizontal Tiler - GNOME Shell Extension for GNOME 46
// Tiles windows horizontally across the screen

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class HorizontalTilerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._keybindingIds = [];
        this._tileEnabled = false;
        this._tileToggleItem = null;
        this._windowAddedId = 0;
        this._windowRemovedId = 0;
        this._windowEnteredMonitorId = 0;
        this._windowLeftMonitorId = 0;
        this._minimizeId = 0;
        this._unminimizeId = 0;
        this._sizeChangedId = 0;
        this._switchWorkspaceId = 0;
        this._hidingWindows = false;
        this._unminimizingAll = false;
        this._navButtons = null;
        this._settings = null;
    }

    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.horizontal-tiler');

        this._indicator = new PanelMenu.Button(0.0);

        let icon = new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);

        // Tile All (toggle)
        this._tileToggleItem = new PopupMenu.PopupMenuItem('Tile All Windows');
        this._tileToggleItem.connect('activate', () => {
            this._toggleTiling();
        });
        this._indicator.menu.addMenuItem(this._tileToggleItem);

        // Focus Left
        let focusLeftItem = new PopupMenu.PopupMenuItem('Focus Window Left');
        focusLeftItem.connect('activate', () => this._focusLeft());
        this._indicator.menu.addMenuItem(focusLeftItem);

        // Focus Right
        let focusRightItem = new PopupMenu.PopupMenuItem('Focus Window Right');
        focusRightItem.connect('activate', () => this._focusRight());
        this._indicator.menu.addMenuItem(focusRightItem);

        Main.panel.addToStatusArea(this.metadata.uuid, this._indicator, 1, 'right');

        this._setupKeybindings();

        // Enable tiling by default
        this._enableTiling();
    }

    disable() {
        this._disableTiling();
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._clearKeybindings();
        if (this._settings) {
            this._settings = null;
        }
    }

    _setupKeybindings() {
        let actionMode = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;

        Main.wm.addKeybinding(
            'toggle-tiling',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._toggleTiling()
        );
        this._keybindingIds.push('toggle-tiling');

        Main.wm.addKeybinding(
            'tile-all-horizontal',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._tileAllWindows()
        );
        this._keybindingIds.push('tile-all-horizontal');

        Main.wm.addKeybinding(
            'tile-focused-horizontal',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._tileFocusedWindow()
        );
        this._keybindingIds.push('tile-focused-horizontal');

        Main.wm.addKeybinding(
            'reset-windows',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._resetAllWindows()
        );
        this._keybindingIds.push('reset-windows');

        Main.wm.addKeybinding(
            'focus-left',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._focusLeft()
        );
        this._keybindingIds.push('focus-left');

        Main.wm.addKeybinding(
            'focus-right',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._focusRight()
        );
        this._keybindingIds.push('focus-right');

        Main.wm.addKeybinding(
            'swap-left',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._swapLeft()
        );
        this._keybindingIds.push('swap-left');

        Main.wm.addKeybinding(
            'swap-right',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._swapRight()
        );
        this._keybindingIds.push('swap-right');
    }

    _clearKeybindings() {
        if (!this._keybindingIds) return;
        for (let id of this._keybindingIds) {
            Main.wm.removeKeybinding(id);
        }
        this._keybindingIds = [];
    }

    _toggleTiling() {
        if (this._tileEnabled) {
            this._disableTiling();
        } else {
            this._enableTiling();
        }
    }

    _enableTiling() {
        if (this._tileEnabled) return;
        this._tileEnabled = true;

        if (this._indicator) {
            this._indicator.add_style_pseudo_class('checked');
        }
        if (this._tileToggleItem) {
            this._tileToggleItem.label.text = '✓ Tile All Windows';
        }

        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();

        this._windowAddedId = activeWorkspace.connect('window-added', () => {
            this._scheduleTileAll();
        });

        this._windowRemovedId = activeWorkspace.connect('window-removed', () => {
            this._scheduleTileAll();
        });

        this._windowEnteredMonitorId = global.display.connect('window-entered-monitor', (display, win, monitor) => {
            // If a normal window was moved onto a monitor, tile it
            if (win && win.get_window_type() === Meta.WindowType.NORMAL &&
                win.get_transient_for() === null) {
                // Give the window focus so it gets tiled
                win.unminimize();
                win.activate(global.get_current_time());
            }
            this._scheduleTileAll();
        });

        this._windowLeftMonitorId = global.display.connect('window-left-monitor', () => {
            this._scheduleTileAll();
        });

        this._minimizeId = global.window_manager.connect('minimize', () => {
            this._scheduleTileAll();
        });

        this._unminimizeId = global.window_manager.connect('unminimize', () => {
            this._scheduleTileAll();
        });

        this._switchWorkspaceId = workspaceManager.connect('active-workspace-changed', () => {
            this._onWorkspaceChanged();
        });

        this._sizeChangedId = global.display.connect('workareas-changed', () => {
            if (this._tileEnabled) {
                this._scheduleTileAll();
            }
        });

        this._tileAllWindows();
    }

    _disableTiling() {
        if (!this._tileEnabled) return;
        this._tileEnabled = false;

        if (this._indicator) {
            this._indicator.remove_style_pseudo_class('checked');
        }
        if (this._tileToggleItem) {
            this._tileToggleItem.label.text = 'Tile All Windows';
        }

        // Unminimize all windows when disabling tiling
        this._unminimizeAllWindows();

        // Destroy navigation buttons
        this._destroyNavButtons();

        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();

        if (this._windowAddedId > 0) {
            activeWorkspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;
        }
        if (this._windowRemovedId > 0) {
            activeWorkspace.disconnect(this._windowRemovedId);
            this._windowRemovedId = 0;
        }
        if (this._windowEnteredMonitorId > 0) {
            global.display.disconnect(this._windowEnteredMonitorId);
            this._windowEnteredMonitorId = 0;
        }
        if (this._windowLeftMonitorId > 0) {
            global.display.disconnect(this._windowLeftMonitorId);
            this._windowLeftMonitorId = 0;
        }
        if (this._minimizeId > 0) {
            global.window_manager.disconnect(this._minimizeId);
            this._minimizeId = 0;
        }
        if (this._unminimizeId > 0) {
            global.window_manager.disconnect(this._unminimizeId);
            this._unminimizeId = 0;
        }
        if (this._switchWorkspaceId > 0) {
            workspaceManager.disconnect(this._switchWorkspaceId);
            this._switchWorkspaceId = 0;
        }
        if (this._sizeChangedId > 0) {
            global.display.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }
    }

    _unminimizeAllWindows() {
        // Guard against re-entrant calls triggered by unminimize signals
        if (this._unminimizingAll) return;
        this._unminimizingAll = true;

        try {
            let windows = this._getWindowsOnCurrentMonitor(true);
            for (let win of windows) {
                win.unminimize();
            }
        } finally {
            this._unminimizingAll = false;
        }
    }

    _scheduleTileAll() {
        let laters = global.compositor.get_laters();
        laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            if (this._tileEnabled) {
                this._tileAllWindows();
            }
        });
    }

    _onWorkspaceChanged() {
        if (!this._tileEnabled) return;

        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();

        this._windowAddedId = activeWorkspace.connect('window-added', () => {
            this._scheduleTileAll();
        });

        this._windowRemovedId = activeWorkspace.connect('window-removed', () => {
            this._scheduleTileAll();
        });

        this._tileAllWindows();
    }

    _getMonitorWorkArea() {
        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();
        let monitorIndex = global.display.get_current_monitor();
        let workArea = activeWorkspace.get_work_area_for_monitor(monitorIndex);
        return workArea;
    }

    _getWindowsOnCurrentMonitor(includeMinimized = false) {
        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();
        let monitorIndex = global.display.get_current_monitor();
        let windows = [];

        let actors = global.get_window_actors();
        for (let actor of actors) {
            let win = actor.get_meta_window();
            if (!win) continue;

            if (win.get_workspace() !== activeWorkspace) continue;
            if (win.get_monitor() !== monitorIndex) continue;
            if (!includeMinimized && (win.minimized || win.is_hidden())) continue;
            if (win.get_window_type() !== Meta.WindowType.NORMAL) continue;

            // Skip windows that are transient dialogs (attached to another window)
            if (win.get_transient_for() !== null) continue;

            windows.push(win);
        }

        // Sort windows by their X position (left to right)
        windows.sort((a, b) => {
            let rectA = a.get_frame_rect();
            let rectB = b.get_frame_rect();
            return rectA.x - rectB.x;
        });

        return windows;
    }

    _tileAllWindows() {
        let windows = this._getWindowsOnCurrentMonitor(true);
        if (windows.length === 0) return;

        let workArea = this._getMonitorWorkArea();
        let count = windows.length;
        let windowHeight = workArea.height;

        let focusedWindow = global.display.get_focus_window();
        let focusedIndex = windows.indexOf(focusedWindow);

        // If the focused window is a transient dialog, find its parent
        if (focusedWindow && focusedWindow.get_transient_for() !== null) {
            focusedIndex = windows.indexOf(focusedWindow.get_transient_for());
        }

        // If focused window is not in our list, auto-focus the first window
        if (focusedIndex === -1) {
            focusedIndex = 0;
            let firstWindow = windows[0];
            firstWindow.unminimize();
            firstWindow.activate(global.get_current_time());
        }

        // Arrange windows so the focused window is in the center slot
        // For 3 windows: [left = (focusedIndex - 1), center = focusedIndex, right = (focusedIndex + 1)]
        // For 2 windows: [left = (focusedIndex - 1), center = focusedIndex]
        // For 1 window: [center = focusedIndex]
        let windowWidth = Math.floor(workArea.width / count);

        for (let i = 0; i < count; i++) {
            // Calculate which window goes in this slot
            // Slot 0 = left, slot 1 = center, slot 2 = right, etc.
            let offset = i - Math.floor(count / 2);
            let winIndex = (focusedIndex + offset + count) % count;
            let win = windows[winIndex];
            let x = workArea.x + (i * windowWidth);
            let y = workArea.y;
            win.move_resize_frame(true, x, y, windowWidth, windowHeight);
        }

        this._showOnlyFocusedWindow();
    }

    _tileFocusedWindowCentered() {
        let windows = this._getWindowsOnCurrentMonitor();
        if (windows.length === 0) return;

        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) return;

        let workArea = this._getMonitorWorkArea();
        let windowWidth = Math.floor(workArea.width * 0.95);
        let windowHeight = workArea.height;
        let x = workArea.x + Math.floor((workArea.width - windowWidth) / 2);
        let y = workArea.y;

        focusedWindow.move_resize_frame(true, x, y, windowWidth, windowHeight);
    }

    _getNeighborWindowTitles() {
        let windows = this._getWindowsOnCurrentMonitor(true);
        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow || windows.length <= 1)
            return {left: null, right: null};

        let currentIndex = windows.indexOf(focusedWindow);
        if (currentIndex === -1)
            return {left: null, right: null};

        let leftIndex = (currentIndex - 1 + windows.length) % windows.length;
        let rightIndex = (currentIndex + 1) % windows.length;

        return {
            left: windows[leftIndex].get_title() || '',
            right: windows[rightIndex].get_title() || '',
        };
    }

    _createNavButtons() {
        if (this._navButtons) {
            this._destroyNavButtons();
        }

        this._navButtons = {left: null, right: null};

        // Left nav button (focus arrow only)
        this._navButtons.left = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        this._navButtons.left._icon = new St.Icon({
            icon_name: 'pan-start-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        this._navButtons.left.add_child(this._navButtons.left._icon);
        this._navButtons.left.connect('clicked', () => this._focusLeft());

        // Left swap button (shuffle icon, separate sibling)
        this._navButtons.left._swapButton = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        this._navButtons.left._swapButton._icon = new St.Icon({
            icon_name: 'media-playlist-shuffle-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        this._navButtons.left._swapButton.add_child(this._navButtons.left._swapButton._icon);
        this._navButtons.left._swapButton.connect('clicked', () => this._swapLeft());

        // Left title label (sibling of button, not child)
        this._navButtons.left._titleLabel = new St.Label({
            text: '',
            style_class: 'horizontal-tiler-nav-title',
        });
        // Rotate 90 degrees so text reads vertically
        this._navButtons.left._titleLabel.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -90);
        // Set rotation pivot to top-left so positioning is predictable
        this._navButtons.left._titleLabel.set_pivot_point(0, 0);

        // Right nav button (focus arrow only)
        this._navButtons.right = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        this._navButtons.right._icon = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        this._navButtons.right.add_child(this._navButtons.right._icon);
        this._navButtons.right.connect('clicked', () => this._focusRight());

        // Right swap button (shuffle icon, separate sibling)
        this._navButtons.right._swapButton = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        this._navButtons.right._swapButton._icon = new St.Icon({
            icon_name: 'media-playlist-shuffle-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        this._navButtons.right._swapButton.add_child(this._navButtons.right._swapButton._icon);
        this._navButtons.right._swapButton.connect('clicked', () => this._swapRight());

        // Right title label (sibling of button, not child)
        this._navButtons.right._titleLabel = new St.Label({
            text: '',
            style_class: 'horizontal-tiler-nav-title',
        });
        // Rotate 90 degrees so text reads vertically
        this._navButtons.right._titleLabel.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -90);
        // Set rotation pivot to top-left so positioning is predictable
        this._navButtons.right._titleLabel.set_pivot_point(0, 0);

        // Add above all windows (including popups) - buttons and labels as siblings
        Main.layoutManager.addTopChrome(this._navButtons.left);
        Main.layoutManager.addTopChrome(this._navButtons.left._swapButton);
        Main.layoutManager.addTopChrome(this._navButtons.left._titleLabel);
        Main.layoutManager.addTopChrome(this._navButtons.right);
        Main.layoutManager.addTopChrome(this._navButtons.right._swapButton);
        Main.layoutManager.addTopChrome(this._navButtons.right._titleLabel);
    }

    _positionNavButtons() {
        if (!this._navButtons || !this._navButtons.left || !this._navButtons.right)
            return;

        let workArea = this._getMonitorWorkArea();
        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) {
            this._navButtons.left.hide();
            this._navButtons.right.hide();
            if (this._navButtons.left._titleLabel)
                this._navButtons.left._titleLabel.hide();
            if (this._navButtons.right._titleLabel)
                this._navButtons.right._titleLabel.hide();
            if (this._navButtons.left._swapButton)
                this._navButtons.left._swapButton.hide();
            if (this._navButtons.right._swapButton)
                this._navButtons.right._swapButton.hide();
            return;
        }

        let windowWidth = Math.floor(workArea.width * 0.95);
        let marginWidth = Math.floor((workArea.width - windowWidth) / 2);
        let windowHeight = workArea.height;

        // Update neighbor window titles (rotated 90 degrees)
        let titles = this._getNeighborWindowTitles();
        if (this._navButtons.left._titleLabel) {
            this._navButtons.left._titleLabel.text = titles.left || '';
        }
        if (this._navButtons.right._titleLabel) {
            this._navButtons.right._titleLabel.text = titles.right || '';
        }

        // Position left button in the left margin (icon only)
        this._navButtons.left.set_position(workArea.x, workArea.y);
        this._navButtons.left.set_size(marginWidth, windowHeight);
        this._navButtons.left.show();

        // Position focus icon at the top of the margin
        let iconSize = 48;
        let iconX = Math.floor((marginWidth - iconSize) / 2);
        let iconY = 8; // 8px from top
        this._navButtons.left._icon.set_position(iconX, iconY);
        this._navButtons.left._icon.set_size(iconSize, iconSize);

        // Position rotated title label starting at 25% from the bottom of the margin
        // The label is rotated -90 degrees with pivot at (0,0), so the text
        // extends downward from the position. Clamp width to 50% of monitor height.
        let text = titles.left || '';
        let visualWidth = 18; // approximate visual width after -90 rotation
        let labelX = workArea.x + Math.floor((marginWidth - visualWidth) / 2); // horizontally centered
        let labelY = workArea.y + Math.floor(windowHeight * 0.75); // 25% from bottom
        this._navButtons.left._titleLabel.set_position(labelX, Math.max(workArea.y, labelY));
        this._navButtons.left._titleLabel.show();
        this._navButtons.left._titleLabel.set_width(Math.floor(windowHeight * 0.5));

        // Position swap button at the bottom of the margin (absolute screen coordinates)
        let swapIconY = windowHeight - iconSize - 8;
        let swapAbsX = workArea.x + iconX;
        let swapAbsY = workArea.y + swapIconY;
        this._navButtons.left._swapButton.set_position(swapAbsX, swapAbsY);
        this._navButtons.left._swapButton.set_size(iconSize, iconSize);
        if (this._navButtons.left._swapButton._icon) {
            this._navButtons.left._swapButton._icon.set_position(0, 0);
            this._navButtons.left._swapButton._icon.set_size(iconSize, iconSize);
        }
        this._navButtons.left._swapButton.show();

        // Position right button in the right margin (icon only)
        this._navButtons.right.set_position(workArea.x + marginWidth + windowWidth, workArea.y);
        this._navButtons.right.set_size(marginWidth, windowHeight);
        this._navButtons.right.show();

        // Position focus icon at the top of the margin
        this._navButtons.right._icon.set_position(iconX, iconY);
        this._navButtons.right._icon.set_size(iconSize, iconSize);

        // Position rotated title label starting at 25% from the bottom of the margin
        text = titles.right || '';
        labelX = workArea.x + marginWidth + windowWidth + Math.floor((marginWidth - visualWidth) / 2);
        labelY = workArea.y + Math.floor(windowHeight * 0.75); // 25% from bottom
        this._navButtons.right._titleLabel.set_position(labelX, Math.max(workArea.y, labelY));
        this._navButtons.right._titleLabel.show();
        this._navButtons.right._titleLabel.set_width(Math.floor(windowHeight * 0.5));

        // Position swap button at the bottom of the margin (absolute screen coordinates)
        let rightSwapAbsX = workArea.x + marginWidth + windowWidth + iconX;
        let rightSwapAbsY = workArea.y + swapIconY;
        this._navButtons.right._swapButton.set_position(rightSwapAbsX, rightSwapAbsY);
        this._navButtons.right._swapButton.set_size(iconSize, iconSize);
        if (this._navButtons.right._swapButton._icon) {
            this._navButtons.right._swapButton._icon.set_position(0, 0);
            this._navButtons.right._swapButton._icon.set_size(iconSize, iconSize);
        }
        this._navButtons.right._swapButton.show();
    }

    _destroyNavButtons() {
        if (!this._navButtons) return;
        if (this._navButtons.left) {
            if (this._navButtons.left._titleLabel) {
                this._navButtons.left._titleLabel.destroy();
                this._navButtons.left._titleLabel = null;
            }
            if (this._navButtons.left._swapButton) {
                this._navButtons.left._swapButton.destroy();
                this._navButtons.left._swapButton = null;
            }
            this._navButtons.left.destroy();
            this._navButtons.left = null;
        }
        if (this._navButtons.right) {
            if (this._navButtons.right._titleLabel) {
                this._navButtons.right._titleLabel.destroy();
                this._navButtons.right._titleLabel = null;
            }
            if (this._navButtons.right._swapButton) {
                this._navButtons.right._swapButton.destroy();
                this._navButtons.right._swapButton = null;
            }
            this._navButtons.right.destroy();
            this._navButtons.right = null;
        }
        this._navButtons = null;
    }

    _showOnlyFocusedWindow() {
        // Guard against re-entrant calls triggered by minimize/unminimize signals
        if (this._hidingWindows) return;
        this._hidingWindows = true;

        // Disable animations to prevent jarring minimize/unminimize effects
        let settings = St.Settings.get();
        settings.inhibit_animations();

        try {
            let windows = this._getWindowsOnCurrentMonitor(true);
            if (windows.length === 0) return;

            let focusedWindow = global.display.get_focus_window();

            // If the focused window is a transient dialog (e.g. a confirmation dialog),
            // find its parent window and use that as the effective focused window
            let effectiveFocused = focusedWindow;
            if (focusedWindow && focusedWindow.get_transient_for() !== null) {
                effectiveFocused = focusedWindow.get_transient_for();
            }

            // If the effective focused window is not in our tiling list, bail out
            if (!effectiveFocused || windows.indexOf(effectiveFocused) === -1) {
                return;
            }

            for (let win of windows) {
                if (win === effectiveFocused) {
                    // Show the focused window, centered at 90% width
                    win.unminimize();
                    win.raise();
                    this._tileFocusedWindowCentered();
                } else {
                    // Minimize all other windows
                    win.minimize();
                }
            }

            // Create and position navigation buttons if there are multiple windows
            if (windows.length > 1) {
                if (!this._navButtons) {
                    this._createNavButtons();
                }
                this._positionNavButtons();
            } else {
                this._destroyNavButtons();
            }
        } finally {
            settings.uninhibit_animations();
            this._hidingWindows = false;
        }
    }

    _tileFocusedWindow() {
        let windows = this._getWindowsOnCurrentMonitor();
        if (windows.length === 0) return;

        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) return;

        let index = windows.indexOf(focusedWindow);
        if (index === -1) return;

        let workArea = this._getMonitorWorkArea();
        let count = windows.length;
        let windowWidth = Math.floor(workArea.width / count);
        let windowHeight = workArea.height;

        let x = workArea.x + (index * windowWidth);
        let y = workArea.y;

        focusedWindow.move_resize_frame(true, x, y, windowWidth, windowHeight);
    }

    _resetAllWindows() {
        let windows = this._getWindowsOnCurrentMonitor();
        if (windows.length === 0) return;

        let workArea = this._getMonitorWorkArea();

        for (let i = 0; i < windows.length; i++) {
            let win = windows[i];
            let width = Math.floor(workArea.width * 0.6);
            let height = Math.floor(workArea.height * 0.8);
            let x = workArea.x + Math.floor((workArea.width - width) / 2);
            let y = workArea.y + Math.floor((workArea.height - height) / 2);

            win.move_resize_frame(true, x, y, width, height);
        }
    }

    _focusLeft() {
        let windows = this._getWindowsOnCurrentMonitor(true);
        if (windows.length === 0) return;

        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) return;

        let currentIndex = windows.indexOf(focusedWindow);
        if (currentIndex === -1) return;

        let targetIndex = (currentIndex - 1 + windows.length) % windows.length;
        let targetWindow = windows[targetIndex];

        // Unminimize and activate the target window
        targetWindow.unminimize();
        targetWindow.activate(global.get_current_time());
    }

    _focusRight() {
        let windows = this._getWindowsOnCurrentMonitor(true);
        if (windows.length === 0) return;

        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) return;

        let currentIndex = windows.indexOf(focusedWindow);
        if (currentIndex === -1) return;

        let targetIndex = (currentIndex + 1) % windows.length;
        let targetWindow = windows[targetIndex];

        // Unminimize and activate the target window
        targetWindow.unminimize();
        targetWindow.activate(global.get_current_time());
    }

    _swapLeft() {
        let windows = this._getWindowsOnCurrentMonitor(true);
        if (windows.length < 2) return;

        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) return;

        let currentIndex = windows.indexOf(focusedWindow);
        if (currentIndex === -1) return;

        let targetIndex = (currentIndex - 1 + windows.length) % windows.length;
        let targetWindow = windows[targetIndex];

        // Swap the positions of the two windows
        let focusedRect = focusedWindow.get_frame_rect();
        let targetRect = targetWindow.get_frame_rect();

        focusedWindow.move_resize_frame(true, targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        targetWindow.move_resize_frame(true, focusedRect.x, focusedRect.y, focusedRect.width, focusedRect.height);

        // Focus the window that was originally to the left (now at current position)
        targetWindow.activate(global.get_current_time());

        // Update nav buttons to reflect new neighbor titles
        if (this._navButtons) {
            this._positionNavButtons();
        }
    }

    _swapRight() {
        let windows = this._getWindowsOnCurrentMonitor(true);
        if (windows.length < 2) return;

        let focusedWindow = global.display.get_focus_window();
        if (!focusedWindow) return;

        let currentIndex = windows.indexOf(focusedWindow);
        if (currentIndex === -1) return;

        let targetIndex = (currentIndex + 1) % windows.length;
        let targetWindow = windows[targetIndex];

        // Swap the positions of the two windows
        let focusedRect = focusedWindow.get_frame_rect();
        let targetRect = targetWindow.get_frame_rect();

        focusedWindow.move_resize_frame(true, targetRect.x, targetRect.y, targetRect.width, targetRect.height);
        targetWindow.move_resize_frame(true, focusedRect.x, focusedRect.y, focusedRect.width, focusedRect.height);

        // Focus the window that was originally to the right (now at current position)
        targetWindow.activate(global.get_current_time());

        // Update nav buttons to reflect new neighbor titles
        if (this._navButtons) {
            this._positionNavButtons();
        }
    }
}
