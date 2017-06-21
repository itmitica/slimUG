/*
 * Arc Menu: The new applications menu for Gnome 3.
 *
 * Original work: Copyright (C) 2015 Giovanni Campagna
 * Modified work: Copyright (C) 2016-2017 Zorin OS Technologies Ltd.
 * Modified work: Copyright (C) 2017 LinxGem33. 
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *
 * Credits:
 * This file is based on code from the Gnome Applications Menu Extension by Giovanni Campagna.
 * Some code was also referenced from the Gnome Places Status Indicator by Giovanni Campagna
 * and Gno-Menu by The Panacea Projects.
 * These extensions can be found at the following URLs:
 * http://git.gnome.org/browse/gnome-shell-extensions/
 * https://github.com/The-Panacea-Projects/Gnomenu
 */


// Import Libraries
const Atk = imports.gi.Atk;
const GMenu = imports.gi.GMenu;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const Pango = imports.gi.Pango;
const AccountsService = imports.gi.AccountsService;
const Gio = imports.gi.Gio;
const Util = imports.misc.util;
const GnomeSession = imports.misc.gnomeSession;
const Gettext = imports.gettext.domain('zorinmenu');
const _ = Gettext.gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const SecondaryMenu = Me.imports.secondaryMenu;
const appSys = Shell.AppSystem.get_default();
const Tweener = imports.ui.tweener;
const DND = imports.ui.dnd;
const AppDisplay = imports.ui.appDisplay;
const Mainloop = imports.mainloop;
const LoginManager = imports.misc.loginManager;

// Menu Size variables
const APPLICATION_ICON_SIZE = 32;
const HORIZ_FACTOR = 5;
const NAVIGATION_REGION_OVERSHOOT = 50;
const MINIMUM_PADDING = 4;

// Menu Layout Enum
const visibleMenus = {
    ALL: 0,
    APPS_ONLY: 1,
    SYSTEM_ONLY: 2
};

// User Home directories
const DEFAULT_DIRECTORIES = [
    GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    GLib.UserDirectory.DIRECTORY_MUSIC,
    GLib.UserDirectory.DIRECTORY_PICTURES,
    GLib.UserDirectory.DIRECTORY_VIDEOS,
];

function setIconAsync(icon, gioFile, fallback_icon_name) {
  gioFile.load_contents_async(null, function(source, result) {
    try {
      let bytes = source.load_contents_finish(result)[1];
      icon.gicon = Gio.BytesIcon.new(bytes);
    }
    catch(err) {
      icon.icon_name = fallback_icon_name;
    }
  });
}

// Removing the default behaviour which selects a hovered item if the space key is pressed.
// This avoids issues when searching for an app with a space character in its name.
const BaseMenuItem = new Lang.Class({
    Name: 'BaseMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _onKeyPressEvent: function (actor, event) {
        let symbol = event.get_key_symbol();

        if (symbol == Clutter.KEY_Return) {
            this.activate(event);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});

// Menu item to launch GNOME activities overview
const ActivitiesMenuItem = new Lang.Class({
    Name: 'ActivitiesMenuItem',
    Extends: BaseMenuItem,

    // Initialize the menu item
    _init: function(button) {
	    this.parent();
        this._button = button;
        this._icon = new St.Icon({ icon_name: 'view-fullscreen-symbolic',
                                   style_class: 'popup-menu-icon',
                                   icon_size: 16});
        this.actor.add_child(this._icon);
        let label = new St.Label({ text: _("Activities Overview"), y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(label, { expand: true });
    },

    // Activate the menu item (Open activities overview)
    activate: function(event) {
        this._button.menu.toggle();
        Main.overview.toggle();
	    this.parent(event);
    },
});

// Power Button
const PowerButton = new Lang.Class({
    Name: 'PowerButton',

    // Initialize the button
    _init: function(button) {
        this._button = button;
        this.actor = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _("Power Off"),
            style_class: 'system-menu-action'
        });
        this.actor.child = new St.Icon({ icon_name: 'system-shutdown-symbolic' });
        this.actor.connect('clicked', Lang.bind(this, this._onClick));
    },

    // Activate the button (Shutdown)
    _onClick: function() {
        this._button.menu.toggle();
        this._button._session.ShutdownRemote(0);
    }
});

// Logout Button
const LogoutButton = new Lang.Class({
    Name: 'LogoutButton',

    // Initialize the button
    _init: function(button) {
        this._button = button;
        this.actor = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _("Log Out"),
            style_class: 'system-menu-action'
        });
        this.actor.child = new St.Icon({ icon_name: 'application-exit-symbolic' });
        this.actor.connect('clicked', Lang.bind(this, this._onClick));
    },

    // Activate the button (Logout)
    _onClick: function() {
        this._button.menu.toggle();
        this._button._session.LogoutRemote(0);
    }
});

