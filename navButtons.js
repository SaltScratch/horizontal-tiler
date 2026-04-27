// Horizontal Tiler - Navigation Buttons
// On-screen navigation controls for the edge monitors

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class NavButtons {
    /**
     * Constructs the NavButtons manager.
     * Stores a reference to the parent extension and initialises an empty
     * map of navigation button groups keyed by monitor ID.
     *
     * @param {object} extension - The parent HorizontalTilerExtension instance.
     */
    constructor(extension) {
        this._extension = extension;
        this._navButtonsByMonitor = {}; // nav buttons keyed by monitor ID
    }

    /**
     * Retrieves the titles of the windows adjacent to the given (or currently
     * displayed) window in the global window order.
     *
     * @param {Meta.Window|null} [forWindow=null] - The reference window; if null,
     *     the window displayed on the leftmost monitor is used.
     * @returns {{left: string|null, right: string|null}} An object with the titles
     *     of the left and right neighbour windows, or null if unavailable.
     */
    _getNeighborWindowTitles(forWindow = null) {
        let windows = this._extension._getAllWindows(true);
        if (windows.length <= 1)
            return {left: null, right: null};

        let currentIndex;
        if (forWindow) {
            currentIndex = windows.indexOf(forWindow);
        } else {
            // Use the displayed window on the leftmost monitor as reference
            let leftmostMonitor = this._extension._getLeftmostMonitor();
            currentIndex = this._extension._displayedWindows[leftmostMonitor];
        }

        if (currentIndex === undefined || currentIndex === -1)
            return {left: null, right: null};

        let leftIndex = (currentIndex - 1 + windows.length) % windows.length;
        let rightIndex = (currentIndex + 1) % windows.length;

        return {
            left: windows[leftIndex].get_title() || '',
            right: windows[rightIndex].get_title() || '',
        };
    }

    /**
     * Destroys all navigation buttons. Alias for destroyAll().
     */
    destroy() {
        this.destroyAll();
    }

    /**
     * Destroys all navigation buttons across every monitor and clears the
     * _navButtonsByMonitor map.
     */
    destroyAll() {
        for (let monitorId in this._navButtonsByMonitor) {
            this._destroyForMonitor(parseInt(monitorId));
        }
        this._navButtonsByMonitor = {};
    }

    /**
     * Destroys the navigation button group for a specific monitor, including
     * the left/right buttons, their swap buttons, and title labels.
     *
     * @param {number} monitorId - The monitor whose nav buttons to destroy.
     */
    _destroyForMonitor(monitorId) {
        let nav = this._navButtonsByMonitor[monitorId];
        if (!nav) return;
        if (nav.left) {
            if (nav.left._titleLabel) {
                nav.left._titleLabel.destroy();
                nav.left._titleLabel = null;
            }
            if (nav.left._swapButton) {
                nav.left._swapButton.destroy();
                nav.left._swapButton = null;
            }
            nav.left.destroy();
            nav.left = null;
        }
        if (nav.right) {
            if (nav.right._titleLabel) {
                nav.right._titleLabel.destroy();
                nav.right._titleLabel = null;
            }
            if (nav.right._swapButton) {
                nav.right._swapButton.destroy();
                nav.right._swapButton = null;
            }
            nav.right.destroy();
            nav.right = null;
        }
        delete this._navButtonsByMonitor[monitorId];
    }

    /**
     * Positions navigation buttons on all monitors that currently have
     * unminimised windows. Creates new button groups as needed and destroys
     * groups for monitors that no longer have windows.
     */
    positionAll() {
        let allWindows = this._extension._getAllWindows(true);
        if (allWindows.length <= 1) {
            this.destroyAll();
            return;
        }

        // Find which monitors have windows
        let monitorsWithWindows = new Set();
        for (let win of allWindows) {
            if (!win.minimized) {
                monitorsWithWindows.add(win.get_monitor());
            }
        }

        // Create/position nav buttons for each monitor that has a window
        for (let monitorId of monitorsWithWindows) {
            if (!this._navButtonsByMonitor[monitorId]) {
                this._createForMonitor(monitorId);
            }
            this._positionForMonitor(monitorId);
        }

        // Destroy nav buttons for monitors that no longer have windows
        for (let monitorId in this._navButtonsByMonitor) {
            if (!monitorsWithWindows.has(parseInt(monitorId))) {
                this._destroyForMonitor(parseInt(monitorId));
            }
        }
    }

    /**
     * Creates the navigation button group for a given monitor, consisting of:
     * - A left arrow button (pan-start) with a swap button and a rotated title label
     * - A right arrow button (pan-end) with a swap button and a rotated title label
     * All elements are added to the top chrome layer.
     *
     * @param {number} monitorId - The monitor to create buttons for.
     */
    _createForMonitor(monitorId) {
        // Destroy existing buttons for this monitor if any
        this._destroyForMonitor(monitorId);

        let nav = {left: null, right: null};

        // Left nav button (arrow only)
        nav.left = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        nav.left._icon = new St.Icon({
            icon_name: 'pan-start-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        nav.left.add_child(nav.left._icon);
        nav.left.connect('clicked', () => this._extension._moveViewportLeft());

        // Left swap button (shuffle icon, separate sibling)
        nav.left._swapButton = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        nav.left._swapButton._icon = new St.Icon({
            icon_name: 'media-playlist-shuffle-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        nav.left._swapButton.add_child(nav.left._swapButton._icon);
        nav.left._swapButton.connect('clicked', () => this._extension._swapLeft());

        // Left title label (sibling of button, not child)
        nav.left._titleLabel = new St.Label({
            text: '',
            style_class: 'horizontal-tiler-nav-title',
        });
        // Rotate 90 degrees so text reads vertically
        nav.left._titleLabel.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -90);
        // Set rotation pivot to top-left so positioning is predictable
        nav.left._titleLabel.set_pivot_point(0, 0);

        // Right nav button (arrow only)
        nav.right = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        nav.right._icon = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        nav.right.add_child(nav.right._icon);
        nav.right.connect('clicked', () => this._extension._moveViewportRight());

        // Right swap button (shuffle icon, separate sibling)
        nav.right._swapButton = new St.Button({
            style_class: 'horizontal-tiler-nav-button',
            reactive: true,
            can_focus: false,
            track_hover: true,
        });

        nav.right._swapButton._icon = new St.Icon({
            icon_name: 'media-playlist-shuffle-symbolic',
            style_class: 'horizontal-tiler-nav-icon',
        });
        nav.right._swapButton.add_child(nav.right._swapButton._icon);
        nav.right._swapButton.connect('clicked', () => this._extension._swapRight());

        // Right title label (sibling of button, not child)
        nav.right._titleLabel = new St.Label({
            text: '',
            style_class: 'horizontal-tiler-nav-title',
        });
        // Rotate 90 degrees so text reads vertically
        nav.right._titleLabel.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, -90);
        // Set rotation pivot to top-left so positioning is predictable
        nav.right._titleLabel.set_pivot_point(0, 0);

        // Add above all windows (including popups) - buttons and labels as siblings
        Main.layoutManager.addTopChrome(nav.left);
        Main.layoutManager.addTopChrome(nav.left._swapButton);
        Main.layoutManager.addTopChrome(nav.left._titleLabel);
        Main.layoutManager.addTopChrome(nav.right);
        Main.layoutManager.addTopChrome(nav.right._swapButton);
        Main.layoutManager.addTopChrome(nav.right._titleLabel);

        this._navButtonsByMonitor[monitorId] = nav;
    }

    /**
     * Positions and shows/hides the navigation button group for a given monitor.
     * On the leftmost monitor only left controls (arrow, swap, title) are shown;
     * on the rightmost monitor only right controls are shown;
     * on middle monitors all controls are hidden.
     * Title labels display the neighbour window names, rotated 90 degrees.
     *
     * @param {number} monitorId - The monitor to position buttons for.
     */
    _positionForMonitor(monitorId) {
        let nav = this._navButtonsByMonitor[monitorId];
        if (!nav || !nav.left || !nav.right) return;

        let workArea = Main.layoutManager.getWorkAreaForMonitor(monitorId);

        let windowWidth = Math.floor(workArea.width * 0.95);
        let marginWidth = Math.floor((workArea.width - windowWidth) / 2);
        let windowHeight = workArea.height;

        // Find the window displayed on this monitor to get correct neighbor titles
        let allWindows = this._extension._getAllWindows(true);
        let windowOnThisMonitor = null;
        for (let win of allWindows) {
            if (!win.minimized && win.get_monitor() === monitorId) {
                windowOnThisMonitor = win;
                break;
            }
        }

        // Update neighbor window titles (rotated 90 degrees)
        let titles = this._getNeighborWindowTitles(windowOnThisMonitor);

        // Determine if this is the leftmost or rightmost monitor by X position
        let nMonitors = global.display.get_n_monitors();
        let monitorRects = [];
        for (let m = 0; m < nMonitors; m++) {
            let rect = global.display.get_monitor_geometry(m);
            monitorRects.push({id: m, x: rect.x});
        }
        monitorRects.sort((a, b) => a.x - b.x);
        let isLeftmost = monitorRects[0].id === monitorId;
        let isRightmost = monitorRects[monitorRects.length - 1].id === monitorId;

        // Position left button in the left margin (icon only)
        nav.left.set_position(workArea.x, workArea.y);
        nav.left.set_size(marginWidth, windowHeight);

        // Position arrow icon at the top of the margin
        let iconSize = 48;
        let iconX = Math.floor((marginWidth - iconSize) / 2);
        let iconY = 8; // 8px from top
        nav.left._icon.set_position(iconX, iconY);
        nav.left._icon.set_size(iconSize, iconSize);

        // Position rotated title label starting at 25% from the bottom of the margin
        let text = titles.left || '';
        let visualWidth = 18; // approximate visual width after -90 rotation
        let labelX = workArea.x + Math.floor((marginWidth - visualWidth) / 2); // horizontally centered
        let labelY = workArea.y + Math.floor(windowHeight * 0.75); // 25% from bottom
        nav.left._titleLabel.set_position(labelX, Math.max(workArea.y, labelY));
        nav.left._titleLabel.set_width(Math.floor(windowHeight * 0.5));

        // Position swap button at the bottom of the margin (absolute screen coordinates)
        let swapIconY = windowHeight - iconSize - 8;
        let swapAbsX = workArea.x + iconX;
        let swapAbsY = workArea.y + swapIconY;
        nav.left._swapButton.set_position(swapAbsX, swapAbsY);
        nav.left._swapButton.set_size(iconSize, iconSize);
        if (nav.left._swapButton._icon) {
            nav.left._swapButton._icon.set_position(0, 0);
            nav.left._swapButton._icon.set_size(iconSize, iconSize);
        }

        // Position right button in the right margin (icon only)
        nav.right.set_position(workArea.x + marginWidth + windowWidth, workArea.y);
        nav.right.set_size(marginWidth, windowHeight);

        // Position arrow icon at the top of the margin
        nav.right._icon.set_position(iconX, iconY);
        nav.right._icon.set_size(iconSize, iconSize);

        // Position rotated title label starting at 25% from the bottom of the margin
        text = titles.right || '';
        labelX = workArea.x + marginWidth + windowWidth + Math.floor((marginWidth - visualWidth) / 2);
        labelY = workArea.y + Math.floor(windowHeight * 0.75); // 25% from bottom
        nav.right._titleLabel.set_position(labelX, Math.max(workArea.y, labelY));
        nav.right._titleLabel.set_width(Math.floor(windowHeight * 0.5));

        // Position swap button at the bottom of the margin (absolute screen coordinates)
        let rightSwapAbsX = workArea.x + marginWidth + windowWidth + iconX;
        let rightSwapAbsY = workArea.y + swapIconY;
        nav.right._swapButton.set_position(rightSwapAbsX, rightSwapAbsY);
        nav.right._swapButton.set_size(iconSize, iconSize);
        if (nav.right._swapButton._icon) {
            nav.right._swapButton._icon.set_position(0, 0);
            nav.right._swapButton._icon.set_size(iconSize, iconSize);
        }

        // Show/hide controls based on monitor position
        // On the leftmost monitor: show left controls only (hide right controls)
        // On the rightmost monitor: show right controls only (hide left controls)
        // On middle monitors: hide both (navigation is done from edge monitors)
        if (isLeftmost) {
            // Hide right controls on the leftmost monitor
            nav.right.hide();
            if (nav.right._titleLabel) nav.right._titleLabel.hide();
            if (nav.right._swapButton) nav.right._swapButton.hide();
            // Show left controls
            nav.left.show();
            if (nav.left._titleLabel) {
                nav.left._titleLabel.text = titles.left || '';
                nav.left._titleLabel.show();
            }
            if (nav.left._swapButton) nav.left._swapButton.show();
        } else if (isRightmost) {
            // Hide left controls on the rightmost monitor
            nav.left.hide();
            if (nav.left._titleLabel) nav.left._titleLabel.hide();
            if (nav.left._swapButton) nav.left._swapButton.hide();
            // Show right controls
            nav.right.show();
            if (nav.right._titleLabel) {
                nav.right._titleLabel.text = titles.right || '';
                nav.right._titleLabel.show();
            }
            if (nav.right._swapButton) nav.right._swapButton.show();
        } else {
            // Middle monitors: hide both (navigation is done from edge monitors)
            nav.left.hide();
            if (nav.left._titleLabel) nav.left._titleLabel.hide();
            if (nav.left._swapButton) nav.left._swapButton.hide();
            nav.right.hide();
            if (nav.right._titleLabel) nav.right._titleLabel.hide();
            if (nav.right._swapButton) nav.right._swapButton.hide();
        }
    }
}
