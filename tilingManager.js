// Horizontal Tiler - Tiling Manager
// Handles enable/disable lifecycle, keybindings, and signal connections

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class TilingManager {
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

    get tileEnabled() {
        return this._tileEnabled;
    }

    enable() {
        let ext = this._extension;
        ext._settings = ext.getSettings('org.gnome.shell.extensions.horizontal-tiler');

        ext._indicator = new PanelMenu.Button(0.0);

        let icon = new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        });
        ext._indicator.add_child(icon);

        // Tile All (toggle)
        this._tileToggleItem = new PopupMenu.PopupMenuItem('Tile All Windows');
        this._tileToggleItem.connect('activate', () => {
            this._toggleTiling();
        });
        ext._indicator.menu.addMenuItem(this._tileToggleItem);

        Main.panel.addToStatusArea(ext.metadata.uuid, ext._indicator, 1, 'right');

        this._setupKeybindings();

        // Enable tiling by default
        this._enableTiling();
    }

    disable() {
        this._disableTiling();
        if (this._extension._indicator) {
            this._extension._indicator.destroy();
            this._extension._indicator = null;
        }
        this._clearKeybindings();
        if (this._extension._settings) {
            this._extension._settings = null;
        }
    }

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

        this._sizeChangedId = global.display.connect('workareas-changed', () => {
            if (this._tileEnabled) {
                this._scheduleTileAll();
            }
        });

        ext._tileAllWindows();
    }

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

    _unminimizeAllWindows() {
        if (this._unminimizingAll) return;
        this._unminimizingAll = true;

        try {
            let windows = this._extension._getWindowsOnCurrentMonitor(true);
            for (let win of windows) {
                win.unminimize();
            }
        } finally {
            this._unminimizingAll = false;
        }
    }

    _scheduleTileAll() {
        if (this._schedulePending || this._extension._suppressSchedule) return;
        this._schedulePending = true;
        let laters = global.compositor.get_laters();
        laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._schedulePending = false;
            if (this._tileEnabled && !this._extension._hidingWindows && !this._extension._suppressSchedule) {
                this._extension._tileAllWindows();
            }
        });
    }
}