// Suspend Button
const SuspendButton = new Lang.Class({
    Name: 'SuspendButton',

    // Initialize the button
    _init: function(button) {
        this._button = button;
        this.actor = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _("Suspend"),
            style_class: 'system-menu-action'
        });
        this.actor.child = new St.Icon({ icon_name: 'media-playback-pause-symbolic' });
        this.actor.connect('clicked', Lang.bind(this, this._onClick));
    },

    // Activate the button (Suspend the system)
    _onClick: function() {
        this._button.menu.toggle();
        let loginManager = LoginManager.getLoginManager();
            loginManager.canSuspend(Lang.bind(this,
                function(result) {
                    if (result) {
                        loginManager.suspend();
                    }
            }));
    }
});

// Lock Screen Button
const LockButton = new Lang.Class({
    Name: 'LockButton',

    // Initialize the button
    _init: function(button) {
        this._button = button;
        this.actor = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _("Lock"),
            style_class: 'system-menu-action'
        });
        this.actor.child = new St.Icon({ icon_name: 'changes-prevent-symbolic' });
        this.actor.connect('clicked', Lang.bind(this, this._onClick));
    },

    // Activate the button (Lock the screen)
    _onClick: function() {
        this._button.menu.toggle();
        Main.screenShield.lock(true);
    }
});

