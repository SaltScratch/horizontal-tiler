// Horizontal Tiler - GNOME Shell Extension for GNOME 46
// Tiles windows horizontally across the screen

import Meta from 'gi://Meta';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {NavButtons} from './navButtons.js';
import {TilingManager} from './tilingManager.js';

export default class HorizontalTilerExtension extends Extension {
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
    }

    enable() {
        this._tilingManager.enable();
    }

    disable() {
        this._tilingManager.disable();
        this._navButtons.destroyAll();
    }

    _tileAllWindows() {
        this._refreshLayout();
    }

    _getWindowsOnCurrentMonitor(includeMinimized = false) {
        let monitorIndex = global.display.get_current_monitor();
        let windows = [];

        let actors = global.get_window_actors();
        for (let actor of actors) {
            let win = actor.get_meta_window();
            if (!win) continue;

            if (win.get_monitor() !== monitorIndex) continue;
            if (!includeMinimized && (win.minimized || win.is_hidden())) continue;
            if (win.get_window_type() !== Meta.WindowType.NORMAL) continue;
            if (win.get_transient_for() !== null) continue;

            windows.push(win);
        }

        windows.sort((a, b) => {
            let rectA = a.get_frame_rect();
            let rectB = b.get_frame_rect();
            return rectA.x - rectB.x;
        });

        return windows;
    }

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

    _positionWindow(win, monitorId) {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(monitorId);

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
            win.unmaximize();
        }
        win.move_resize_frame(true, x, y, windowWidth, windowHeight);
        win.raise();
    }

    _showWindow(windowIndex, monitorId) {
        let allWindows = this._getAllWindows(true);
        if (windowIndex < 0 || windowIndex >= allWindows.length) return;

        let win = allWindows[windowIndex];
        this._positionWindow(win, monitorId);
        this._displayedWindows[monitorId] = windowIndex;
    }

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

    _swapRight() {
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
