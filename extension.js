// Horizontal Tiler - GNOME Shell Extension for GNOME 46
// Tiles windows horizontally across the screen

import Meta from 'gi://Meta';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {NavButtons} from './navButtons.js';
import {TilingManager} from './tilingManager.js';

export default class HorizontalTilerExtension extends Extension {
    /**
     * Constructs the extension instance.
     * Initialises all state properties including navigation buttons, tiling manager,
     * window ordering, displayed windows tracking, and the current viewport index.
     *
     * @param {object} metadata - Extension metadata object provided by GNOME Shell.
     */
    constructor(metadata) {
        super(metadata);
        this._hidingWindows = false;
        this._suppressSchedule = false;
        this._navButtons = new NavButtons(this);
        this._tilingManager = new TilingManager(this);
        this._settings = null;
        this._indicator = null;
        this._windowOrder = []; // Custom ordering of windows (by stable sequence)
        this._displayedWindows = {}; // monitor ID -> window index in all-windows array
        this._currentIndex = 0; // Current index in the window order for the leftmost monitor
        this._swappingFromClick = false; // Re-entrancy guard for window activation handler
    }

    /**
     * Enables the extension: loads settings, creates the panel indicator with
     * a toggle menu item, registers keybindings, and activates tiling by default.
     * Called by GNOME Shell when the extension is activated.
     */
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
            this._tilingManager._toggleTiling();
        });
        this._indicator.menu.addMenuItem(this._tileToggleItem);

        Main.panel.addToStatusArea(this.metadata.uuid, this._indicator, 1, 'right');

        this._tilingManager._setupKeybindings();

        // Enable tiling by default
        this._tilingManager._enableTiling();
    }

    /**
     * Disables the extension: deactivates tiling, destroys the panel indicator,
     * clears all keybindings, and releases the settings object.
     * Called by GNOME Shell when the extension is deactivated.
     */
    disable() {
        this._tilingManager._disableTiling();
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._tilingManager._clearKeybindings();
        if (this._settings) {
            this._settings = null;
        }
        this._navButtons.destroyAll();
    }

    /**
     * Retrieves all NORMAL-type, non-transient windows across all monitors.
     * Windows are returned in the custom order defined by _windowOrder (stable sequence).
     * New windows not yet in the order are appended, and stale entries are pruned.
     *
     * @param {boolean} [includeMinimized=false] - Whether to include minimized/hidden windows.
     * @returns {Meta.Window[]} Array of all window objects in the custom display order.
     */
    _getAllWindows(includeMinimized = false) {
        let windows = [];

        let actors = global.get_window_actors();
        for (let actor of actors) {
            let win = actor.get_meta_window();
            if (!win) continue;

            if (!includeMinimized && (win.minimized || win.is_hidden())) continue;
            if (win.get_window_type() !== Meta.WindowType.NORMAL) continue;
            if (win.get_transient_for() !== null) continue;

            windows.push(win);
        }

        if (this._windowOrder && this._windowOrder.length > 0) {
            let seqMap = new Map();
            for (let win of windows) {
                seqMap.set(win.get_stable_sequence(), win);
            }

            let orderedWindows = [];
            let seen = new Set();
            for (let seq of this._windowOrder) {
                if (seqMap.has(seq)) {
                    orderedWindows.push(seqMap.get(seq));
                    seen.add(seq);
                }
            }
            for (let win of windows) {
                if (!seen.has(win.get_stable_sequence())) {
                    orderedWindows.push(win);
                    this._windowOrder.push(win.get_stable_sequence());
                }
            }

            this._windowOrder = this._windowOrder.filter(seq => seqMap.has(seq));

            return orderedWindows;
        } else {
            windows.sort((a, b) => {
                return a.get_stable_sequence() - b.get_stable_sequence();
            });
            this._windowOrder = windows.map(w => w.get_stable_sequence());
            return windows;
        }
    }

    /**
     * Positions a single window on the specified monitor according to tiling rules.
     * On the leftmost monitor the window is inset slightly from the left edge;
     * on the rightmost monitor it is inset from the right edge;
     * on middle monitors it fills the full work area width.
     * The window is unminimised, unmaximised if needed, resized, and raised.
     *
     * @param {Meta.Window} win - The window to position.
     * @param {number} monitorId - The target monitor ID.
     */
    _positionWindow(win, monitorId) {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(monitorId);
        let title = win.get_title() || 'untitled';
        console.log(`[HorizontalTiler] Moving "${title}" to monitor ${monitorId}`);

        let nMonitors = global.display.get_n_monitors();
        let monitorRects = [];
        for (let m = 0; m < nMonitors; m++) {
            let rect = global.display.get_monitor_geometry(m);
            monitorRects.push({id: m, x: rect.x});
        }
        monitorRects.sort((a, b) => a.x - b.x);
        let isLeftmost = monitorRects[0].id === monitorId;
        let isRightmost = monitorRects[monitorRects.length - 1].id === monitorId;

        let windowWidth, x;
        if (isLeftmost) {
            windowWidth = Math.floor(workArea.width * 0.975);
            x = workArea.x + Math.floor(workArea.width * 0.025);
        } else if (isRightmost) {
            windowWidth = Math.floor(workArea.width * 0.975);
            x = workArea.x;
        } else {
            windowWidth = workArea.width;
            x = workArea.x;
        }

        let windowHeight = workArea.height;
        let y = workArea.y;
        win.unminimize();
        if (win.get_maximized()) {
            win.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        win.move_frame(true, x, y);
        win.move_resize_frame(true, x, y, windowWidth, windowHeight);
        win.raise();
    }

    /**
     * Displays the window at the given index in the global window order on the specified monitor.
     * Updates the _displayedWindows tracking map.
     *
     * @param {number} windowIndex - Index into the _getAllWindows() array.
     * @param {number} monitorId - The monitor on which to show the window.
     */
    _showWindow(windowIndex, monitorId) {
        let allWindows = this._getAllWindows(true);
        if (windowIndex < 0 || windowIndex >= allWindows.length) return;

        let win = allWindows[windowIndex];
        this._positionWindow(win, monitorId);
        this._displayedWindows[monitorId] = windowIndex;
    }

    /**
     * Refreshes the entire tiling layout: hides all windows, then shows the
     * current window on the leftmost monitor and (if available) the next window
     * on the rightmost monitor. Animations are inhibited during the operation.
     * Navigation buttons are positioned or destroyed based on window count.
     */
    _refreshLayout() {
        if (this._hidingWindows) return;
        this._hidingWindows = true;

        let settings = St.Settings.get();
        settings.inhibit_animations();

        try {
            let allWindows = this._getAllWindows(true);
            if (allWindows.length === 0) return;

            let nMonitors = global.display.get_n_monitors();

            let leftmostMonitor = this._getLeftmostMonitor();
            let currentIndex = this._currentIndex;
            if (currentIndex >= allWindows.length) {
                currentIndex = 0;
                this._currentIndex = 0;
            }

            this._displayedWindows = {};

            // Hide all windows first
            for (let win of allWindows) {
                win.minimize();
            }

            this._showWindow(currentIndex, leftmostMonitor);

            if (allWindows.length >= 2 && nMonitors >= 2) {
                let rightmostMonitor = this._getRightmostMonitor();
                let nextIndex = (currentIndex + 1) % allWindows.length;
                this._showWindow(nextIndex, rightmostMonitor);
            }

            allWindows[currentIndex].activate(global.get_current_time());

            if (allWindows.length > 1) {
                this._navButtons.positionAll();
            } else {
                this._navButtons.destroyAll();
            }
        } finally {
            settings.uninhibit_animations();
            this._hidingWindows = false;
        }
    }

    /**
     * Determines the ID of the leftmost monitor by sorting monitors by their X position.
     *
     * @returns {number} The monitor ID of the leftmost physical display.
     */
    _getLeftmostMonitor() {
        let nMonitors = global.display.get_n_monitors();
        let monitorRects = [];
        for (let m = 0; m < nMonitors; m++) {
            let rect = global.display.get_monitor_geometry(m);
            monitorRects.push({id: m, x: rect.x});
        }
        monitorRects.sort((a, b) => a.x - b.x);
        return monitorRects[0].id;
    }

    /**
     * Determines the ID of the rightmost monitor by sorting monitors by their X position.
     *
     * @returns {number} The monitor ID of the rightmost physical display.
     */
    _getRightmostMonitor() {
        let nMonitors = global.display.get_n_monitors();
        let monitorRects = [];
        for (let m = 0; m < nMonitors; m++) {
            let rect = global.display.get_monitor_geometry(m);
            monitorRects.push({id: m, x: rect.x});
        }
        monitorRects.sort((a, b) => a.x - b.x);
        return monitorRects[monitorRects.length - 1].id;
    }

    /**
     * Moves the viewport one window to the left (decrements the current index).
     * Hides all windows, positions the new current window on the leftmost monitor,
     * and the next window on the rightmost monitor if available.
     * Animations are inhibited and scheduled tiling is suppressed during the operation.
     */
    _moveViewportLeft() {
        if (this._hidingWindows) return;
        this._hidingWindows = true;
        this._suppressSchedule = true;

        let settings = St.Settings.get();
        settings.inhibit_animations();

        try {
            let allWindows = this._getAllWindows(true);
            if (allWindows.length === 0) return;

            let leftmostMonitor = this._getLeftmostMonitor();
            let rightmostMonitor = this._getRightmostMonitor();

            this._currentIndex = (this._currentIndex - 1 + allWindows.length) % allWindows.length;

            // Hide all windows first
            for (let win of allWindows) {
                win.minimize();
            }

            this._positionWindow(allWindows[this._currentIndex], leftmostMonitor);

            if (allWindows.length >= 2 && leftmostMonitor !== rightmostMonitor) {
                let rightIndex = (this._currentIndex + 1) % allWindows.length;
                this._positionWindow(allWindows[rightIndex], rightmostMonitor);
            }

            this._displayedWindows[leftmostMonitor] = this._currentIndex;
            if (leftmostMonitor !== rightmostMonitor) {
                this._displayedWindows[rightmostMonitor] = (this._currentIndex + 1) % allWindows.length;
            }

            allWindows[this._currentIndex].activate(global.get_current_time());

            this._navButtons.positionAll();
        } finally {
            settings.uninhibit_animations();
            this._hidingWindows = false;
            this._suppressSchedule = false;
        }
    }

    /**
     * Moves the viewport one window to the right (increments the current index).
     * Hides all windows, positions the new current window on the leftmost monitor,
     * and the next window on the rightmost monitor if available.
     * Animations are inhibited and scheduled tiling is suppressed during the operation.
     */
    _moveViewportRight() {
        if (this._hidingWindows) return;
        this._hidingWindows = true;
        this._suppressSchedule = true;

        let settings = St.Settings.get();
        settings.inhibit_animations();

        try {
            let allWindows = this._getAllWindows(true);
            if (allWindows.length === 0) return;

            let leftmostMonitor = this._getLeftmostMonitor();
            let rightmostMonitor = this._getRightmostMonitor();

            this._currentIndex = (this._currentIndex + 1) % allWindows.length;

            // Hide all windows first
            for (let win of allWindows) {
                win.minimize();
            }

            this._positionWindow(allWindows[this._currentIndex], leftmostMonitor);

            if (allWindows.length >= 2 && leftmostMonitor !== rightmostMonitor) {
                let rightIndex = (this._currentIndex + 1) % allWindows.length;
                this._positionWindow(allWindows[rightIndex], rightmostMonitor);
            }

            this._displayedWindows[leftmostMonitor] = this._currentIndex;
            if (leftmostMonitor !== rightmostMonitor) {
                this._displayedWindows[rightmostMonitor] = (this._currentIndex + 1) % allWindows.length;
            }

            allWindows[this._currentIndex].activate(global.get_current_time());

            this._navButtons.positionAll();
        } finally {
            settings.uninhibit_animations();
            this._hidingWindows = false;
            this._suppressSchedule = false;
        }
    }

    /**
     * Handles a window being activated by the user (e.g., via panel/taskbar click).
     * When a window that is not currently displayed is activated, this swaps it
     * with the currently focused (displayed) window in the window order.
     * The activated window then appears on the monitor where the previous focus
     * window was displayed, and the previous focus window moves to the position
     * in the order that the activated window occupied.
     *
     * @param {Meta.Window} activatedWindow - The window the user activated.
     */
    _onWindowActivated(activatedWindow) {
        if (this._swappingFromClick) return;
        if (!activatedWindow) return;
        if (activatedWindow.get_window_type() !== Meta.WindowType.NORMAL) return;
        if (activatedWindow.get_transient_for() !== null) return;

        // Only handle if tiling is enabled
        if (!this._tilingManager.tileEnabled) return;

        let allWindows = this._getAllWindows(true);
        if (allWindows.length < 2) return;

        // Find the currently focused/displayed window (the one on the leftmost monitor)
        let leftmostMonitor = this._getLeftmostMonitor();
        let currentDisplayedIndex = this._displayedWindows[leftmostMonitor];
        if (currentDisplayedIndex === undefined) return;

        let currentDisplayedWin = allWindows[currentDisplayedIndex];
        if (!currentDisplayedWin) return;

        // If the activated window is already the displayed one, nothing to do
        if (activatedWindow === currentDisplayedWin) return;

        // Find the activated window in our order
        let activatedSeq = activatedWindow.get_stable_sequence();
        let displayedSeq = currentDisplayedWin.get_stable_sequence();

        let activatedOrderIndex = this._windowOrder.indexOf(activatedSeq);
        let displayedOrderIndex = this._windowOrder.indexOf(displayedSeq);

        if (activatedOrderIndex < 0 || displayedOrderIndex < 0) return;

        this._swappingFromClick = true;
        this._suppressSchedule = true;

        try {
            // Swap the two windows in the window order
            this._windowOrder[activatedOrderIndex] = displayedSeq;
            this._windowOrder[displayedOrderIndex] = activatedSeq;

            // Update _currentIndex to point to the activated window
            // so it appears on the leftmost monitor
            this._currentIndex = activatedOrderIndex;

            this._refreshLayout();
        } finally {
            this._swappingFromClick = false;
            this._suppressSchedule = false;
        }
    }

    /**
     * Swaps the currently displayed window with the window to its left in the
     * custom window order. The swap is performed by exchanging stable sequence
     * entries in _windowOrder, then refreshing the layout.
     */
    _swapLeft() {
        let allWindows = this._getAllWindows(true);
        if (allWindows.length < 2) return;

        let leftmostMonitor = this._getLeftmostMonitor();
        let currentIndex = this._displayedWindows[leftmostMonitor];
        if (currentIndex === undefined) {
            for (let i = 0; i < allWindows.length; i++) {
                if (!allWindows[i].minimized) {
                    currentIndex = i;
                    break;
                }
            }
            if (currentIndex === undefined) return;
        }

        let targetIndex = (currentIndex - 1 + allWindows.length) % allWindows.length;

        let seqA = allWindows[currentIndex].get_stable_sequence();
        let seqB = allWindows[targetIndex].get_stable_sequence();
        let orderIndexA = this._windowOrder.indexOf(seqA);
        let orderIndexB = this._windowOrder.indexOf(seqB);
        if (orderIndexA >= 0 && orderIndexB >= 0) {
            this._windowOrder[orderIndexA] = seqB;
            this._windowOrder[orderIndexB] = seqA;
        }

        this._refreshLayout();
    }

    /**
     * Swaps the currently displayed window with the window to its right in the
     * custom window order. The swap is performed by exchanging stable sequence
     * entries in _windowOrder, then refreshing the layout.
     */
    _swapRight() {
        let allWindows = this._getAllWindows(true);
        if (allWindows.length < 2) return;

        let rightmostMonitor = this._getRightmostMonitor();
        let currentIndex = this._displayedWindows[rightmostMonitor];
        if (currentIndex === undefined) {
            for (let i = 0; i < allWindows.length; i++) {
                if (!allWindows[i].minimized) {
                    currentIndex = i;
                    break;
                }
            }
            if (currentIndex === undefined) return;
        }

        let targetIndex = (currentIndex + 1) % allWindows.length;

        let seqA = allWindows[currentIndex].get_stable_sequence();
        let seqB = allWindows[targetIndex].get_stable_sequence();
        let orderIndexA = this._windowOrder.indexOf(seqA);
        let orderIndexB = this._windowOrder.indexOf(seqB);
        if (orderIndexA >= 0 && orderIndexB >= 0) {
            this._windowOrder[orderIndexA] = seqB;
            this._windowOrder[orderIndexB] = seqA;
        }

        this._refreshLayout();
    }
}