// Menu item to go back to category view
const BackMenuItem = new Lang.Class({
    Name: 'BackMenuItem',
    Extends: BaseMenuItem,

    // Initialize the button
    _init: function(button) {
	    this.parent();
        this._button = button;

        this._icon = new St.Icon({ icon_name: 'go-previous-symbolic',
                                   style_class: 'popup-menu-icon',
                                   icon_size: APPLICATION_ICON_SIZE});
        this.actor.add_child(this._icon);
        let backLabel = new St.Label({ text: _("Back"), y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(backLabel, { expand: true });
    },

    // Activate the button (go back to category view)
    activate: function(event) {
        this._button.selectCategory(null);
        if (this._button.searchActive) this._button.resetSearch();
	    this.parent(event);
    },
});

// Menu shortcut item class
const ShortcutMenuItem = new Lang.Class({
    Name: 'ShortcutMenuItem',
    Extends: BaseMenuItem,

    // Initialize the menu item
    _init: function(button, name, icon, command) {
	      this.parent();
        this._button = button;
        this._command = command;
        this._icon = new St.Icon({ icon_name: icon,
                                   style_class: 'popup-menu-icon',
                                   icon_size: 16});
        this.actor.add_child(this._icon);
        let label = new St.Label({ text: name, y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(label, { expand: true });
    },

    // Activate the menu item (Launch the shortcut)
    activate: function(event) {
        Util.spawnCommandLine(this._command);
        this._button.menu.toggle();
	    this.parent(event);
    }
});

// Menu item which displays the current user
const UserMenuItem = new Lang.Class({
    Name: 'UserMenuItem',
    Extends: BaseMenuItem,

    // Initialize the menu item
    _init: function(button) {
	    this.parent();
        this._button = button;
        let username = GLib.get_user_name();
        this._user = AccountsService.UserManager.get_default().get_user(username);
        this._userIcon = new St.Icon({ style_class: 'popup-menu-icon',
                                   icon_size: APPLICATION_ICON_SIZE});
        this.actor.add_child(this._userIcon);
        this._userLabel = new St.Label({ text: username, y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(this._userLabel, { expand: true });
        this._userLoadedId = this._user.connect('notify::is_loaded', Lang.bind(this, this._onUserChanged));
        this._userChangedId = this._user.connect('changed', Lang.bind(this, this._onUserChanged));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        this._onUserChanged();
    },

    // Activate the menu item (Open user account settings)
    activate: function(event) {
        Util.spawnCommandLine("gnome-control-center user-accounts");
        this._button.menu.toggle();
	    this.parent(event);
    },

    // Handle changes to user information (redisplay new info)
    _onUserChanged: function() {
        if (this._user.is_loaded) {
            this._userLabel.set_text (this._user.get_real_name());
            if (this._userIcon) {
                let iconFileName = this._user.get_icon_file();
                let iconFile = Gio.file_new_for_path(iconFileName);
                setIconAsync(this._userIcon, iconFile, 'avatar-default');
            }
        }
    },

    // Destroy the menu item
    _onDestroy: function() {
        if (this._userLoadedId != 0) {
            this._user.disconnect(this._userLoadedId);
            this._userLoadedId = 0;
        }

        if (this._userChangedId != 0) {
            this._user.disconnect(this._userChangedId);
            this._userChangedId = 0;
        }
    }
});

// Menu application item class
const ApplicationMenuItem = new Lang.Class({
    Name: 'ApplicationMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    // Initialize menu item
    _init: function(button, app) {
	    this.parent();
	    this._app = app;
        this.app = app;
        this._button = button;
        this._iconBin = new St.Bin();
        this.actor.add_child(this._iconBin);

        let appLabel = new St.Label({ text: app.get_name(), y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(appLabel, { expand: true });
        this.actor.label_actor = appLabel;

        let textureCache = St.TextureCache.get_default();
        let iconThemeChangedId = textureCache.connect('icon-theme-changed',
                                                      Lang.bind(this, this._updateIcon));
        this.actor.connect('destroy', Lang.bind(this,
            function() {
                textureCache.disconnect(iconThemeChangedId);
            }));
        this.actor.connect('popup-menu', Lang.bind(this, this._onKeyboardPopupMenu));
        this._updateIcon();
        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuTimeoutId = 0;

        this._draggable = DND.makeDraggable(this.actor);
        this.isDraggableApp = true;
        this._draggable.connect('drag-begin', Lang.bind(this,
            function () {
                this._removeMenuTimeout();
                Main.overview.beginItemDrag(this);
            }));
        this._draggable.connect('drag-cancelled', Lang.bind(this,
            function () {
                Main.overview.cancelledItemDrag(this);
            }));
        this._draggable.connect('drag-end', Lang.bind(this,
            function () {
                Main.overview.endItemDrag(this);
            }));
    },

    get_app_id: function() {
        return this._app.get_id();
    },

    getDragActor: function() {
       return this._app.create_icon_texture(APPLICATION_ICON_SIZE);
    },

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource: function() {
        return this.actor;
    },

    // Activate menu item (Launch application)
    activate: function(event) {
        this._app.open_new_window(-1);
        this._button.menu.toggle();
        this.parent(event);
    },

    // Set button as active, scroll to the button
    setActive: function(active, params) {
        if (active && !this.actor.hover)
            this._button.scrollToButton(this);

        this.parent(active, params);
    },

    // Update the app icon in the menu
    _updateIcon: function() {
        this._iconBin.set_child(this._app.create_icon_texture(APPLICATION_ICON_SIZE));
    },

    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },

    _setPopupTimeout: function() {
        this._removeMenuTimeout();
        this._menuTimeoutId = Mainloop.timeout_add(AppDisplay.MENU_POPUP_TIMEOUT,
            Lang.bind(this, function() {
                this._menuTimeoutId = 0;
                this.popupMenu();
                return GLib.SOURCE_REMOVE;
            }));
        GLib.Source.set_name_by_id(this._menuTimeoutId, '[gnome-shell] this.popupMenu');
    },

    _onLeaveEvent: function(actor, event) {
        this._removeMenuTimeout();
    },

    popupMenu: function() {
        this._removeMenuTimeout();

        if (this._draggable)
            this._draggable.fakeRelease();

        if (!this._menu) {
            this._menu = new SecondaryMenu.AppItemMenu(this);;
            this._menu.connect('activate-window', Lang.bind(this, function (menu, window) {
                this.activateWindow(window);
            }));
            this._menu.connect('open-state-changed', Lang.bind(this, function (menu, isPoppedUp) {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            }));
            let id = Main.overview.connect('hiding', Lang.bind(this, function () { this._menu.close(); }));
            this.actor.connect('destroy', function() {
                Main.overview.disconnect(id);
            });

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this.actor.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();

        return false;
    },

    _onMenuPoppedDown: function() {
        this.actor.sync_hover();
        this.emit('menu-state-changed', false);
    },

    _onKeyboardPopupMenu: function() {
        this.popupMenu();
        this._menu.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
    },

    _onButtonPressEvent: function(actor, event) {
        this.actor.add_style_pseudo_class ('active');
        let button = event.get_button();
        if (button == 1) {
            this._setPopupTimeout();
        } else if (button == 3) {
            this.popupMenu();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    },

    _onButtonReleaseEvent: function (actor, event) {
        this._removeMenuTimeout();
        this.actor.remove_style_pseudo_class ('active');
        let button = event.get_button();
        if (button != 3) {
            this.activate(event);
        }
        return Clutter.EVENT_STOP;
    },

    _onTouchEvent: function (actor, event) {
        if (event.type() == Clutter.EventType.TOUCH_BEGIN)
            this._setPopupTimeout();

        return Clutter.EVENT_PROPAGATE;
    },

    _onDestroy: function() {
        this.parent();
        this._removeMenuTimeout();
    }
});

// Menu Category item class
const CategoryMenuItem = new Lang.Class({
    Name: 'CategoryMenuItem',
    Extends: BaseMenuItem,

    // Initialize menu item
    _init: function(button, category) {
	    this.parent();
	    this._category = category;
        this._button = button;
        let name;
        if (this._category)
            name = this._category.get_name();
        else
            name = _("Favorites");

        this._icon = new St.Icon({ gicon: this._category.get_icon(),
                                   style_class: 'popup-menu-icon',
                                   icon_size: APPLICATION_ICON_SIZE});
        this.actor.add_child(this._icon);
        let categoryLabel = new St.Label({ text: name, y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(categoryLabel, { expand: true });
        this.actor.label_actor = categoryLabel;
    },

    // Activate menu item (Display applications in category)
    activate: function(event) {
        this._button.selectCategory(this._category);
	      this.parent(event);
    },

    // Set button as active, scroll to the button
    setActive: function(active, params) {
        if (active && !this.actor.hover)
            this._button.scrollToButton(this);

        this.parent(active, params);
    }
});

// Place Info class
const PlaceInfo = new Lang.Class({
    Name: 'PlaceInfo',

    // Initialize place info
    _init: function(file, name, icon) {
        this.file = file;
        this.name = name ? name : this._getFileName();
        this.icon = icon ? new Gio.ThemedIcon({ name: icon }) : this.getIcon();
    },

    // Launch place with appropriate application
    launch: function(timestamp) {
        let launchContext = global.create_app_launch_context(timestamp, -1);
        Gio.AppInfo.launch_default_for_uri(this.file.get_uri(), launchContext);
    },

    // Get Icon for place
    getIcon: function() {
        try {
            let info = this.file.query_info('standard::symbolic-icon', 0, null);
	    return info.get_symbolic_icon();
        } catch(e if e instanceof Gio.IOErrorEnum) {
                if (!this.file.is_native())
                    return new Gio.ThemedIcon({ name: 'folder-remote-symbolic' });
                else
                    return new Gio.ThemedIcon({ name: 'folder-symbolic' });
        }
    },

    // Get display name for place
    _getFileName: function() {
        try {
            let info = this.file.query_info('standard::display-name', 0, null);
            return info.get_display_name();
        } catch(e if e instanceof Gio.IOErrorEnum) {
            return this.file.get_basename();
        }
    },
});
Signals.addSignalMethods(PlaceInfo.prototype);

// Menu Place Shortcut item class
const PlaceMenuItem = new Lang.Class({
    Name: 'PlaceMenuItem',
    Extends: BaseMenuItem,

    // Initialize menu item
    _init: function(button, info) {
	    this.parent();
	    this._button = button;
	    this._info = info;
        this._icon = new St.Icon({ gicon: info.icon,
                                   icon_size: 16 });
	    this.actor.add_child(this._icon);
        this._label = new St.Label({ text: info.name, y_expand: true,
                                      y_align: Clutter.ActorAlign.CENTER });
        this.actor.add_child(this._label, { expand: true });
        this._changedId = this._info.connect('changed',
                                       Lang.bind(this, this._propertiesChanged));
    },

    // Destroy menu item
    destroy: function() {
        if (this._changedId) {
            this._info.disconnect(this._changedId);
            this._changedId = 0;
        }
        this.parent();
    },

    // Activate (launch) the shortcut
    activate: function(event) {
	    this._info.launch(event.get_time());
      this._button.menu.toggle();
	    this.parent(event);
    },

    // Handle changes in place info (redisplay new info)
    _propertiesChanged: function(info) {
        this._icon.gicon = info.icon;
        this._label.text = info.name;
    },
});

// Aplication menu class
const ApplicationsMenu = new Lang.Class({
    Name: 'ApplicationsMenu',
    Extends: PopupMenu.PopupMenu,

    // Initialize the menu
    _init: function(sourceActor, arrowAlignment, arrowSide, button, settings) {
        this._settings = settings;
        this.parent(sourceActor, arrowAlignment, arrowSide);
        this._button = button;
    },

    // Return that the menu is not empty (used by parent class)
    isEmpty: function() {
	    return false;
    },

    // Handle opening the menu
    open: function(animate) {
        this._button.hotCorner.setBarrierSize(0);
        if (this._button.hotCorner.actor)
            this._button.hotCorner.actor.hide();
        this.parent(animate);
        if (this._settings.get_enum('visible-menus') != visibleMenus.SYSTEM_ONLY) {
             global.stage.set_key_focus(this._button.searchEntry);
        }
    },

    // Handle closing the menu
    close: function(animate) {
        let size = Main.layoutManager.panelBox.height;
        if (this._button.applicationsBox) {
            this._button.selectCategory(null);
            this._button.resetSearch();
        }
        this._button.hotCorner.setBarrierSize(size);
        if (this._button.hotCorner.actor)
            this._button.hotCorner.actor.show();
        this.parent(animate);
    },

    // Toggle menu open state
    toggle: function() {
        if (!this.isOpen) {
            if (Main.overview.visible)
                Main.overview.hide();
        }
        this.parent();
    }
});

const availableIconSizes = [ 16, 22, 24, 32, 48, 64, 96, 128 ];

// Application Menu Button class (most of the menu logic is here)
const ApplicationsButton = new Lang.Class({
    Name: 'ApplicationsButton',
    Extends: PanelMenu.Button,

    // Initialize the menu
    _init: function(settings) {
        this._settings = settings;
        this.parent(1.0, null, false);
        this._session = new GnomeSession.SessionManager();
        this.setMenu(new ApplicationsMenu(this.actor, 1.0, St.Side.TOP, this, this._settings));
        Main.panel.menuManager.addMenu(this.menu);
        this.actor.accessible_role = Atk.Role.LABEL;
        let hbox = new St.BoxLayout({ style_class: 'arc-panel-status-menu-box' });
        this._icon = new St.Icon({ icon_name: 'arc-menu-symbolic',
                                    style_class: 'arc-popup-menu-icon'});
        hbox.add_child(this._icon);
        hbox.add_child(PopupMenu.arrowIcon(St.Side.BOTTOM));
        this.actor.add_actor(hbox);
        this.actor.name = 'panelApplications';
        this.actor.connect('captured-event', Lang.bind(this, this._onCapturedEvent));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
        this._showingId = Main.overview.connect('showing', Lang.bind(this, function() {
            this.actor.add_accessible_state (Atk.StateType.CHECKED);
        }));
        this._hidingId = Main.overview.connect('hiding', Lang.bind(this, function() {
            this.actor.remove_accessible_state (Atk.StateType.CHECKED);
        }));
        Main.layoutManager.connect('startup-complete',
                                   Lang.bind(this, this._setKeybinding));
        this._setKeybinding();
        this.reloadFlag = false;
        this._createLayout();
        this._display();
        this._installedChangedId = appSys.connect('installed-changed', Lang.bind(this, function() {
            if (this.menu.isOpen) {
                this._redisplay();
                this.mainBox.show();
            } else {
                this.reloadFlag = true;
            }
        }));
        this._panelBoxChangedId = Main.layoutManager.connect('panel-box-changed', Lang.bind(this, function() {
            container.queue_relayout();
        }));
        Main.panel.actor.connect('notify::height', Lang.bind(this,
            function() {
                this._redisplay();
            }));
    },

    _adjustIconSize: function() {
            let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            let iconSizes = availableIconSizes.map(function(s) {
                return s * scaleFactor;
            });

            let availSize = Main.panel.actor.get_height() - (MINIMUM_PADDING * 2);

            let newIconSize = availableIconSizes[0];
            for (let i = 0; i < iconSizes.length ; i++) {
                if (iconSizes[i] < availSize) {
                    newIconSize = availableIconSizes[i];
                }
            }

            if (newIconSize == this._iconSize)
                return;

            let oldIconSize = this._iconSize;
            this._iconSize = newIconSize;
            this.emit('icon-size-changed');
            this._icon.set_icon_size(this._iconSize);
            /*let scale = oldIconSize / newIconSize;
            let [targetWidth, targetHeight] = this._icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            this._icon.set_size(this._icon.width * scale,
                               this._icon.height * scale);

            Tweener.addTween(this._icon,
                             { width: targetWidth,
                               height: targetHeight,
                               time: 0.2,
                               transition: 'easeOutQuad',
                             });*/
    },

    // Get hot corner
    get hotCorner() {
        return Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex];
    },

    // Create a vertical separator
    _createVertSeparator: function() {
        let separator = new St.DrawingArea({ style_class: 'calendar-vertical-separator',
                                             pseudo_class: 'highlighted' });
        separator.connect('repaint', Lang.bind(this, this._onVertSepRepaint));
        return separator;
    },

    // Destroy the menu button
    _onDestroy: function() {
        Main.overview.disconnect(this._showingId);
        Main.overview.disconnect(this._hidingId);
        Main.layoutManager.disconnect(this._panelBoxChangedId);
        appSys.disconnect(this._installedChangedId);
        Main.wm.setCustomKeybindingHandler('panel-main-menu',
                                           Shell.ActionMode.NORMAL |
                                           Shell.ActionMode.OVERVIEW,
                                           Main.sessionMode.hasOverview ?
                                           Lang.bind(Main.overview, Main.overview.toggle) :
                                           null);
    },

    // Handle captured event
    _onCapturedEvent: function(actor, event) {
        if (event.type() == Clutter.EventType.BUTTON_PRESS) {
            if (!Main.overview.shouldToggleByCornerOrButton())
                return true;
        }
        return false;
    },

    // Handle key presses
    _onMenuKeyPress: function(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_Left || symbol == Clutter.KEY_Right) {
            let direction = symbol == Clutter.KEY_Left ? Gtk.DirectionType.LEFT
                                                       : Gtk.DirectionType.RIGHT;
            if (this.menu.actor.navigate_focus(global.stage.key_focus, direction, false))
                return true;
        } else if (symbol == Clutter.KEY_Up || symbol == Clutter.KEY_Down) {
            let direction = symbol == Clutter.KEY_Up ? Gtk.DirectionType.UP
                                                       : Gtk.DirectionType.DOWN;
            if (this.menu.actor.navigate_focus(global.stage.key_focus, direction, false))
                return true;
        } else if (symbol == Clutter.KEY_Return ||
                   symbol == Clutter.KEY_Tab) {
            return this.parent(actor, event);
        } else if (symbol == Clutter.KEY_BackSpace) {
            if (!this.searchEntry.contains(global.stage.get_key_focus())) {
                global.stage.set_key_focus(this.searchEntry);
                let newText = this.searchEntry.get_text().slice(0, -1);
                this.searchEntry.set_text(newText);
            }
            return this.parent(actor, event);
        }
        let key = event.get_key_unicode();
        global.stage.set_key_focus(this.searchEntry);
        let newText = this.searchEntry.get_text() + key;
        this.searchEntry.set_text(newText);
        return this.parent(actor, event);
    },

    // Repaint vertical separator
    _onVertSepRepaint: function(area) {
        let cr = area.get_context();
        let themeNode = area.get_theme_node();
        let [width, height] = area.get_surface_size();
        let stippleColor = themeNode.get_color('-stipple-color');
        let stippleWidth = themeNode.get_length('-stipple-width');
        let x = Math.floor(width/2) + 0.5;
        cr.moveTo(x, 0);
        cr.lineTo(x, height);
        Clutter.cairo_set_source_color(cr, stippleColor);
        cr.setDash([1, 3], 1);
        cr.setLineWidth(stippleWidth);
        cr.stroke();
    },

    // Handle changes in menu open state
    _onOpenStateChanged: function(menu, open) {
       if (open) {
           if (this.reloadFlag) {
               this._redisplay();
               this.reloadFlag = false;
           }
           this.mainBox.show();
       }
       this.parent(menu, open);
    },

    // Set menu key binding
    _setKeybinding: function() {
        Main.wm.setCustomKeybindingHandler('panel-main-menu',
                                           Shell.ActionMode.NORMAL |
                                           Shell.ActionMode.OVERVIEW,
                                           Lang.bind(this, function() {
                                               this.menu.toggle();
                                           }));
    },

    // Redisplay the menu
    _redisplay: function() {
        if (this.applicationsBox)
            this.applicationsBox.destroy_all_children();
        this._display();
        this._adjustIconSize();
    },

    // Load menu category data for a single category
    _loadCategory: function(categoryId, dir) {
        let iter = dir.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.ENTRY) {
                let entry = iter.get_entry();
                let id;
                try {
                    id = entry.get_desktop_file_id();
                } catch(e) {
                    continue;
                }
                let app = appSys.lookup_app(id);
                if (app.get_app_info().should_show())
                    this.applicationsByCategory[categoryId].push(app);
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let subdir = iter.get_directory();
                if (!subdir.get_is_nodisplay())
                    this._loadCategory(categoryId, subdir);
            }
        }
    },

    // Load data for all menu categories
    _loadCategories: function() {
        this.applicationsByCategory = {};
        let tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
        tree.load_sync();
        let root = tree.get_root_directory();
        let iter = root.iter();
        let nextType;
        while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
            if (nextType == GMenu.TreeItemType.DIRECTORY) {
                let dir = iter.get_directory();
                if (!dir.get_is_nodisplay()) {
                    let categoryId = dir.get_menu_id();
                    this.applicationsByCategory[categoryId] = [];
                    this._loadCategory(categoryId, dir);
                    if (this.applicationsByCategory[categoryId].length > 0) {
                        let categoryMenuItem = new CategoryMenuItem(this, dir);
                        this.applicationsBox.add_actor(categoryMenuItem.actor);
                    }
                }
            }
        }
    },

    // Load menu place shortcuts
    _loadPlaces: function() {
        let homePath = GLib.get_home_dir();
        let placeInfo = new PlaceInfo(Gio.File.new_for_path(homePath), _("Home"));
        let placeMenuItem = new PlaceMenuItem(this, placeInfo);
        this.rightBox.add_actor(placeMenuItem.actor);
        let dirs = DEFAULT_DIRECTORIES.slice();
        for (let i = 0; i < dirs.length; i++) {
            let path = GLib.get_user_special_dir(dirs[i]);
            if (path == null || path == homePath)
                continue;
            let placeInfo = new PlaceInfo(Gio.File.new_for_path(path));
            let placeMenuItem = new PlaceMenuItem(this, placeInfo);
            this.rightBox.add_actor(placeMenuItem.actor);
        }
        
        let placeInfo = new PlaceInfo(Gio.File.new_for_uri("trash:///"), _("Trash"));
        let placeMenuItem = new PlaceMenuItem(this, placeInfo);
        this.rightBox.add_actor(placeMenuItem.actor);
    },

    // Scroll to a specific button (menu item) in the applications scroll view
    scrollToButton: function(button) {
        let appsScrollBoxAdj = this.applicationsScrollBox.get_vscroll_bar().get_adjustment();
        let appsScrollBoxAlloc = this.applicationsScrollBox.get_allocation_box();
        let currentScrollValue = appsScrollBoxAdj.get_value();
        let boxHeight = appsScrollBoxAlloc.y2 - appsScrollBoxAlloc.y1;
        let buttonAlloc = button.actor.get_allocation_box();
        let newScrollValue = currentScrollValue;
        if (currentScrollValue > buttonAlloc.y1 - 10)
            newScrollValue = buttonAlloc.y1 - 10;
        if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
            newScrollValue = buttonAlloc.y2 - boxHeight + 10;
        if (newScrollValue != currentScrollValue)
            appsScrollBoxAdj.set_value(newScrollValue);
    },

    // Create the menu layout
    _createLayout: function() {
        // Create main menu sections and scroll views
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);
        this.mainBox = new St.BoxLayout({ vertical: false,
                                          style_class: 'main-box' });
        section.actor.add_actor(this.mainBox);


        // Left Box
        if(this._settings.get_enum('visible-menus') == visibleMenus.ALL ||
           this._settings.get_enum('visible-menus') == visibleMenus.APPS_ONLY) {
            this.leftBox = new St.BoxLayout({ vertical: true, style_class: 'left-box' });
            this.applicationsScrollBox = new St.ScrollView({ x_fill: true, y_fill: false,
                                                             y_align: St.Align.START,
                                                             style_class: 'apps-menu vfade left-scroll-area' });
            this.applicationsScrollBox.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
            let vscroll = this.applicationsScrollBox.get_vscroll_bar();
            vscroll.connect('scroll-start', Lang.bind(this, function() {
                this.menu.passEvents = true;
            }));
            vscroll.connect('scroll-stop', Lang.bind(this, function() {
                this.menu.passEvents = false;
            }));
            this.leftBox.add(this.applicationsScrollBox, { expand: true,
                                                         x_fill: true, y_fill: true,
                                                         y_align: St.Align.START });

            // Create search box
            this.searchBox = new St.BoxLayout({ style_class: 'search-box search-box-padding' });
            this._searchInactiveIcon = new St.Icon({ style_class: 'search-entry-icon', icon_name: 'edit-find-symbolic', icon_size: 16 });
            this._searchActiveIcon = new St.Icon({ style_class: 'search-entry-icon', icon_name: 'edit-clear-symbolic', icon_size: 16 });
            this.searchEntry = new St.Entry({ name: 'search-entry',
                                         hint_text: _("Type to search…"),
                                         track_hover: true,
                                         can_focus: true });
            this.searchEntry.set_primary_icon(this._searchInactiveIcon);
            this.searchBox.add(this.searchEntry, { expand: true,
                                                   x_align:St.Align.START,
                                                   y_align:St.Align.START
                                                 });
            this.searchActive = false;
            this.searchEntryText = this.searchEntry.clutter_text;
            this.searchEntryText.connect('text-changed', Lang.bind(this, this._onSearchTextChanged));
            this.searchEntryText.connect('key-press-event', Lang.bind(this, this._onMenuKeyPress));
            this._previousSearchPattern = "";
            this._searchIconClickedId = 0;

            // Add back button to menu
            this.backButton = new BackMenuItem(this);
            this.leftBox.add(this.backButton.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });

            // Add search box to menu
            this.leftBox.add(this.searchBox, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });

            this.applicationsBox = new St.BoxLayout({ vertical: true });
            this.applicationsScrollBox.add_actor(this.applicationsBox);
            this.mainBox.add(this.leftBox, { expand: true, x_fill: true, y_fill: true });

            if(this._settings.get_enum('visible-menus') == visibleMenus.ALL)
                this.mainBox.add(this._createVertSeparator(), { expand: false, x_fill: false, y_fill: true});
        }



        // Right Box
        if(this._settings.get_enum('visible-menus') == visibleMenus.ALL ||
           this._settings.get_enum('visible-menus') == visibleMenus.SYSTEM_ONLY) {
            this.rightBox = new St.BoxLayout({ vertical: true, style_class: 'right-box' });
            this.actionsBox = new PopupMenu.PopupBaseMenuItem({ reactive: false,
                                                                can_focus: false });

            // Add session buttons to menu
            let logout = new LogoutButton(this);
            this.actionsBox.actor.add(logout.actor, { expand: true,
                                                      x_fill: false,
                                                      y_align: St.Align.START
                                                    });

            let lock = new LockButton(this);
            this.actionsBox.actor.add(lock.actor, { expand: true,
                                                    x_fill: false,
                                                    y_align: St.Align.START
                                                  });

            let suspend = new SuspendButton(this);
            this.actionsBox.actor.add(suspend.actor, { expand: true,
                                                    x_fill: false,
                                                    y_align: St.Align.START
                                                  });

            let power = new PowerButton(this);
            this.actionsBox.actor.add(power.actor, { expand: true,
                                                     x_fill: false,
                                                     y_align: St.Align.START
                                                   });

            let user = new UserMenuItem(this);
            this.rightBox.add(user.actor, { expand: false,
                                            x_fill: true,
                                            y_fill: false,
                                            y_align: St.Align.START
                                          });

            let separator = new PopupMenu.PopupSeparatorMenuItem();
            this.rightBox.add(separator.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START
                                               });

            // Add place shortcuts to menu
            this._loadPlaces();
            separator = new PopupMenu.PopupSeparatorMenuItem();
            this.rightBox.add(separator.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });

            // Add shortcuts to menu
            let software = new ShortcutMenuItem(this, _("Software"), "gnome-software-symbolic", "gnome-software");
            this.rightBox.add(software.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });
            let settings = new ShortcutMenuItem(this, _("Settings"), "preferences-system-symbolic", "gnome-control-center");
            this.rightBox.add(settings.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });
            let tweaktool = new ShortcutMenuItem(this, _("Tweak Tool"), "gnome-tweak-tool-symbolic", "gnome-tweak-tool");
            this.rightBox.add(tweaktool.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });
            let activities = new ActivitiesMenuItem(this);
            this.rightBox.add(activities.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });
            separator = new PopupMenu.PopupSeparatorMenuItem();
            this.rightBox.add(separator.actor, { expand: false,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.START });
            this.rightBox.add(this.actionsBox.actor, { expand: true,
                                                 x_fill: true, y_fill: false,
                                                 y_align: St.Align.END });
            this.mainBox.add(this.rightBox);
        }

    },

    // Display the menu
    _display: function() {
        this.mainBox.hide();
        if (this._settings.get_enum('visible-menus') != visibleMenus.SYSTEM_ONLY) {
            this._applicationsButtons = new Array();
            this._loadCategories();
            this._previousSearchPattern = "";
            this.backButton.actor.hide();
        }
    },

    // Clear the applications menu box
    _clearApplicationsBox: function() {
        let actors = this.applicationsBox.get_children();
        for (let i = 0; i < actors.length; i++) {
            let actor = actors[i];
            this.applicationsBox.remove_actor(actor);
        }
    },

    // Select a category or show category overview if no category specified
    selectCategory: function(dir) {
        this._clearApplicationsBox();
        if (dir) {
            this._displayButtons(this._listApplications(dir.get_menu_id()));
            this.backButton.actor.show();
            global.stage.set_key_focus(this.searchEntry);
        }
        else {
            this._loadCategories();
            this.backButton.actor.hide();
            global.stage.set_key_focus(this.searchEntry);
        }
    },

    // Display application menu items
    _displayButtons: function(apps) {
         if (apps) {
            for (let i = 0; i < apps.length; i++) {
               let app = apps[i];
               if (!this._applicationsButtons[app]) {
                  let applicationMenuItem = new ApplicationMenuItem(this, app);
                  this._applicationsButtons[app] = applicationMenuItem;
               }
               if (!this._applicationsButtons[app].actor.get_parent())
                  this.applicationsBox.add_actor(this._applicationsButtons[app].actor);
            }
         }
    },

    // Get a list of applications for the specified category or search query
    _listApplications: function(category_menu_id, pattern) {
        let applist;

        // Get applications in a category or all categories
        if (category_menu_id) {
            applist = this.applicationsByCategory[category_menu_id];
        } else {
            applist = new Array();
            for (let directory in this.applicationsByCategory)
                applist = applist.concat(this.applicationsByCategory[directory]);
        }

        let res; //Results array

        // Get search results based on pattern (query)
        if (pattern) {
            let searchResults = new Array();
            for (let i in applist) {
                let app = applist[i];
                let info = Gio.DesktopAppInfo.new (app.get_id());
                let match = app.get_name().toLowerCase() + " ";
                if (info.get_display_name()) match += info.get_display_name().toLowerCase() + " ";
                if (info.get_executable()) match += info.get_executable().toLowerCase() + " ";
                if (info.get_keywords()) match += info.get_keywords().toString().toLowerCase() + " ";
                if (app.get_description()) match += app.get_description().toLowerCase();
                let index = match.indexOf(pattern)
                if (index != -1) {
                    searchResults.push([index, app]);
                }
            }

            // Sort results by relevance score
            searchResults.sort(function(a,b) {
                return a[0] > b[0];
            });
            res = searchResults.map(function(value,index) { return value[1]; });
        } else {
            applist.sort(function(a,b) {
                return a.get_name().toLowerCase() > b.get_name().toLowerCase();
            });
            res = applist;
        }
	    return res;
    },

    // Handle search text entry input changes
    _onSearchTextChanged: function (se, prop) {
        let searchString = this.searchEntry.get_text();
        this.searchActive = searchString != '';
        if (this.searchActive) {
            this.searchEntry.set_secondary_icon(this._searchActiveIcon);
            if (this._searchIconClickedId == 0) {
                this._searchIconClickedId = this.searchEntry.connect('secondary-icon-clicked',
                    Lang.bind(this, function() {
                        this.resetSearch();
                        this.selectCategory(null);
                    }));
            }
            this._doSearch();
        } else {
            if (this._searchIconClickedId > 0)
                this.searchEntry.disconnect(this._searchIconClickedId);
            this._searchIconClickedId = 0;
            this.searchEntry.set_secondary_icon(null);
            if (searchString == "" && this._previousSearchPattern != "") {
                this.selectCategory(null);
            }
            this._previousSearchPattern = "";
        }
        return false;
    },

    // Carry out a search based on the search text entry value
    _doSearch: function(){
        let pattern = this.searchEntryText.get_text().replace(/^\s+/g, '').replace(/\s+$/g, '').toLowerCase();
        if (pattern==this._previousSearchPattern) return;
        this._previousSearchPattern = pattern;
        if (pattern.length == 0) {
            return;
        }
        let appResults = this._listApplications(null, pattern);
        this._clearApplicationsBox();
        this._displayButtons(appResults);

        if (this.applicationsBox.get_children().length > 0)
            global.stage.set_key_focus(this.applicationsBox.get_first_child());

        this.backButton.actor.show();
    },

    // Reset the search
    resetSearch: function(){
        this.searchEntry.set_text("");
        this.searchActive = false;
        global.stage.set_key_focus(this.searchEntry);
     },

    // Destroy (deactivate) the menu
    destroy: function() {
        this.menu.actor.get_children().forEach(function(c) { c.destroy() });
        this.parent();
    }
});
