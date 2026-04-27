// Horizontal Tiler - Tiling Manager
// Handles enable/disable lifecycle, keybindings, and signal connections

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class TilingManager {
    /**
     * Constructs the TilingManager.
     * Stores a reference to the parent extension and initialises signal handler IDs
     * and state flags to their default (disabled) values.
     *
     * @param {object} extension - The parent HorizontalTilerExtension instance.
     */
    constructor(extension) {
        this._extension = extension;
        this._keybindingIds = [];
        this._tileEnabled = false;
        this._tileToggleItem = null;
        this._windowEnteredMonitorId = 0;
        this._windowLeftMonitorId = 0;
        this._minimizeId = 0;
        this._unminimizeId = 0;
        this._sizeChangedId = 0;
        this._unminimizingAll = false;
        this._schedulePending = false;
    }

    /**
     * Gets whether tiling is currently enabled.
     *
     * @returns {boolean} True if tiling is active, false otherwise.
     */
    get tileEnabled() {
        return this._tileEnabled;
    }

    /**
     * Registers all keyboard shortcuts (toggle-tiling, move-left, move-right,
     * swap-left, swap-right) with GNOME Shell's window manager keybinding system.
     * Each binding is stored in _keybindingIds for later cleanup.
     */
    _setupKeybindings() {
        let ext = this._extension;
        let actionMode = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;

        Main.wm.addKeybinding(
            'toggle-tiling',
            ext._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => this._toggleTiling()
        );
        this._keybindingIds.push('toggle-tiling');

        Main.wm.addKeybinding(
            'move-left',
            ext._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => ext._moveViewportLeft()
        );
        this._keybindingIds.push('move-left');

        Main.wm.addKeybinding(
            'move-right',
            ext._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => ext._moveViewportRight()
        );
        this._keybindingIds.push('move-right');

        Main.wm.addKeybinding(
            'swap-left',
            ext._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => ext._swapLeft()
        );
        this._keybindingIds.push('swap-left');

        Main.wm.addKeybinding(
            'swap-right',
            ext._settings,
            Meta.KeyBindingFlags.NONE,
            actionMode,
            () => ext._swapRight()
        );
        this._keybindingIds.push('swap-right');
    }

    /**
     * Removes all registered keybindings from GNOME Shell's window manager
     * and clears the _keybindingIds array.
     */
    _clearKeybindings() {
        if (!this._keybindingIds) return;
        for (let id of this._keybindingIds) {
            Main.wm.removeKeybinding(id);
        }
        this._keybindingIds = [];
    }

    /**
     * Toggles the tiling state between enabled and disabled.
     * Delegates to either _enableTiling() or _disableTiling().
     */
    _toggleTiling() {
        if (this._tileEnabled) {
            this._disableTiling();
        } else {
            this._enableTiling();
        }
    }

    /**
     * Activates tiling: updates the indicator style and menu label,
     * connects all GNOME Shell signals (window-entered-monitor,
     * window-left-monitor, minimize, unminimize, workareas-changed),
     * and triggers an initial tile layout.
     */
    _enableTiling() {
        if (this._tileEnabled) return;
        this._tileEnabled = true;

        let ext = this._extension;

        if (ext._indicator) {
            ext._indicator.add_style_pseudo_class('checked');
        }
        if (this._tileToggleItem) {
            this._tileToggleItem.label.text = '✓ Tile All Windows';
        }

        this._windowEnteredMonitorId = global.display.connect('window-entered-monitor', (display, win, monitor) => {
            if (!ext._suppressSchedule && win && win.get_window_type() === Meta.WindowType.NORMAL &&
                win.get_transient_for() === null) {
                // Handle panel/taskbar window clicks: swap the activated window
                // into the display order
                ext._onWindowActivated(win);
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

        this._sizeChangedId = global.display.connect('workareas-changed', () => {
            if (this._tileEnabled) {
                this._scheduleTileAll();
            }
        });

        ext._refreshLayout();
    }

    /**
     * Deactivates tiling: updates the indicator style and menu label,
     * unminimises all windows, destroys navigation buttons, and disconnects
     * all GNOME Shell signals.
     */
    _disableTiling() {
        if (!this._tileEnabled) return;
        this._tileEnabled = false;

        let ext = this._extension;

        if (ext._indicator) {
            ext._indicator.remove_style_pseudo_class('checked');
        }
        if (this._tileToggleItem) {
            this._tileToggleItem.label.text = 'Tile All Windows';
        }

        // Unminimize all windows when disabling tiling
        this._unminimizeAllWindows();

        // Destroy navigation buttons
        ext._navButtons.destroyAll();

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
        if (this._sizeChangedId > 0) {
            global.display.disconnect(this._sizeChangedId);
            this._sizeChangedId = 0;
        }


    }

    /**
     * Unminimises all NORMAL-type, non-transient windows on the current monitor.
     * Uses a re-entrancy guard (_unminimizingAll) to prevent recursive calls.
     */
    _unminimizeAllWindows() {
        if (this._unminimizingAll) return;
        this._unminimizingAll = true;

        try {
            let windows = this._extension._getAllWindows(true);
            for (let win of windows) {
                win.unminimize();
            }
        } finally {
            this._unminimizingAll = false;
        }
    }

    /**
     * Schedules a tile-all operation to run before the next compositor redraw.
     * Uses a pending flag to debounce multiple rapid requests.
     * The operation is skipped if tiling is disabled, windows are being hidden,
     * or scheduling is suppressed.
     */
    _scheduleTileAll() {
        if (this._schedulePending || this._extension._suppressSchedule) return;
        this._schedulePending = true;
        let laters = global.compositor.get_laters();
        laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._schedulePending = false;
            if (this._tileEnabled && !this._extension._hidingWindows && !this._extension._suppressSchedule) {
                this._extension._refreshLayout();
            }
        });
    }
}
