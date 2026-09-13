"use strict";

(function () {
    class ZenLibrarySpaces {
        static CARD_WIDTH = 242;
        static CARD_GAP = 24;

        static getWorkspaces() { return window.gZenWorkspaces ? window.gZenWorkspaces.getWorkspaces() : []; }

        // Fallback `true` matches preferences.json: Sine only writes a defaultValue when the settings page is opened.
        static atgCompatEnabled() {
            try { return Services.prefs.getBoolPref("zen.library.compat.advanced-tab-groups", true); } catch (e) { return true; }
        }

        static calculatePanelWidth(count) {
            // sidebar (84) + grid padding (50) + cards + gaps + create-button (36 + 2 margin)
            const total = 84 + 50 + (count * this.CARD_WIDTH) + (count * this.CARD_GAP) + 38;
            return Math.min(total, window.innerWidth * 0.8);
        }

        static calculateMediaColumns(width) {
            const sidebar = 84;
            const padding = 36;
            const colWidth = 210;
            const gap = 16;
            const scrollbarBuffer = 4;

            const avail = width - sidebar - padding - scrollbarBuffer;
            return Math.max(1, Math.floor((avail + gap + 2) / (colWidth + gap)));
        }

        static calculateMediaWidth(count) {
            const sidebar = 84;
            const padding = 36;
            const colWidth = 210;
            const gap = 16;
            const scrollbarBuffer = 4;

            let cols = 1;
            if (count > 6) cols = 3;
            else if (count > 2) cols = 2;

            const total = sidebar + padding + (cols * colWidth) + ((cols - 1) * gap) + scrollbarBuffer;
            return Math.min(total, window.innerWidth * 0.9);
        }

        constructor(library) {
            this.library = library;
            // Write-only here; Advanced Tab Groups' patched renderItemRecursive (compat pref off) writes into it too, so it must exist.
            this._folderExpansion = new Map();
            this._lastRenderAt = 0;
        }

        get el() { return this.library.el.bind(this.library); }
        get svg() { return this.library.svg.bind(this.library); }

        // Returns the grid; the shell's update() mounts it and owns the panel width (calculatePanelWidth).
        render() {
            // Capture existing scroll position
            const oldGrid = this.library.shadowRoot.querySelector(".library-workspace-grid");
            const oldScroll = oldGrid ? oldGrid.scrollLeft : 0;

            const grid = this.el("div", { className: "library-workspace-grid" });
            const fragment = document.createDocumentFragment();

            for (const ws of ZenLibrarySpaces.getWorkspaces()) {
                const card = this.createWorkspaceCard(ws);
                if (card) fragment.appendChild(card);
            }

            // Add "Create Space" button at end of grid
            fragment.appendChild(this.el("div", {
                className: "library-create-workspace-button",
                title: "Create Space",
                onclick: () => {
                    window.gZenLibrary.close();
                    const creationCmd = document.getElementById("cmd_zenOpenWorkspaceCreation");
                    if (creationCmd) creationCmd.doCommand();
                }
            }, [
                this.el("div")
            ]));

            grid.appendChild(fragment);

            // Vertical wheel pans the grid unless a card list under the pointer can still scroll that way.
            grid.onwheel = (e) => {
                const list = e.target.closest(".library-workspace-card-list");
                let shouldScrollHorizontal = !list;
                if (list) {
                    const isAtTop = list.scrollTop <= 0 && e.deltaY < 0;
                    const isAtBottom = Math.abs(list.scrollHeight - list.scrollTop - list.clientHeight) < 1 && e.deltaY > 0;
                    if (isAtTop || isAtBottom) shouldScrollHorizontal = true;
                }

                if (e.deltaY !== 0 && shouldScrollHorizontal) {
                    e.preventDefault();
                    if (e.deltaMode === 1) grid.scrollBy({ left: e.deltaY * 30, behavior: "smooth" });
                    else grid.scrollLeft += e.deltaY * 1.5;
                }
            };

            this.library.enterContent(grid);

            // Restore scroll position
            if (oldScroll > 0) {
                requestAnimationFrame(() => { grid.scrollLeft = oldScroll; });
            }

            // Only animate entry if it's a fresh load (no old grid), otherwise instant
            if (!oldGrid) {
                setTimeout(() => grid.classList.add("scrollbar-visible"), 100);
            } else {
                grid.classList.add("scrollbar-visible");
            }

            this._lastRenderAt = Date.now();
            return grid;
        }

        createFolderIconSVG(iconURL = '', state = 'close', active = false, key = '') {
            // Stable per-folder gradient IDs: identical inputs hit the svg()
            // cache instead of growing it on every render, and equal IDs can
            // never collide across folders the way random ones could.
            const safeKey = String(key || 'shared').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'shared';
            const id1 = `zlfg-${safeKey}-0`;
            const id2 = `zlfg-${safeKey}-1`;

            // Native nsZenFolder.rawIcon geometry (27-unit viewBox): the image
            // carries no transform attribute — position comes from CSS, like native.
            // Fills use the card's --zen-folder-* tokens, which follow Zen's
            // light-dark mixes of that space's --zen-primary-color.
            const svgStr = `
            <svg width="28" height="28" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg" state="${state}" active="${active}">
                <defs>
                    <linearGradient gradientUnits="userSpaceOnUse" x1="14" y1="5.625" x2="14" y2="22.375" id="${id1}">
                        <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
                        <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
                    </linearGradient>
                    <linearGradient gradientUnits="userSpaceOnUse" x1="14" y1="9.625" x2="14" y2="22.375" id="${id2}">
                        <stop offset="0" style="stop-color: rgb(255, 255, 255)"/>
                        <stop offset="1" style="stop-color: rgb(0, 0, 0)"/>
                    </linearGradient>
                </defs>
                <path class="back" d="M8 5.625H11.9473C12.4866 5.625 13.0105 5.80861 13.4316 6.14551L14.2881 6.83105C14.9308 7.34508 15.7298 7.625 16.5527 7.625H20C21.3117 7.625 22.375 8.68832 22.375 10V20C22.375 21.3117 21.3117 22.375 20 22.375H8C6.68832 22.375 5.625 21.3117 5.625 20V8C5.625 6.68832 6.68832 5.625 8 5.625Z" style="fill: var(--zen-folder-behind-bgcolor);" />
                <path class="back" d="M8 5.625H11.9473C12.4866 5.625 13.0105 5.80861 13.4316 6.14551L14.2881 6.83105C14.9308 7.34508 15.7298 7.625 16.5527 7.625H20C21.3117 7.625 22.375 8.68832 22.375 10V20C22.375 21.3117 21.3117 22.375 20 22.375H8C6.68832 22.375 5.625 21.3117 5.625 20V8C5.625 6.68832 6.68832 5.625 8 5.625Z" style="stroke-width: 1.5px; stroke: var(--zen-folder-stroke); fill: url(#${id1}); fill-opacity: 0.1;" />
                <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" style="fill: var(--zen-folder-front-bgcolor);" />
                <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" style="stroke-width: 1.5px; stroke: var(--zen-folder-stroke); fill: url(#${id2}); fill-opacity: 0.1;" />
                <g class="icon">
                     <image href="" height="11" width="11" />
                </g>
                <g class="dots" style="fill: var(--zen-folder-stroke);">
                    <ellipse cx="10" cy="16" rx="1.25" ry="1.25"/>
                    <ellipse cx="14" cy="16" rx="1.25" ry="1.25"/>
                    <ellipse cx="18" cy="16" rx="1.25" ry="1.25"/>
                </g>
            </svg>`;
            const node = this.svg(svgStr);
            // setAttribute, not string interpolation: a quote in a stored icon
            // URL must never be able to break out of the SVG markup.
            if (node && iconURL) node.querySelector("image")?.setAttribute("href", iconURL);
            return node;
        }

        createWorkspaceCard(ws) {
            try {
                if (!window.gZenWorkspaces) return null;

                let themeData = { gradient: "var(--zen-primary-color)", grain: 0, primaryColor: "var(--zen-primary-color)", isDarkMode: true, toolbarColor: [255, 255, 255, 0.6] };
                if (window.gZenThemePicker && window.gZenThemePicker.getGradientForWorkspace) {
                    themeData = window.gZenThemePicker.getGradientForWorkspace(ws);
                }

                const card = this.el("div", { className: "library-workspace-card" });
                card.setAttribute("workspace-id", ws.uuid);
                card.toggleAttribute("active", window.gZenWorkspaces?.activeWorkspace === ws.uuid);
                card.style.setProperty("--ws-gradient", themeData.gradient);
                card.style.setProperty("--ws-grain", themeData.grain);

                const pColor = themeData.primaryColor;
                const tColor = `rgba(${themeData.toolbarColor.join(',')})`;

                card.style.setProperty("--ws-primary-color", pColor);
                card.style.setProperty("--ws-text-color", tColor);
                // Drive native --zen-folder-* / --tab-background-color-* mixes
                // declared on the card in spaces.css. Skip the identity var —
                // assigning --zen-primary-color: var(--zen-primary-color) cycles.
                if (pColor && pColor !== "var(--zen-primary-color)") {
                    card.style.setProperty("--zen-primary-color", pColor);
                }
                card.style.colorScheme = themeData.isDarkMode ? "dark" : "light";

                if (themeData.isDarkMode) card.classList.add("dark");

                const hasNativeIcon = window.gZenWorkspaces?.workspaceHasIcon ?
                    window.gZenWorkspaces.workspaceHasIcon(ws) :
                    !!String(ws.icon || "").trim();
                const workspaceIcon = hasNativeIcon && window.gZenWorkspaces?.getWorkspaceIcon ?
                    window.gZenWorkspaces.getWorkspaceIcon(ws) :
                    String(ws.icon || "").trim();

                let iconEl;
                if (workspaceIcon && (workspaceIcon.includes("/") || workspaceIcon.startsWith("data:"))) {
                    // [audit] SEC-3 — ws.icon is stored workspace data and this string is
                    // assigned to cssText by el(), so an unescaped quote in it injected CSS
                    // declarations into privileged chrome rather than merely breaking a mask.
                    iconEl = this.el("div", {
                        className: "library-workspace-icon",
                        style: `mask-image: url("${window.ZenLibraryUtil.cssUrl(workspaceIcon)}");`
                    });
                } else if (workspaceIcon) {
                    iconEl = this.el("span", { textContent: workspaceIcon, className: "library-workspace-icon-text" });
                } else {
                    iconEl = this.el("span", {
                        textContent: "",
                        className: "library-workspace-icon-text fallback"
                    });
                }

                const iconContainer = this.el("div", {
                    className: "library-workspace-icon-container"
                }, [iconEl]);
                iconContainer.toggleAttribute("no-icon", !workspaceIcon);
                iconContainer.addEventListener("dblclick", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.changeWorkspaceIcon(ws, iconContainer);
                });

                const editBtn = this.el("div", {
                    className: "library-workspace-edit-button",
                    title: "Edit Theme"
                }, [this.el("div")]);

                editBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.editWorkspaceTheme(ws, e);
                });

                const menuBtn = document.createXULElement("toolbarbutton");
                menuBtn.className = "library-workspace-menu-button";
                // XUL tooltips read tooltiptext, not title.
                menuBtn.setAttribute("tooltiptext", "Space Options");
                menuBtn.setAttribute("zen-workspace-id", ws.uuid);
                menuBtn.appendChild(this.el("div"));

                menuBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    // Zen resolves the space from the trigger event's closest toolbarbutton[zen-workspace-id].
                    const nativePopup = document.getElementById("zenWorkspaceMoreActions");
                    if (nativePopup) {
                        nativePopup.openPopup(menuBtn, "after_end", 0, 4, true, false, e);
                        return;
                    }
                    this.showWorkspaceMenu(e, ws);
                });

                const nameEl = this.el("span", {
                    className: "library-workspace-name",
                    textContent: ws.name
                });
                nameEl.addEventListener("dblclick", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startInlineRename(e, ws);
                });

                const header = this.el("div", { className: "library-workspace-card-header" }, [
                    iconContainer,
                    nameEl,
                    editBtn
                ]);

                const listContainer = this.el("div", { className: "library-workspace-card-list" });
                listContainer.addEventListener("dragover", (e) => this.onCardDragOver(e, ws.uuid));
                listContainer.addEventListener("drop", (e) => this.onCardDrop(e, ws.uuid));
                listContainer.addEventListener("dragleave", (e) => {
                    // dragleave also fires moving between children; only act on a real exit.
                    if (e.currentTarget.contains(e.relatedTarget)) return;
                    card.removeAttribute("drop-target");
                });

                const wsEl = window.gZenWorkspaces.workspaceElement(ws.uuid);
                if (wsEl) this.fillWorkspaceList(listContainer, ws.uuid, wsEl);

                const dragHandle = this.el("div", {
                    className: "library-workspace-drag-handle",
                    textContent: "⠿",
                    title: "Drag to reorder"
                });

                // Drag and Drop Logic
                dragHandle.addEventListener("mousedown", (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();

                    const grid = card.parentElement;
                    if (!grid) return;

                    const overlay = this.el("div", {
                        id: "library-drag-overlay",
                        style: "position: fixed; inset: 0; z-index: 9998; cursor: grabbing; pointer-events: auto;"
                    });
                    document.body.appendChild(overlay);

                    const preDragRect = card.getBoundingClientRect();
                    card.setAttribute("dragged", "true");
                    grid.setAttribute("dragging-workspace", "true");

                    const placeholder = this.el("div", { className: "library-workspace-card-placeholder" });
                    grid.insertBefore(placeholder, card);

                    card.style.width = preDragRect.width + "px";
                    card.style.height = preDragRect.height + "px";

                    card.style.left = preDragRect.left + "px";
                    card.style.top = preDragRect.top + "px";

                    // position:fixed resolves against the nearest transformed ancestor
                    // (the library host carries a translateX even when fully open),
                    // not the viewport, so re-measure and shift into the card's own
                    // coordinate space. Without this the card jumps right of the grab point.
                    const fixedRect = card.getBoundingClientRect();
                    const coordDX = fixedRect.left - preDragRect.left;
                    const coordDY = fixedRect.top - preDragRect.top;
                    const originLeft = preDragRect.left - coordDX;
                    const originTop = preDragRect.top - coordDY;
                    if (coordDX || coordDY) {
                        card.style.left = originLeft + "px";
                        card.style.top = originTop + "px";
                    }

                    const initialOffsetX = e.clientX - preDragRect.left;
                    const lockedY = originTop;

                    const originalIndex = Array.from(grid.children).indexOf(placeholder);

                    let currentX = originLeft;
                    let targetX = originLeft;
                    let isDragging = true;
                    let mouseX = e.clientX;

                    const finalizeDrop = () => {
                        isDragging = false;
                        overlay.remove();

                        grid.removeAttribute("dragging-workspace");

                        Array.from(grid.children).forEach(s => {
                            s.style.transition = "";
                            s.style.transform = "";
                        });

                        grid.insertBefore(card, placeholder);
                        card.removeAttribute("dragged");
                        card.style.width = "";
                        card.style.height = "";
                        card.style.left = "";
                        card.style.top = "";
                        card.style.backgroundColor = "";

                        const newIndex = Array.from(grid.children).indexOf(card);
                        placeholder.remove();

                        if (newIndex !== originalIndex) {
                            if (window.gZenWorkspaces && window.gZenWorkspaces.reorderWorkspace) {
                                window.gZenWorkspaces.reorderWorkspace(ws.uuid, newIndex);
                                // Nothing here observes workspace changes, and reorderWorkspace may
                                // clamp the index, so resync rather than trust the dropped position.
                                setTimeout(() => {
                                    if (this.library.update) this.library.update();
                                }, 100);
                            }
                        }

                        // Safety: Ensure create button is always last
                        const createBtn = grid.querySelector('.library-create-workspace-button');
                        if (createBtn && (card.compareDocumentPosition(createBtn) & Node.DOCUMENT_POSITION_PRECEDING)) {
                            grid.appendChild(createBtn);
                        }
                    };

                    const moveLoop = () => {
                        if (!isDragging) return;
                        currentX += (targetX - currentX) * 0.42;
                        if (Math.abs(targetX - currentX) < 0.5) currentX = targetX;

                        card.style.left = currentX + "px";
                        card.style.top = lockedY + "px";

                        const currentGridRect = grid.getBoundingClientRect();

                        const scrollThreshold = 150;
                        if (mouseX < currentGridRect.left + scrollThreshold) {
                            const intensity = Math.pow((currentGridRect.left + scrollThreshold - mouseX) / scrollThreshold, 2);
                            grid.scrollLeft -= intensity * 25;
                        } else if (mouseX > currentGridRect.right - scrollThreshold) {
                            const intensity = Math.pow((mouseX - (currentGridRect.right - scrollThreshold)) / scrollThreshold, 2);
                            grid.scrollLeft += intensity * 25;
                        }

                        requestAnimationFrame(moveLoop);
                    };

                    const onMouseMove = (moveEvent) => {
                        mouseX = moveEvent.clientX;
                        targetX = mouseX - initialOffsetX - coordDX;

                        const gridRect = grid.getBoundingClientRect();
                        const scrollLeft = grid.scrollLeft;
                        const paddingLeft = 25;
                        const cardWidthPlusGap = ZenLibrarySpaces.CARD_WIDTH + ZenLibrarySpaces.CARD_GAP;

                        const localX = mouseX - gridRect.left + scrollLeft - paddingLeft;
                        let targetIdx = Math.floor(localX / cardWidthPlusGap);

                        const currentChildren = Array.from(grid.children).filter(c => c.classList.contains('library-workspace-card') && !c.hasAttribute('dragged') || c === placeholder);
                        targetIdx = Math.max(0, Math.min(targetIdx, currentChildren.length - 1));

                        const currentIdx = currentChildren.indexOf(placeholder);

                        if (targetIdx !== currentIdx) {
                            // Find target element among static flow
                            const swapTarget = currentChildren[targetIdx < currentIdx ? targetIdx : targetIdx + 1] || grid.querySelector('.library-create-workspace-button');

                            this.animateWorkspaceCardShift(grid, () => {
                                grid.insertBefore(placeholder, swapTarget);
                            });
                        }
                    };

                    const onMouseUp = () => {
                        isDragging = false;
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                        finalizeDrop();
                    };

                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                    requestAnimationFrame(moveLoop);
                });

                const footer = this.el("div", { className: "library-card-footer" }, [
                    dragHandle,
                    menuBtn
                ]);

                card.appendChild(header);
                card.appendChild(listContainer);
                card.appendChild(footer);

                return card;
            } catch (e) {
                console.error("Error creating workspace card:", e);
                return null;
            }
        }

        animateWorkspaceCardShift(grid, mutate) {
            const cards = Array.from(grid.children).filter(el =>
                el.classList.contains("library-workspace-card") && !el.hasAttribute("dragged")
            );
            const before = new Map(cards.map(el => [el, el.getBoundingClientRect()]));

            mutate();

            cards.forEach(el => {
                const from = before.get(el);
                if (!from) return;

                const to = el.getBoundingClientRect();
                const dx = from.left - to.left;
                if (Math.abs(dx) < 1) return;

                el.style.transition = "none";
                el.style.transform = `translateX(${dx}px)`;
                void el.offsetWidth;
                el.style.transition = "transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)";
                el.style.transform = "";
            });
        }

        _collectUnpinnedTabs(container) {
            // A Set because allItemsRecursive already returns descendants, so a nested group would queue its tabs twice.
            const tabs = new Set();
            const visit = (item) => {
                if (!item) return;
                if (item.hasAttribute?.("cloned") ||
                    item.hasAttribute?.("zen-empty-tab") ||
                    item.hasAttribute?.("zen-essential")) return;
                if (window.gBrowser.isTab(item)) {
                    if (!item.pinned) tabs.add(item);
                    return;
                }
                if (window.gBrowser.isTabGroup(item)) {
                    const children = item.allItemsRecursive || item.allItems || item.tabs || [];
                    for (const child of children) visit(child);
                }
            };
            for (const child of container?.children || []) visit(child);
            return [...tabs];
        }

        closeWorkspaceUnpinnedTabs(workspaceId) {
            const wsEl = window.gZenWorkspaces.workspaceElement(workspaceId);
            // Same unpinned section the card draws from. Direct children can be
            // folders or split views, so we walk those instead of only isTab.
            const tabs = this._collectUnpinnedTabs(wsEl?.tabsContainer);

            if (tabs.length === 0) return;

            // Never pull a focused, playing, PiP, or camera/mic/screen-sharing tab out from under the user.
            let closableTabs = tabs.filter(tab => {
                const attributes = ["selected", "multiselected", "pictureinpicture", "soundplaying"];
                for (const attr of attributes) if (tab.hasAttribute(attr)) return false;
                const browser = tab.linkedBrowser;
                if (window.webrtcUI?.browserHasStreams(browser) ||
                    browser?.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()) return false;
                return true;
            });

            if (closableTabs.length === 0) closableTabs = tabs;

            window.gBrowser.removeTabs(closableTabs, {
                closeWindowWithLastTab: false,
            });

            if (window.gZenUIManager?.showToast) {
                const restoreKey = window.gZenKeyboardShortcutsManager?.getShortcutDisplayFromCommand(
                    "History:RestoreLastClosedTabOrWindowOrSession"
                ) || "Ctrl+Shift+T";

                window.gZenUIManager.showToast("zen-workspaces-close-all-unpinned-tabs-toast", {
                    l10nArgs: { shortcut: restoreKey },
                });
            }

            // removeTabs detaches asynchronously, so repaint after it settles.
            setTimeout(() => this.renderIntoExistingCard(workspaceId), 200);
        }

        renderItemRecursive(item, container, wsId) {
            if (window.gBrowser.isTabGroup(item)) {
                if (item.hasAttribute("split-view-group")) {
                    this.renderSplitView(item, container, wsId);
                } else if (this._isZenFolder(item)) {
                    this.renderFolder(item, container, wsId);
                } else {
                    this.renderTabGroup(item, container, wsId);
                }
            } else if (window.gBrowser.isTab(item)) {
                this.renderTab(item, container, wsId);
            }
        }

        // zen-folder-collapsed is the attribute Zen's folder animation leaves behind; plain groups only have collapsed.
        _isGroupCollapsed(group) {
            return !!(group.hasAttribute("zen-folder-collapsed") || group.collapsed);
        }

        // ATG's arc-style / fill-folders / theme-folders modes strip `collapsed` on sight, so toggling is pointless there.
        _tabGroupsArcLike() {
            try {
                return Services.prefs.getBoolPref("browser.tabs.groups.arc-style", false) ||
                    Services.prefs.getBoolPref("tab.groups.fill-folders", false) ||
                    Services.prefs.getBoolPref("tab.groups.theme-folders", false);
            } catch (e) { return false; }
        }

        // Colour the way ATG's own Library renderer read it: the group's --tab-group-color
        // (native `color` setter, tab-wand, ATG), else ATG's per-group root vars.
        _tabGroupColors(group) {
            const atg = globalThis.advancedTabGroups;
            try { atg?.syncGroupColorVars?.(group); } catch (e) { }
            const groupStyle = window.getComputedStyle(group);
            const docStyle = window.getComputedStyle(document.documentElement);
            const id = group.id || "";
            const color = groupStyle.getPropertyValue("--tab-group-color").trim() ||
                (id && docStyle.getPropertyValue(`--tab-group-color-${id}`).trim()) ||
                (id && docStyle.getPropertyValue(`--tab-group-color-${id}-favicon`).trim()) || "";
            const stroke = groupStyle.getPropertyValue("--tab-group-stroke").trim() ||
                (id && docStyle.getPropertyValue(`--tab-group-color-${id}-invert`).trim()) ||
                (id && docStyle.getPropertyValue(`--tab-group-color-${id}-favicon-invert`).trim()) || "";
            const label = group.querySelector?.(".tab-group-label");
            const text = (label && window.getComputedStyle(label).color) || groupStyle.color || "";
            return { color, stroke, text };
        }

        // ATG's header icon: a clone of the emoji/image it put in the sidebar header, else a plain tile.
        _createTabGroupIcon(group) {
            const iconWrapper = this.el("span", { className: "item-icon atg-tab-group-icon" });
            const sourceIcon = group.querySelector(":scope > .tab-group-label-container .tab-group-icon :is(.group-icon, label)");
            if (sourceIcon) {
                iconWrapper.classList.add("has-custom-icon");
                iconWrapper.appendChild(sourceIcon.cloneNode(true));
            } else {
                iconWrapper.appendChild(this.el("span", { className: "atg-tab-group-icon-fallback" }));
            }
            return iconWrapper;
        }

        // Plain tab-group (Advanced Tab Groups or any non-folder group). Same wrapper / header / body
        // class names ATG's renderer used, because other mods style the Library through them.
        renderTabGroup(group, container, wsId) {
            // An emptied group stays in the strip until its close animation removes it.
            if (!(group.tabs || []).length) return;
            const groupId = `tab-group:${group.id || `${wsId}:${group.label}`}`;
            const arcLike = this._tabGroupsArcLike();
            const isExpanded = arcLike || !this._isGroupCollapsed(group);
            this._folderExpansion.set(groupId, isExpanded);

            const allTabs = group.tabs || [];
            const hasActive = allTabs.some(t => t.selected);
            const { color, stroke, text } = this._tabGroupColors(group);

            const groupEl = this.el("div", { className: `library-workspace-tab-group ${isExpanded ? "" : "collapsed"}` });
            groupEl.dataset.folderId = groupId;
            groupEl.toggleAttribute("expanded", isExpanded);
            groupEl.toggleAttribute("collapsed", !isExpanded);
            groupEl.toggleAttribute("has-active", hasActive && !isExpanded);
            if (color) groupEl.style.setProperty("--atg-tab-group-color", color);
            if (stroke && !stroke.includes("gradient")) groupEl.style.setProperty("--atg-tab-group-stroke", stroke);
            if (text) groupEl.style.setProperty("--atg-tab-group-textcolor", text);
            if (group.hasAttribute("show-grain")) groupEl.setAttribute("show-grain", group.getAttribute("show-grain"));
            const grain = group.style.getPropertyValue("--group-grain");
            if (grain) groupEl.style.setProperty("--group-grain", grain);

            const headerEl = this.el("div", {
                className: `library-workspace-item atg-tab-group ${hasActive ? "selected" : ""}`,
                onclick: (e) => {
                    e.stopPropagation();
                    if (this._draggedTabInfo || this._suppressFolderToggle || arcLike) return;
                    const wantCollapsed = !this._isGroupCollapsed(group);
                    // The native setter fires TabGroupCollapse / TabGroupExpand; ATG's observer persists it.
                    try { group.collapsed = wantCollapsed; } catch (err) {
                        console.error("[ZenLibrary Spaces] group.collapsed threw:", err);
                    }
                    const newlyExpanded = !wantCollapsed;
                    this._folderExpansion.set(groupId, newlyExpanded);
                    groupEl.classList.toggle("collapsed", !newlyExpanded);
                    groupEl.toggleAttribute("expanded", newlyExpanded);
                    groupEl.toggleAttribute("collapsed", !newlyExpanded);
                    groupEl.toggleAttribute("has-active", hasActive && !newlyExpanded);
                    if (newlyExpanded) {
                        const peek = groupEl.querySelector(":scope > .library-workspace-folder-peek");
                        if (peek) this._animateFolderPeek(peek, false);
                    }
                    this._animateFolderHeight(groupEl, newlyExpanded);
                    if (!newlyExpanded) this._renderFolderPeek(groupEl, group, wsId, true);
                }
            });

            headerEl.appendChild(this._createTabGroupIcon(group));
            headerEl.appendChild(this.el("span", { className: "item-label", textContent: group.label || "Tab Group" }));

            let showFolderButton = false;
            try { showFolderButton = Services.prefs.getBoolPref("browser.tabs.groups.show-folder-button", false); } catch (e) { }
            if (showFolderButton && window.gZenFolders?.createFolder) {
                const folderBtn = this.el("div", {
                    className: "atg-tab-group-folder-button",
                    title: "Convert to Folder",
                    onclick: (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this._convertGroupToFolder(group, wsId);
                        setTimeout(() => this.renderIntoExistingCard(wsId), 200);
                    }
                }, [this.el("div", { className: "icon-mask" })]);
                folderBtn.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
                headerEl.appendChild(folderBtn);
            }

            const closeBtn = this.el("div", {
                className: "atg-tab-group-close-button",
                title: "Close Group",
                onclick: (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this._forgetAtgGroupState(group);
                    try { window.gBrowser.removeTabGroup(group); } catch (err) {
                        console.error("[ZenLibrary Spaces] removeTabGroup threw:", err);
                    }
                    setTimeout(() => this.renderIntoExistingCard(wsId), 200);
                }
            }, [this.el("div", { className: "icon-mask" })]);
            closeBtn.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
            headerEl.appendChild(closeBtn);

            headerEl._libraryDropItem = group;
            headerEl.draggable = true;
            headerEl.addEventListener("dragstart", (e) => this.onGroupDragStart(e, group, wsId));
            headerEl.addEventListener("dragend", () => this.clearTabDragState());
            groupEl.appendChild(headerEl);

            // Children in DOM order, nested groups included; ATG's renderer drew every tab first and the nested groups after.
            const contentEl = this.el("div", { className: "library-workspace-tab-group-content" });
            contentEl.appendChild(this.el("div", { className: "library-folder-group-start" }));
            this._groupChildren(group).forEach(child => this.renderItemRecursive(child, contentEl, wsId));
            if (!isExpanded) contentEl.hidden = true;

            groupEl.appendChild(contentEl);
            this._renderFolderPeek(groupEl, group, wsId);
            this._bindFolderDropTarget(groupEl, headerEl, contentEl, group, wsId);
            container.appendChild(groupEl);
        }

        // ATG keeps colour / icon / nesting / collapsed state per group id in the session; drop them with the group.
        _forgetAtgGroupState(group) {
            const atg = globalThis.advancedTabGroups;
            if (!atg || !group?.id) return;
            try {
                atg.removeSavedColor?.(group.id);
                atg.removeSavedIcon?.(group.id);
                atg.removeSavedParentTree?.(group.id);
                atg.removeSavedCollapsedState?.(group.id);
            } catch (e) { }
        }

        renderSplitView(group, container, wsId) {
            const splitEl = this.el("div", { className: "library-split-view-group" });
            const tabs = (group.tabs || []).filter(child => {
                return !child.hasAttribute('cloned') && !child.hasAttribute('zen-empty-tab');
            });
            tabs.forEach(tab => this.renderTab(tab, splitEl, wsId));
            container.appendChild(splitEl);
        }

        renderFolder(folder, container, wsId) {
            const folderId = folder.id || `${wsId}:${folder.label}`;
            const isExpanded = !this._isGroupCollapsed(folder);
            this._folderExpansion.set(folderId, isExpanded);

            const allTabs = folder.allItemsRecursive || folder.tabs || [];
            const hasActive = allTabs.some(t => t.selected);

            const folderEl = this.el("div", { className: `library-workspace-folder ${isExpanded ? '' : 'collapsed'}` });
            folderEl.dataset.folderId = folderId;
            folderEl.toggleAttribute("has-active", hasActive && !isExpanded);

            const headerEl = this.el("div", {
                className: "library-workspace-item folder",
                onclick: (e) => {
                    e.stopPropagation();
                    if (this._draggedTabInfo) return;
                    if (this._suppressFolderToggle) return;
                    const wantCollapsed = !this._isGroupCollapsed(folder);
                    this._syncNativeFolderCollapsed(folder, wantCollapsed);
                    // Authoritative: derive from intent, not by re-reading the
                    // native property, which can still report the pre-toggle
                    // value while Zen's collapse runs.
                    const newlyExpanded = !wantCollapsed;
                    this._folderExpansion.set(folderId, newlyExpanded);
                    folderEl.toggleAttribute("has-active", hasActive && !newlyExpanded);

                    const iconSvg = headerEl.querySelector(".folder-icon svg");
                    if (iconSvg) {
                        iconSvg.setAttribute("state", newlyExpanded ? "open" : "close");
                        // Peek state changes with the toggle too: a collapsed
                        // folder holding the active tab shows dots.
                        iconSvg.setAttribute("active", String(hasActive && !newlyExpanded));
                    }

                    // The peek grows in while the body slides away and shrinks out while it
                    // opens, on the same clock: popping it in or out in one frame hopped
                    // every row below the folder by a row height at each toggle.
                    if (newlyExpanded) {
                        const peek = folderEl.querySelector(":scope > .library-workspace-folder-peek");
                        if (peek) this._animateFolderPeek(peek, false);
                    }
                    this._animateFolderHeight(folderEl, newlyExpanded);
                    if (!newlyExpanded) {
                        this._renderFolderPeek(folderEl, folder, wsId, true);
                    }
                }
            });

            const folderIconSvg = this.createFolderIconSVG(folder.iconURL, isExpanded ? "open" : "close", hasActive && !isExpanded, folderId);

            const iconWrapper = this.el("span", { className: "tab-group-folder-icon folder-icon" });
            iconWrapper.appendChild(folderIconSvg);
            headerEl.appendChild(iconWrapper);

            headerEl.appendChild(this.el("span", { className: "item-label", textContent: folder.label || "Folder" }));
            headerEl._libraryDropItem = folder;
            headerEl.draggable = true;
            headerEl.addEventListener("dragstart", (e) => this.onGroupDragStart(e, folder, wsId));
            headerEl.addEventListener("dragend", () => this.clearTabDragState());

            folderEl.appendChild(headerEl);

            const contentEl = this.el("div", { className: "library-workspace-folder-content" });
            contentEl.appendChild(this.el("div", { className: "library-folder-group-start" }));
            this._groupChildren(folder).forEach(child => this.renderItemRecursive(child, contentEl, wsId));
            if (!isExpanded) contentEl.hidden = true;

            folderEl.appendChild(contentEl);
            this._renderFolderPeek(folderEl, folder, wsId);
            this._bindFolderDropTarget(folderEl, headerEl, contentEl, folder, wsId);
            container.appendChild(folderEl);
        }

        // A collapsed folder or group holding the active tab peeks that tab below
        // its header (the sidebar keeps tab[selected] visible too). The content
        // list stays collapsed-hidden; the peek is a separate visible clone built
        // with the normal tab renderer.
        _renderFolderPeek(folderEl, folder, wsId, animate = false) {
            folderEl.querySelector(":scope > .library-workspace-folder-peek")?.remove();
            const items = folder.allItemsRecursive || folder.tabs || [];
            const isCollapsed = this._isGroupCollapsed(folder);
            const activeTab = isCollapsed && items.find(t => t.selected && window.gBrowser?.isTab?.(t));
            if (!activeTab) return;
            const peekEl = this.el("div", { className: "library-workspace-folder-peek" });
            this.renderTab(activeTab, peekEl, wsId);
            folderEl.appendChild(peekEl);
            if (animate) this._animateFolderPeek(peekEl, true);
        }

        // Same 120ms ease-in-out as _animateFolderHeight so the folder's total height changes
        // continuously: the body's shrink and the peek's growth overlap instead of the peek
        // landing at full height in the frame the body starts sliding. A hide starts from
        // whatever height a still-running show has reached; the node leaves the DOM at the end.
        _animateFolderPeek(peekEl, show) {
            const previous = peekEl._peekSlide;
            peekEl._peekSlide = null;
            // In-flight height while the old keyframes still fill; natural height once they are gone.
            const inFlight = previous ? peekEl.getBoundingClientRect().height : null;
            try { previous?.cancel(); } catch (e) { }
            const natural = peekEl.getBoundingClientRect().height;

            const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            if (reduce || natural <= 0 || typeof peekEl.animate !== "function") {
                if (!show) peekEl.remove();
                return;
            }

            const start = inFlight ?? (show ? 0 : natural);
            const from = { height: `${start}px`, opacity: Math.min(1, start / natural) };
            const to = show ? { height: `${natural}px`, opacity: 1 } : { height: "0px", opacity: 0 };
            const frames = [from, to];
            peekEl.style.overflow = "clip";
            const slide = peekEl.animate(frames, { duration: 120, easing: "ease-in-out", fill: "forwards" });
            peekEl._peekSlide = slide;
            slide.addEventListener("finish", () => {
                if (peekEl._peekSlide !== slide) return;
                peekEl._peekSlide = null;
                if (!show) {
                    peekEl.remove();
                    return;
                }
                // Natural height again; the inline clip is only for the tween.
                try { slide.cancel(); } catch (e) { }
                peekEl.style.removeProperty("overflow");
            });
        }

        // Folder and plain-group wrappers share the body mechanics; only the body class differs.
        _folderBody(folderEl) {
            return folderEl.querySelector(":scope > .library-workspace-folder-content, :scope > .library-workspace-tab-group-content");
        }

        _folderGroupStart(folderEl) {
            return this._folderBody(folderEl)?.querySelector(":scope > .library-folder-group-start") || null;
        }

        // Read with the spacer margin already at 0: the body is auto-height, so
        // its own box is the full row stack. scrollHeight is not usable here —
        // overflow: clip means this is not a scroll container.
        _folderBodyHeight(contentEl) {
            return contentEl.getBoundingClientRect().height;
        }

        // Native nsZenFolders.animateCollapse / animateExpand: the body keeps its
        // height, overflow clips, and the leading spacer's margin-top pulls every row
        // up as one block over 120ms ease-in-out. Once collapse settles the body is
        // hidden, which is the resting state — the margin alone is not.
        _animateFolderHeight(folderEl, expand) {
            const contentEl = this._folderBody(folderEl);
            const startEl = this._folderGroupStart(folderEl);
            if (!contentEl || !startEl) return;

            const previous = startEl._folderSlide;
            startEl._folderSlide = null;
            try { previous?.cancel(); } catch (e) { }

            // Measure with the body shown and unshifted, whichever way we are going.
            if (expand) folderEl.classList.remove("collapsed");
            contentEl.hidden = false;
            startEl.style.marginTop = "0px";
            const height = this._folderBodyHeight(contentEl);
            if (!expand) folderEl.classList.add("collapsed");

            const shift = -(height + 4);
            const from = expand ? shift : 0;
            const to = expand ? 0 : shift;
            startEl.style.marginTop = `${from}px`;

            const rest = () => {
                startEl._folderSlide = null;
                startEl.style.marginTop = `${to}px`;
                if (folderEl.classList.contains("collapsed")) contentEl.hidden = true;
            };

            const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            if (reduce || height <= 0 || typeof startEl.animate !== "function") {
                rest();
                return;
            }

            // Element.animate, not gZenUIManager.motion: that playback object is not
            // reliably thenable, so Promise.resolve(run).then(...) settled on the next
            // microtask and hid the body before the slide had run at all.
            const slide = startEl.animate(
                [{ marginTop: `${from}px` }, { marginTop: `${to}px` }],
                { duration: 120, easing: "ease-in-out", fill: "forwards" }
            );
            startEl._folderSlide = slide;
            slide.addEventListener("finish", () => {
                if (startEl._folderSlide !== slide) return;
                rest();
                // The inline style now holds the end value, so stop it filling.
                try { slide.cancel(); } catch (e) { }
            });
        }

        renderTab(tab, container, wsId) {
            const iconSrc = this.getTabIcon(tab);
            const isPinned = tab.pinned;

            const itemEl = this.el("div", {
                className: `library-workspace-item ${tab.selected ? 'selected' : ''}`,
                onclick: () => {
                    // A drag that ended on this row fires click too; _draggedTabInfo is the
                    // drag's own state, so it can't strand a flag if dragend never arrives.
                    if (this._draggedTabInfo) return;
                    if (window.gZenWorkspaces.activeWorkspace !== wsId) {
                        window.gZenWorkspaces.changeWorkspaceWithID(wsId);
                    }
                    window.gBrowser.selectedTab = tab;
                    window.gZenLibrary.close();
                }
            }, [
                this.el("img", { src: iconSrc || undefined, className: "item-icon", onerror: (e) => e.currentTarget.removeAttribute("src") }),
                this.el("span", { className: "item-label", textContent: tab.label })
            ]);
            itemEl.draggable = true;
            itemEl._libraryDropItem = tab;
            itemEl.addEventListener("dragstart", (e) => this.onTabDragStart(e, tab, wsId));
            this._bindRowDropTarget(itemEl, tab, wsId);
            itemEl.addEventListener("dragend", () => this.clearTabDragState());

            const contextId = tab.getAttribute("usercontextid");
            if (contextId && contextId !== "0" && !this.isWorkspaceProfileContainer(wsId, contextId, tab)) {
                const computedStyle = window.getComputedStyle(tab);
                const identityColor = computedStyle.getPropertyValue("--identity-tab-color");
                const identityLine = this.el("div", {
                    className: "library-tab-identity-line",
                    style: `--identity-tab-color: ${identityColor || 'transparent'}`
                });
                itemEl.appendChild(identityLine);
            }

            const closeBtn = this.el("div", {
                className: `library-tab-close-button ${isPinned ? 'unpin' : 'close'}`,
                title: isPinned ? "Unpin Tab" : "Close Tab",
                onclick: (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (isPinned) {
                        window.gBrowser.unpinTab(tab);
                    } else {
                        window.gBrowser.removeTab(tab);
                    }
                    // removeTab/unpinTab detach the tab asynchronously; repainting at 0ms
                    // still sees it in the container and the row comes straight back.
                    setTimeout(() => this.renderIntoExistingCard(wsId), 150);
                }
            }, [this.el("div", { className: "icon-mask" })]);
            closeBtn.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
            itemEl.appendChild(closeBtn);

            container.appendChild(itemEl);
        }

        // Zen stores a user-chosen icon on the tab itself and only mirrors it into `image`
        // for loaded tabs, so an unloaded pinned tab reports its old favicon there.
        // The favicon lives only in the `image` attribute — there is no `tab.image`
        // property in Gecko, which is why every tab used to fall through to the default.
        // No default favicon here: tabs without an icon (blank, about:x) get Zen's
        // native missing-icon tile via the .item-icon:not([src]) style instead.
        getTabIcon(tab) {
            return tab.zenStaticIcon ||
                tab.getAttribute?.("image") ||
                "";
        }

        getWorkspaceProfileId(wsId) {
            const workspaces = ZenLibrarySpaces.getWorkspaces();
            const ws = workspaces.find(workspace => workspace.uuid === wsId);
            return String(ws?.containerTabId || "0");
        }

        isWorkspaceProfileContainer(wsId, contextId, tab) {
            if (tab?.hasAttribute?.("zenDefaultUserContextId")) return true;
            const profileId = this.getWorkspaceProfileId(wsId);
            return profileId !== "0" && profileId === String(contextId || "0");
        }

        getWorkspaceIconAnchor(ws) {
            return this.library.shadowRoot?.querySelector?.(`.library-workspace-card[workspace-id="${CSS.escape(ws.uuid)}"] .library-workspace-icon-container`);
        }

        onTabDragStart(e, tab, wsId) {
            // Essentials are shared across every space; moveTabsToWorkspace skips them
            // outright, so a drag would only ever be a no-op that looked like it worked.
            if (!window.gBrowser?.isTab?.(tab) || tab.hasAttribute("zen-essential")) {
                e.preventDefault();
                return;
            }
            this._draggedTabInfo = { tab, wsId };
            e.dataTransfer.effectAllowed = "move";
            // Never read back; some platforms refuse to start a drag with an empty payload.
            e.dataTransfer.setData("text/x-zen-library-tab", tab.getAttribute("zen-tab-id") || tab.linkedPanel || tab.id || "");
            e.currentTarget.setAttribute("dragged", "true");
            // Reveals the pin drop zone on spaces that have nothing pinned yet.
            this.library.shadowRoot?.querySelector?.(".library-workspace-grid")
                ?.setAttribute("dragging-tab", "true");
        }

        // Folders and plain tab groups share one drag model: a group moves as a unit, and
        // crossing the pinned boundary converts it (folder <-> group) at the drop position.
        onGroupDragStart(e, group, wsId) {
            if (!this._isDropGroup(group)) {
                e.preventDefault();
                return;
            }
            this._suppressFolderToggle = true;
            this._draggedTabInfo = { group, wsId };
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/x-zen-library-folder", group.id || group.label || "group");
            e.currentTarget.setAttribute("dragged", "true");
            const grid = this.library.shadowRoot?.querySelector?.(".library-workspace-grid");
            grid?.setAttribute("dragging-group", this._isZenFolder(group) ? "folder" : "group");
            e.stopPropagation();
        }

        _bindRowDropTarget(el, target, wsId) {
            el.addEventListener("dragover", (e) => this.onTabDragOver(e, target, wsId));
            el.addEventListener("dragleave", (e) => this._onRowDragLeave(e));
            el.addEventListener("drop", (e) => this.onTabDrop(e, target, wsId));
        }

        // Match ZenDragAndDrop: folder header middle is drop-into-folder; sibling
        // insert is one overlay line (not per-row ::before/::after).
        _bindFolderDropTarget(folderEl, headerEl, contentEl, folder, wsId) {
            headerEl.addEventListener("dragover", (e) => this.onFolderDragOver(e, folderEl, headerEl, folder, wsId));
            headerEl.addEventListener("dragleave", (e) => this._onRowDragLeave(e));
            headerEl.addEventListener("drop", (e) => this.onFolderDrop(e, wsId));

            contentEl.addEventListener("dragover", (e) => this.onFolderContentDragOver(e, folderEl, headerEl, contentEl, folder, wsId));
            contentEl.addEventListener("drop", (e) => this.onFolderContentDrop(e, folderEl, wsId));

            // Header margin and collapsed body sit on the wrapper, not the header.
            // Without this, that strip has no drop listener → forbidden cursor.
            folderEl.addEventListener("dragover", (e) => this.onFolderShellDragOver(e, folderEl, headerEl, folder, wsId));
            folderEl.addEventListener("drop", (e) => this.onFolderDrop(e, wsId));
            folderEl.addEventListener("dragleave", (e) => this._onRowDragLeave(e));
        }

        // dragleave fires when the pointer enters a child (icon, label). Only clear when
        // the pointer has actually left the row, or the drop line flickers off mid-hover.
        _onRowDragLeave(e) {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            if (e.currentTarget.hasAttribute("drag-over")) e.currentTarget.removeAttribute("drag-over");
            const folderEl = this._wrapperOf(e.currentTarget);
            if (folderEl && !folderEl.contains(e.relatedTarget)) {
                this._setCollapsedFolderDragIcon(null, false);
            }
        }

        static WRAPPER_SELECTOR = ".library-workspace-folder, .library-workspace-tab-group";

        _isWrapper(el) {
            return !!(el?.classList?.contains("library-workspace-folder") || el?.classList?.contains("library-workspace-tab-group"));
        }

        // The folder / group wrapper an element belongs to (itself when it is one).
        _wrapperOf(el) {
            if (!el) return null;
            return this._isWrapper(el) ? el : el.closest?.(ZenLibrarySpaces.WRAPPER_SELECTOR);
        }

        _isHeaderRow(el) {
            return !!(el?.classList?.contains("folder") || el?.classList?.contains("atg-tab-group"));
        }

        _ensureDropIndicator(list) {
            const root = this.library.shadowRoot;
            let el = root?.getElementById?.("library-tab-drop-indicator");
            if (!el) el = this.el("div", { id: "library-tab-drop-indicator" });
            if (list && el.parentElement !== list) list.appendChild(el);
            return el;
        }

        // One overlay, like Zen's #zen-drag-indicator. Anchored to the card list so
        // library/appcontent transforms cannot offset a position:fixed line.
        _showDropIndicator(row, placeAfter) {
            if (!row) {
                this._hideDropIndicator();
                return;
            }
            const list = row.closest(".library-workspace-card-list");
            if (!list) {
                this._hideDropIndicator();
                return;
            }
            const indicator = this._ensureDropIndicator(list);
            const rowRect = row.getBoundingClientRect();
            const listRect = list.getBoundingClientRect();
            const y = (placeAfter ? rowRect.bottom : rowRect.top) - listRect.top + list.scrollTop;
            if (y < list.scrollTop - 2 || y > list.scrollTop + list.clientHeight + 2) {
                this._hideDropIndicator();
                return;
            }
            const card = row.closest(".library-workspace-card");
            const accent = card && getComputedStyle(card).getPropertyValue("--ws-primary-color").trim();
            if (accent) indicator.style.setProperty("--library-drop-accent", accent);
            else indicator.style.removeProperty("--library-drop-accent");
            // Same math as Zen's #zen-drag-indicator: size the line to the hovered
            // row (so nested folders indent), then CSS insets the pill from that box.
            const separation = 4;
            indicator.style.top = `${Math.round(y)}px`;
            indicator.style.setProperty(
                "--indicator-left",
                `${Math.round(rowRect.left - listRect.left + list.scrollLeft + separation / 2)}px`
            );
            indicator.style.setProperty(
                "--indicator-width",
                `${Math.round(Math.max(rowRect.width - separation, 8))}px`
            );
            indicator.setAttribute("visible", "true");
        }

        _hideDropIndicator() {
            this.library.shadowRoot?.getElementById?.("library-tab-drop-indicator")
                ?.removeAttribute("visible");
        }

        _setDragOver(el, value) {
            const root = this.library.shadowRoot;
            root?.querySelectorAll?.("[drag-over]").forEach(node => {
                if (node !== el) {
                    node.removeAttribute("drag-over");
                    this._setCollapsedFolderDragIcon(node, false);
                }
            });

            if (!el || !value) {
                this._hideDropIndicator();
                this._setCollapsedFolderDragIcon(null, false);
                el?.removeAttribute("drag-over");
                return;
            }

            if (value === "before" || value === "after") {
                if (el.classList.contains("library-workspace-separator-container")) {
                    this._hideDropIndicator();
                    this._setCollapsedFolderDragIcon(null, false);
                    el.setAttribute("drag-over", value);
                    return;
                }
                el.removeAttribute("drag-over");
                this._showDropIndicator(el, value === "after");
                this._setCollapsedFolderDragIcon(el, false);
                return;
            }

            this._hideDropIndicator();
            el.setAttribute("drag-over", value);
            this._setCollapsedFolderDragIcon(el, value === "into");
        }

        // Zen opens a collapsed folder icon while the pointer is over the into-folder zone.
        // Plain group headers only carry a folder svg when another mod adds one; the selector covers both.
        _setCollapsedFolderDragIcon(el, into) {
            const keep = into && el ? this._wrapperOf(el) : null;
            const keepCollapsed = keep?.classList.contains("collapsed") ? keep : null;
            this.library.shadowRoot?.querySelectorAll?.(".library-workspace-folder.collapsed, .library-workspace-tab-group.collapsed").forEach(node => {
                if (node === keepCollapsed) return;
                node.querySelector(":scope > .library-workspace-item .folder-icon svg[state='open']")
                    ?.setAttribute("state", "close");
            });
            if (!keepCollapsed) return;
            keepCollapsed.querySelector(":scope > .library-workspace-item .folder-icon svg")
                ?.setAttribute("state", "open");
        }

        _itemIsPinned(item, wsId) {
            if (item?.pinned) return true;
            const wsEl = window.gZenWorkspaces?.workspaceElement?.(wsId);
            return !!(item && wsEl?.pinnedTabsContainer?.contains(item));
        }

        // Direct children in DOM order: tabs, split views and nested groups. zen-folder exposes
        // allItems; a plain tab-group only has the container (its `tabs` getter is recursive).
        _groupChildren(group) {
            const raw = group?.allItems || Array.from(group?.groupContainer?.children || []);
            return raw.filter(child => {
                if (!window.gBrowser.isTab(child) && !window.gBrowser.isTabGroup(child)) return false;
                return !child.hasAttribute?.("cloned") && !child.hasAttribute?.("zen-empty-tab");
            });
        }

        // zen.tabs.folder-dragover-threshold-percent: edge of the header is sibling
        // insert, middle is drop-into-folder.
        _folderDragoverThreshold() {
            try {
                const pct = Services?.prefs?.getIntPref?.("zen.tabs.folder-dragover-threshold-percent");
                if (Number.isFinite(pct)) return Math.min(Math.max(pct / 100, 0.05), 0.45);
            } catch (e) { }
            return 0.2;
        }

        _isZenFolder(item) {
            return !!(item?.isZenFolder && !item.hasAttribute?.("split-view-group"));
        }

        // Any group a row can be dropped into or dragged as a unit: zen-folder or plain tab-group, never a split view.
        _isDropGroup(item) {
            return !!(item && window.gBrowser.isTabGroup(item) && !item.hasAttribute?.("split-view-group"));
        }

        // Zen owns the native side. The collapsed setter fires TabGroupCollapse /
        // TabGroupExpand, and gZenFolders.animateCollapse / animateExpand write the
        // margin on .zen-tab-group-start, the container's hidden state, has-active,
        // folder-active and the per-tab indent.
        //
        // Nothing else may be written here. When a descendant holds the selected tab
        // Zen deliberately keeps the container visible and its shift at 0 so that tab
        // stays on screen; pinning a full-height margin and hidden from this side took
        // the active tab out of the sidebar and left the margin stale on expand.
        _syncNativeFolderCollapsed(folder, collapsed) {
            if (!this._isZenFolder(folder)) return;
            try {
                folder.collapsed = collapsed;
            } catch (e) {
                console.error("[ZenLibrary Spaces] folder.collapsed threw:", e);
            }
            if (!collapsed) return;
            // Zen writes the resting margin when its 120ms animation settles, so both
            // passes land after that; the second covers a slow frame. Idempotent.
            for (const delay of [200, 450]) {
                setTimeout(() => this._repinCollapsedFolder(folder), delay);
            }
        }

        // How much of the folder still sticks out below its own header. A folder that
        // finished collapsing ends flush with the label container.
        _folderOverhang(folder, label) {
            return folder.getBoundingClientRect().bottom - label.getBoundingClientRect().bottom;
        }

        // gZenFolders sizes the collapse from getBoundsWithoutFlushing, which reads
        // cached layout. Driven from the Library the read can land against a layout
        // our own toggle just dirtied, and it comes up short in proportion to the row
        // count, so tall folders keep a strip of rows on screen.
        //
        // Correct against what is actually rendered rather than re-deriving the
        // height: pull the spacer up by the overhang, then keep it only if the folder
        // really did shrink, so a legitimate resting gap is not eaten. Never when
        // has-active — there the 0-shift is deliberate so the selected descendant
        // stays on screen.
        _repinCollapsedFolder(folder) {
            if (!folder?.isConnected || !folder.collapsed) return;
            if (folder.hasAttribute("has-active")) return;
            const groupStart = folder.groupStartElement;
            const label = folder.labelContainerElement;
            if (!groupStart || !label) return;

            const overhang = this._folderOverhang(folder, label);
            if (overhang <= 1) return;

            const previous = groupStart.style.marginTop;
            const current = parseFloat(window.getComputedStyle(groupStart).marginTop) || 0;
            groupStart.style.marginTop = `${current - overhang}px`;
            if (this._folderOverhang(folder, label) >= overhang - 0.5) {
                groupStart.style.marginTop = previous;
            }
        }

        // Group (folder or plain) the item lives in. For a group, that is its parent, so
        // before/after the group is a sibling insert (same as Zen's ungroup / addTabs split).
        _containingGroup(item) {
            if (!item) return null;
            if (this._isDropGroup(item)) {
                const parent = item.group;
                return this._isDropGroup(parent) ? parent : null;
            }
            let group = item.group;
            if (group?.hasAttribute?.("split-view-group")) group = group.group;
            return this._isDropGroup(group) ? group : null;
        }

        _containingZenFolder(item) {
            const group = this._containingGroup(item);
            return this._isZenFolder(group) ? group : null;
        }

        // A folder dropped into a plain group becomes a nested group and a group dropped into a
        // folder becomes a subfolder, so "into" is open across kinds; only live folders and
        // Zen's subfolder depth close it.
        _canDropIntoGroup(target) {
            if (!this._isDropGroup(target)) return false;
            const dragged = this._draggedTabInfo?.group;
            if (dragged) {
                if (this._folderDropBlocked(target)) return false;
                if (target.isLiveFolder) return false;
                if (dragged.isLiveFolder && !this._isZenFolder(target)) return false;
                if (this._isZenFolder(target)) return this._folderDepthAllows(target);
                return true;
            }
            const tab = this._draggedTabInfo?.tab;
            if (!tab) return false;
            if (target.isLiveFolder) {
                const liveId = tab.getAttribute?.("zen-live-folder-item-id");
                if (!liveId || !liveId.startsWith(`${target.id}:`)) return false;
            }
            return true;
        }

        // zen.folders.max-subfolders, the same check gZenFolders.canDropElement makes for a dragged folder.
        _folderDepthAllows(parentFolder) {
            let max = 5;
            try { max = Services.prefs.getIntPref("zen.folders.max-subfolders", 5); } catch (e) { }
            return (parentFolder?.level ?? 0) + 1 < max;
        }

        _applyFolderMembership(tab, wantGroup) {
            const current = this._containingGroup(tab);
            if (current === wantGroup) return;
            if (wantGroup) {
                this._addTabToFolder(tab, wantGroup);
                return;
            }
            try {
                // ungroupTab pops one nesting level. Keep going until the tab is
                // actually top-level, same as Zen's #applyFolderMembership.
                for (let depth = 0; depth < 16 && this._isDropGroup(tab.group); depth++) {
                    window.gBrowser.ungroupTab(tab);
                }
            } catch (e) {
                console.error("[ZenLibrary Spaces] ungroupTab threw:", e);
            }
        }

        _dropRowFromNode(node) {
            while (node) {
                if (node.id === "library-tab-drop-indicator" ||
                    node.classList.contains("library-workspace-separator-container") ||
                    node.classList.contains("library-workspace-unpinned-section") ||
                    node.classList.contains("library-folder-group-start") ||
                    node.classList.contains("empty-state")) {
                    node = node.nextElementSibling;
                    continue;
                }
                if (this._isWrapper(node)) {
                    return node.querySelector(":scope > .library-workspace-item");
                }
                if (node.classList.contains("library-split-view-group")) {
                    return node.querySelector(":scope > .library-workspace-item");
                }
                if (node.classList.contains("library-workspace-item")) return node;
                node = node.nextElementSibling;
            }
            return null;
        }

        // The later of two adjacent rows owns the gap. That way "after this" and
        // "before the next" are the same line instead of two stacked drop zones.
        _nextDropRow(el) {
            let node = this._isHeaderRow(el) ? el.parentElement : el;
            let next = node.nextElementSibling;
            while (!next) {
                const parent = node.parentElement;
                if (!parent || parent.classList.contains("library-workspace-card-list")) return null;
                if (parent.classList.contains("library-workspace-unpinned-section")) return null;
                node = parent.classList.contains("library-workspace-folder-content") ||
                    parent.classList.contains("library-workspace-tab-group-content")
                    ? parent.parentElement
                    : parent;
                next = node.nextElementSibling;
            }
            // The separator is the pin boundary, not a row. Do not steal this
            // section's "after" for the first row on the other side of it.
            if (next.classList.contains("library-workspace-separator-container") ||
                next.classList.contains("library-workspace-unpinned-section")) return null;
            return this._dropRowFromNode(next);
        }

        _placeAfterOnRow(el, target, wsId) {
            const nextRow = this._nextDropRow(el);
            if (nextRow?._libraryDropItem) {
                this._setDragOver(nextRow, "before");
                this._setDropIntent({ kind: "row", target: nextRow._libraryDropItem, placeAfter: false }, wsId);
                return;
            }
            // Last in this section: after a tab that still lives in a group means
            // after that group, so the tab can leave (Zen ungroups past the group).
            const group = this._containingGroup(target);
            if (group && !this._isDropGroup(target)) {
                this._setDragOver(el, "after");
                this._setDropIntent({ kind: "row", target: group, placeAfter: true }, wsId);
                return;
            }
            this._setDragOver(el, "after");
            this._setDropIntent({ kind: "row", target, placeAfter: true }, wsId);
        }

        _isGroupDrag() {
            return !!this._draggedTabInfo?.group;
        }

        _isFolderAncestor(ancestor, node) {
            for (let cur = node; cur; cur = cur.group) {
                if (cur === ancestor) return true;
            }
            return false;
        }

        // A group cannot land on itself or inside its own subtree.
        _folderDropBlocked(target) {
            const dragged = this._draggedTabInfo?.group;
            if (!dragged || !target) return false;
            return dragged === target || this._isFolderAncestor(dragged, target);
        }

        _pinnedContainer(wsId) {
            return window.gZenWorkspaces?.workspaceElement?.(wsId)?.pinnedTabsContainer;
        }

        _lastPinnedDropRow(list) {
            const sep = list?.querySelector?.(":scope > .library-workspace-separator-container");
            let node = sep ? sep.previousElementSibling : null;
            for (; node; node = node.previousElementSibling) {
                if (node.id === "library-tab-drop-indicator") continue;
                const row = this._dropRowFromNode(node);
                if (row) return row;
            }
            return null;
        }

        // Margin between pinned rows hits the list, not the row. Map that gap to
        // "before the next row" so it cannot fall through as "after the last tab".
        _pinnedRowBelowY(list, clientY) {
            const sep = list?.querySelector?.(":scope > .library-workspace-separator-container");
            for (let node = list?.firstElementChild; node && node !== sep; node = node.nextElementSibling) {
                if (node.id === "library-tab-drop-indicator") continue;
                const row = this._dropRowFromNode(node);
                if (!row) continue;
                if (clientY < node.getBoundingClientRect().top) return row;
            }
            return null;
        }

        _lastUnpinnedDropRow(list) {
            const section = list?.querySelector?.(":scope > .library-workspace-unpinned-section");
            const from = section || list;
            for (let node = from?.lastElementChild; node; node = node.previousElementSibling) {
                if (node.id === "library-tab-drop-indicator") continue;
                if (node.classList.contains("library-workspace-separator-container")) return null;
                if (node.classList.contains("empty-state")) continue;
                const row = this._dropRowFromNode(node);
                if (row) return row;
            }
            return null;
        }

        _firstUnpinnedDropRow(list) {
            const section = list?.querySelector?.(":scope > .library-workspace-unpinned-section");
            return section ? this._dropRowFromNode(section.firstElementChild) : null;
        }

        _isUnpinnedPointOnCard(card, clientY, clientX) {
            const section = card?.querySelector?.(".library-workspace-unpinned-section");
            if (!section) return false;
            const r = section.getBoundingClientRect();
            if (Number.isFinite(clientX) && (clientX < r.left || clientX >= r.right)) return false;
            return clientY >= r.top && clientY < r.bottom;
        }

        _isUnpinnedDragPoint(e) {
            return this._isUnpinnedPointOnCard(this._cardOf(e.currentTarget), e.clientY, e.clientX);
        }

        // Which section an intent lands in. pinned-card / card carry it; a row or group target tells by where it lives.
        _intentLandsPinned(intent, wsId) {
            if (!intent) return false;
            if (intent.kind === "pinned-card") return true;
            if (intent.kind === "card") return false;
            if (intent.kind === "into") return this._itemIsPinned(intent.folder, wsId);
            return this._itemIsPinned(intent.target, wsId);
        }

        // A live folder only syncs as a folder, so it may not land where it would have to become a group.
        _groupCanLand(intent, wsId) {
            const dragged = this._draggedTabInfo?.group;
            if (!dragged) return true;
            if (dragged.isLiveFolder && !this._intentLandsPinned(intent, wsId)) return false;
            return true;
        }

        _setDropIntent(intent, wsId) {
            if (this._isGroupDrag() && !this._groupCanLand(intent, wsId)) {
                this._rejectGroupDropHover();
                return;
            }
            this._dropIntent = { ...intent, wsId };
            this._markDropCard(wsId);
            // Crossing the pinned boundary converts: folder -> group or group -> folder. Flag it for the indicator.
            const dragged = this._draggedTabInfo?.group;
            const converts = !!dragged && this._isZenFolder(dragged) !== this._intentLandsPinned(intent, wsId);
            this.library.shadowRoot?.querySelector?.(".library-workspace-grid")
                ?.toggleAttribute("drop-converts", converts);
        }

        // Cards are clipped, but a tall expanded folder with z-index still wins
        // hit-testing over the space beside it. Use the pointer's card rect, not
        // event.target, so that folder cannot steal a drop meant for another space.
        _workspaceCardAtPoint(clientX, clientY) {
            const root = this.library.shadowRoot;
            if (!root) return null;
            for (const card of root.querySelectorAll(".library-workspace-card")) {
                const r = card.getBoundingClientRect();
                if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) {
                    return card;
                }
            }
            return null;
        }

        _cardOf(el) {
            return el?.closest?.(".library-workspace-card")
                || (el?.classList?.contains("library-workspace-card") ? el : null);
        }

        _foreignDropCard(e) {
            const mine = this._cardOf(e.currentTarget);
            const atPoint = this._workspaceCardAtPoint(e.clientX, e.clientY);
            if (!atPoint || !mine || atPoint === mine) return null;
            return atPoint;
        }

        _rejectGroupDropHover() {
            this._setDragOver(null);
            this._dropIntent = null;
            const root = this.library.shadowRoot;
            root?.querySelectorAll?.(".library-workspace-card[drop-target]")
                .forEach(el => el.removeAttribute("drop-target"));
            root?.querySelector?.(".library-workspace-grid")?.removeAttribute("drop-converts");
        }

        // End of the pinned section: after its last row, else the bare section.
        _hoverPinnedEnd(card, wsId) {
            const lastRow = this._lastPinnedDropRow(card?.querySelector(".library-workspace-card-list"));
            if (lastRow?._libraryDropItem && lastRow._libraryDropItem !== this._draggedTabInfo?.group) {
                this._setDragOver(lastRow, "after");
                this._setDropIntent({ kind: "row", target: lastRow._libraryDropItem, placeAfter: true }, wsId);
                return;
            }
            this._setDragOver(null);
            this._setDropIntent({ kind: "pinned-card" }, wsId);
        }

        _hoverUnpinnedEnd(card, wsId) {
            const lastRow = this._lastUnpinnedDropRow(card?.querySelector(".library-workspace-card-list"));
            if (lastRow?._libraryDropItem && lastRow._libraryDropItem !== this._draggedTabInfo?.group) {
                this._setDragOver(lastRow, "after");
                this._setDropIntent({ kind: "row", target: lastRow._libraryDropItem, placeAfter: true }, wsId);
                return;
            }
            this._setDragOver(null);
            this._setDropIntent({ kind: "card" }, wsId);
        }

        // Pointer over a card but not over a row: a tab goes to the end of the unpinned
        // section; a group goes to the end of whichever section the pointer is in.
        _hoverCardList(card, wsId, e = null) {
            if (this._isGroupDrag() && e && !this._isUnpinnedPointOnCard(card, e.clientY, e.clientX)) {
                this._hoverPinnedEnd(card, wsId);
                return;
            }
            this._hoverUnpinnedEnd(card, wsId);
        }

        _maybeRedirectTabDrag(e) {
            const foreign = this._foreignDropCard(e);
            if (!foreign) return false;
            e.stopPropagation();
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            this._hoverCardList(foreign, foreign.getAttribute("workspace-id"), e);
            return true;
        }

        _maybeRedirectTabDrop(e) {
            const foreign = this._foreignDropCard(e);
            if (!foreign) return false;
            e.stopPropagation();
            e.preventDefault();
            const wsId = foreign.getAttribute("workspace-id");
            if (this._dropIntent?.wsId !== wsId) this._hoverCardList(foreign, wsId, e);
            this._commitTabDrop(wsId);
            return true;
        }

        onTabDragOver(e, targetTab, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrag(e)) return;
            if (this._isGroupDrag()) {
                if (this._folderDropBlocked(targetTab)) return;
            } else if (this._draggedTabInfo.tab === targetTab) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const placeAfter = e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.clientHeight / 2;
            if (placeAfter) {
                this._placeAfterOnRow(e.currentTarget, targetTab, wsId);
                return;
            }
            this._setDragOver(e.currentTarget, "before");
            this._setDropIntent({ kind: "row", target: targetTab, placeAfter: false }, wsId);
        }

        onTabDrop(e, targetTab, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrop(e)) return;
            if (this._isGroupDrag()) {
                if (this._folderDropBlocked(targetTab)) return;
            } else if (this._draggedTabInfo.tab === targetTab) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            this._commitTabDrop(wsId);
        }

        // `folder` here is any group wrapper's native element: zen-folder or plain tab-group.
        onFolderDragOver(e, folderEl, headerEl, folder, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrag(e)) return;
            if (this._isGroupDrag() && this._folderDropBlocked(folder)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const rect = headerEl.getBoundingClientRect();
            const overlapPercent = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
            const threshold = this._folderDragoverThreshold();
            const canInto = this._canDropIntoGroup(folder);
            const edgeBefore = overlapPercent < threshold;

            if (!canInto) {
                if (overlapPercent > 0.5) this._placeAfterOnRow(headerEl, folder, wsId);
                else {
                    this._setDragOver(headerEl, "before");
                    this._setDropIntent({ kind: "row", target: folder, placeAfter: false }, wsId);
                }
                return;
            }

            if (edgeBefore) {
                this._setDragOver(headerEl, "before");
                this._setDropIntent({ kind: "row", target: folder, placeAfter: false }, wsId);
                return;
            }

            const nextRow = this._nextDropRow(headerEl);
            const lastInSection = !nextRow;
            // Same edge as "before", on the bottom: after this folder, remapped to
            // before the next row so the line does not stack.
            if (!lastInSection && overlapPercent > (1 - threshold)) {
                this._placeAfterOnRow(headerEl, folder, wsId);
                return;
            }

            // Last pinned tab already keeps an "after" because the separator is a
            // wall. Last pinned folder was all "into", so that gap had no line.
            const afterIsAtHeader = folderEl.classList.contains("collapsed") ||
                this._groupChildren(folder).length < 1;
            if (lastInSection && afterIsAtHeader && overlapPercent > 0.5) {
                this._setDragOver(headerEl, "after");
                this._setDropIntent({ kind: "row", target: folder, placeAfter: true }, wsId);
                return;
            }

            this._setDragOver(folderEl, "into");
            this._setDropIntent({ kind: "into", folder }, wsId);
        }

        onFolderDrop(e, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrop(e)) return;
            e.preventDefault();
            e.stopPropagation();
            this._commitTabDrop(wsId);
        }

        onFolderShellDragOver(e, folderEl, headerEl, folder, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrag(e)) return;
            if (this._isGroupDrag() && this._folderDropBlocked(folder) && folder !== this._draggedTabInfo.group) return;
            if (e.target.closest(".library-workspace-item") && e.target !== folderEl) return;

            // The ::after slop and wrapper below the last child are the gap between
            // this folder and the next, not drop-into.
            const contentEl = this._folderBody(folderEl);
            const bodyBottom = (!folderEl.classList.contains("collapsed") && contentEl)
                ? contentEl.getBoundingClientRect().bottom
                : headerEl.getBoundingClientRect().bottom;
            if (e.target === folderEl && e.clientY >= bodyBottom) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                this._placeAfterOnRow(headerEl, folder, wsId);
                return;
            }

            this.onFolderDragOver(e, folderEl, headerEl, folder, wsId);
        }

        onFolderContentDragOver(e, folderEl, headerEl, contentEl, folder, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrag(e)) return;
            if (e.target.closest(".library-workspace-item")) return;
            const nested = this._wrapperOf(e.target);
            if (nested && nested !== folderEl) return;
            if (!this._canDropIntoGroup(folder)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";

            let lastNode = null;
            for (let node = contentEl.lastElementChild; node; node = node.previousElementSibling) {
                if (!node.classList.contains("empty-state") &&
                    !node.classList.contains("library-folder-group-start")) {
                    lastNode = node;
                    break;
                }
            }
            if (lastNode && e.clientY > lastNode.getBoundingClientRect().bottom) {
                if (!this._nextDropRow(headerEl)) {
                    this._setDragOver(headerEl, "after");
                    this._setDropIntent({ kind: "row", target: folder, placeAfter: true }, wsId);
                    return;
                }
                const lastRow = this._dropRowFromNode(lastNode);
                if (lastRow?._libraryDropItem) {
                    this._setDragOver(lastRow, "after");
                    this._setDropIntent({ kind: "row", target: lastRow._libraryDropItem, placeAfter: true }, wsId);
                    return;
                }
            }

            this._setDragOver(folderEl, "into");
            this._setDropIntent({ kind: "into", folder }, wsId);
        }

        onFolderContentDrop(e, folderEl, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrop(e)) return;
            if (e.target.closest(".library-workspace-item")) return;
            const nested = this._wrapperOf(e.target);
            if (nested && nested !== folderEl) return;
            e.preventDefault();
            e.stopPropagation();
            this._commitTabDrop(wsId);
        }

        _commitTabDrop(wsId) {
            if (this._isGroupDrag()) {
                this._commitGroupDrop(wsId);
                return;
            }
            const intent = this._dropIntent;
            const destWsId = intent?.wsId || wsId;
            if (intent?.kind === "into" && intent.folder && destWsId === wsId) {
                this._applyTabDrop(wsId, this._itemIsPinned(intent.folder, wsId), { targetFolder: intent.folder });
                return;
            }
            if (intent?.kind === "row" && intent.target && destWsId === wsId) {
                this._applyTabDrop(wsId, this._itemIsPinned(intent.target, wsId), {
                    targetTab: intent.target,
                    placeAfter: !!intent.placeAfter
                });
                return;
            }
            const card = this.library.shadowRoot?.querySelector?.(
                `.library-workspace-card[workspace-id="${CSS.escape(wsId)}"]`
            );
            const lastRow = this._lastUnpinnedDropRow(card?.querySelector(".library-workspace-card-list"));
            if (lastRow?._libraryDropItem) {
                this._applyTabDrop(wsId, false, { targetTab: lastRow._libraryDropItem, placeAfter: true });
                return;
            }
            this._applyTabDrop(wsId, false);
        }

        // Every hover path sets an intent (or rejects the hover); without one there is nothing to commit.
        _commitGroupDrop(wsId) {
            const intent = this._dropIntent;
            if (!intent || (intent.wsId || wsId) !== wsId) {
                this.clearTabDragState();
                return;
            }
            if (intent.kind === "into" && intent.folder) {
                this._applyGroupDrop(wsId, { targetFolder: intent.folder });
                return;
            }
            if (intent.kind === "row" && intent.target) {
                this._applyGroupDrop(wsId, { targetTab: intent.target, placeAfter: !!intent.placeAfter });
                return;
            }
            this._applyGroupDrop(wsId, { pinned: intent.kind === "pinned-card" });
        }

        // The separator is the pinned/unpinned boundary, so it is the one place where the
        // section you land in comes from which half you drop on rather than from a row.
        // For a group that is also where it converts: top half makes a folder, bottom a group.
        onSeparatorDragOver(e, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (this._isGroupDrag()) {
                const card = this._cardOf(e.currentTarget);
                if (this._isTopHalf(e)) {
                    this._hoverPinnedEnd(card, wsId);
                    return;
                }
                const firstRow = this._firstUnpinnedDropRow(card?.querySelector(".library-workspace-card-list"));
                if (firstRow?._libraryDropItem && firstRow._libraryDropItem !== this._draggedTabInfo.group) {
                    this._setDragOver(firstRow, "before");
                    this._setDropIntent({ kind: "row", target: firstRow._libraryDropItem, placeAfter: false }, wsId);
                    return;
                }
                this._setDragOver(null);
                this._setDropIntent({ kind: "card" }, wsId);
                return;
            }
            this._setDragOver(e.currentTarget, this._isTopHalf(e) ? "before" : "after");
            this._markDropCard(wsId);
        }

        onSeparatorDrop(e, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrop(e)) return;
            e.preventDefault();
            if (this._isGroupDrag()) {
                this._commitGroupDrop(wsId);
                return;
            }
            this._applyTabDrop(wsId, this._isTopHalf(e));
        }

        _isTopHalf(e) {
            const rect = e.currentTarget.getBoundingClientRect();
            return e.clientY <= rect.top + rect.height / 2;
        }

        // Drop onto the card body rather than a row: append to that space's unpinned
        // section. This is the only way to reach a workspace with no rows to aim at.
        onCardDragOver(e, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrag(e)) return;
            const rowSelector = `.library-workspace-item, .library-workspace-separator-container, ${ZenLibrarySpaces.WRAPPER_SELECTOR}`;
            if (this._isGroupDrag()) {
                if (e.target.closest?.(rowSelector)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const card = this._cardOf(e.currentTarget);
                if (this._isUnpinnedDragPoint(e)) {
                    this._hoverUnpinnedEnd(card, wsId);
                    return;
                }
                const beforeRow = this._pinnedRowBelowY(e.currentTarget, e.clientY);
                if (beforeRow?._libraryDropItem) {
                    this._setDragOver(beforeRow, "before");
                    this._setDropIntent({
                        kind: "row",
                        target: beforeRow._libraryDropItem,
                        placeAfter: false
                    }, wsId);
                    return;
                }
                this._hoverPinnedEnd(card, wsId);
                return;
            }
            if (e.target.closest?.(".library-workspace-item, .library-workspace-separator-container")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (this._wrapperOf(e.target)) return;
            const lastRow = this._lastUnpinnedDropRow(e.currentTarget);
            if (lastRow?._libraryDropItem) {
                this._setDragOver(lastRow, "after");
                this._setDropIntent({ kind: "row", target: lastRow._libraryDropItem, placeAfter: true }, wsId);
                return;
            }
            this._setDragOver(null);
            this._setDropIntent({ kind: "card" }, wsId);
        }

        onCardDrop(e, wsId) {
            if (!this._draggedTabInfo) return;
            if (this._maybeRedirectTabDrop(e)) return;
            if (e.target.closest?.(`.library-workspace-item, .library-workspace-separator-container, ${ZenLibrarySpaces.WRAPPER_SELECTOR}`)) return;
            e.preventDefault();
            this._commitTabDrop(wsId);
        }

        // One path for every tab drop. Order: leave the source group, then pin/unpin,
        // then move space, then join the dest group / sibling position.
        // pinTab/unpinTab relocate into the *active* workspace's containers, so the
        // workspace move has to come after them. Group membership has to come off
        // before both: unpinTab does not stick on a folder child, and
        // moveTabToWorkspace stamps zen-workspace-id before insertBefore, which the
        // folder would snap back. "Folder" below is any group: zen-folder or plain tab-group.
        _applyTabDrop(wsId, wantPinned, { targetTab = null, placeAfter = false, targetFolder = null } = {}) {
            const draggedTab = this._draggedTabInfo?.tab;
            if (!draggedTab) {
                this.clearTabDragState();
                return;
            }
            const sourceWsId = this._draggedTabInfo.wsId;
            const changedPinned = draggedTab.pinned !== wantPinned;
            const wantFolder = targetFolder || this._containingGroup(targetTab);
            const currentFolder = this._containingGroup(draggedTab);
            const folderChange = currentFolder !== wantFolder;
            const changedWorkspace = sourceWsId !== wsId;
            const noop = !changedPinned && !changedWorkspace && !targetTab && !targetFolder && !folderChange;

            if (noop) {
                this.clearTabDragState();
                return;
            }

            // Tabs in Zen folders are pinned. unpinTab will not stick while the tab
            // is still a folder child (the folder snaps it back), so a drop onto
            // another space's unpinned section would abort in _setTabPinned.
            if (currentFolder && currentFolder !== wantFolder) {
                this._applyFolderMembership(draggedTab, null);
            }

            if (changedPinned && !this._setTabPinned(draggedTab, wantPinned)) {
                if (currentFolder?.isConnected) this._addTabToFolder(draggedTab, currentFolder);
                return;
            }

            if (!this._moveTabToWorkspace(draggedTab, wsId)) {
                if (currentFolder?.isConnected) this._addTabToFolder(draggedTab, currentFolder);
                this.clearTabDragState();
                return;
            }

            this._applyFolderMembership(draggedTab, wantFolder);
            if (targetFolder) this._expandFolderAfterDrop(targetFolder);

            if (!targetFolder && targetTab && targetTab.isConnected && this._itemIsPinned(targetTab, wsId) === draggedTab.pinned) {
                // moveTabBefore/After route through tabbrowser's #handleTabMove, which is what
                // recomputes every _tPos, invalidates the cached tab list, fires TabMove for
                // session store, and handles group/split-view wrappers. A raw insertBefore on
                // the live tab strip does none of that and silently desyncs all of it.
                if (placeAfter) window.gBrowser.moveTabAfter(draggedTab, targetTab);
                else window.gBrowser.moveTabBefore(draggedTab, targetTab);
            }

            this._finishTabDrop(draggedTab, sourceWsId, wsId);
        }

        _insertFolderInPinned(folder, wsId) {
            const pinned = this._pinnedContainer(wsId);
            if (!pinned) return;
            const sep = pinned.querySelector(".pinned-tabs-container-separator");
            pinned.insertBefore(folder, sep || null);
        }

        // Unpinned section of a space, with the new-tab periphery kept at its end when it sits there.
        _appendToUnpinned(group, wsId) {
            const container = window.gZenWorkspaces?.workspaceElement?.(wsId)?.tabsContainer;
            if (!container) return;
            const periphery = container.querySelector("#tabbrowser-arrowscrollbox-periphery");
            container.insertBefore(group, periphery === container.lastElementChild ? periphery : null);
        }

        // Puts a group at a drop position. Used for plain groups and for freshly converted ones
        // ({parent} = last child of that group, {ref, after} = sibling of ref, neither = end of the section).
        _placeGroup(group, wsId, pinned, { parent = null, ref = null, after = false } = {}) {
            if (parent) {
                parent.appendChild(group);
            } else if (ref?.isConnected && ref !== group) {
                if (after) ref.after(group);
                else ref.before(group);
            } else if (pinned) {
                this._insertFolderInPinned(group, wsId);
            } else {
                this._appendToUnpinned(group, wsId);
            }
        }

        // Dragged group (zen-folder or plain tab-group) lands as a sibling of targetTab, as the
        // last child of targetFolder, or at the end of a section. Folders are pinned and groups
        // are not, so landing on the other side of the separator converts it in place.
        _applyGroupDrop(wsId, { targetTab = null, placeAfter = false, targetFolder = null, pinned = null } = {}) {
            const group = this._draggedTabInfo?.group;
            const sourceWsId = this._draggedTabInfo?.wsId;
            if (!this._isDropGroup(group)) {
                this.clearTabDragState();
                return;
            }

            const wantParent = targetFolder || this._containingGroup(targetTab);
            if (this._folderDropBlocked(wantParent) || targetTab === group) {
                this.clearTabDragState();
                return;
            }

            const destPinned = targetFolder ? this._itemIsPinned(targetFolder, wsId)
                : targetTab ? this._itemIsPinned(targetTab, wsId)
                : !!pinned;
            const isFolder = this._isZenFolder(group);
            const changedWorkspace = sourceWsId !== wsId;
            const placement = targetFolder ? { parent: targetFolder } : targetTab ? { ref: targetTab, after: placeAfter } : {};

            if (isFolder !== destPinned) {
                if (group.isLiveFolder) {
                    this.clearTabDragState();
                    return;
                }
                const replacement = destPinned
                    ? this._convertGroupToFolder(group, wsId, placement)
                    : this._convertFolderToGroup(group, wsId, placement);
                if (targetFolder && replacement) this._expandFolderAfterDrop(targetFolder);
                this._finishTabDrop(replacement || group, sourceWsId, wsId, { settle: 450 });
                return;
            }

            const currentParent = this._containingGroup(group);
            const noop = !changedWorkspace && !targetTab && !targetFolder && currentParent === wantParent;
            if (noop) {
                this.clearTabDragState();
                return;
            }

            try {
                if (isFolder) {
                    if (changedWorkspace) {
                        window.gZenFolders?.changeFolderToSpace?.(group, wsId, { hasDndSwitch: true });
                        this._insertFolderInPinned(group, wsId);
                    } else if (currentParent && currentParent !== wantParent) {
                        this._insertFolderInPinned(group, wsId);
                    }
                    if (wantParent) this._addTabToFolder(group, wantParent);
                } else {
                    if (changedWorkspace) this._stampGroupWorkspace(group, wsId);
                    // #handleTabMove recomputes _tPos, invalidates the tab cache and fires TabMove
                    // for every tab in the group; a raw insertBefore would desync all of it.
                    if (wantParent) {
                        window.gBrowser.handleTabMove(group, () => wantParent.appendChild(group));
                    } else if (!targetTab) {
                        window.gBrowser.handleTabMove(group, () => this._appendToUnpinned(group, wsId));
                    }
                }

                if (targetFolder) this._expandFolderAfterDrop(wantParent);

                if (!targetFolder && targetTab && targetTab.isConnected && targetTab !== group) {
                    if (placeAfter) window.gBrowser.moveTabAfter(group, targetTab);
                    else window.gBrowser.moveTabBefore(group, targetTab);
                }
            } catch (e) {
                console.error("[ZenLibrary Spaces] group drop threw:", e);
            }

            if (!isFolder) this._afterTabGroupMoved();
            this._finishTabDrop(group, sourceWsId, wsId);
        }

        // A plain group carries its space on itself and every descendant; Zen only stamps tabs.
        _stampGroupWorkspace(group, wsId) {
            const { lastSelectedWorkspaceTabs } = window.gZenWorkspaces || {};
            group.setAttribute("zen-workspace-id", wsId);
            group.querySelectorAll?.("tab-group").forEach(nested => nested.setAttribute("zen-workspace-id", wsId));
            for (const tab of group.tabs || []) {
                const previous = tab.getAttribute("zen-workspace-id");
                tab.setAttribute("zen-workspace-id", wsId);
                try { window.gBrowser.TabStateFlusher?.flush(tab.linkedBrowser); } catch (e) { }
                if (lastSelectedWorkspaceTabs && lastSelectedWorkspaceTabs[previous] === tab) {
                    delete lastSelectedWorkspaceTabs[previous];
                }
            }
        }

        // ATG hides groups outside the active space with its own `hidden` attribute and only
        // recomputes that on its own moves; a group moved here would otherwise stay hidden.
        _afterTabGroupMoved() {
            const atg = globalThis.advancedTabGroups;
            if (!atg) return;
            try {
                atg.updateGroupVisibility?.();
                atg.scheduleSavedParentsSync?.();
            } catch (e) { }
        }

        // Pinned section = folders. The group's direct children go in, in order: tabs join the
        // folder (zen-folder.addTabs pins them), nested groups become subfolders while Zen's
        // depth limit allows and are flattened into the folder past it. The emptied group
        // removes itself (tabgroup.js #observeTabChanges), like ATG's own convert.
        _convertGroupToFolder(group, wsId, { parent = null, ref = null, after = false } = {}) {
            if (!window.gZenFolders?.createFolder || !this._isDropGroup(group) || this._isZenFolder(group)) return null;
            const children = this._groupChildren(group);
            const opts = { label: group.label || "Folder", renameFolder: false, workspaceId: wsId };
            if (parent) opts.insertAfter = parent.groupContainer?.lastElementChild || undefined;
            else if (ref?.isConnected) opts[after ? "insertAfter" : "insertBefore"] = ref;

            let folder = null;
            try {
                folder = window.gZenFolders.createFolder([], opts);
            } catch (e) {
                console.error("[ZenLibrary Spaces] createFolder threw:", e);
                return null;
            }
            if (!folder) return null;

            const canNest = this._folderDepthAllows(folder);
            for (const child of children) {
                try {
                    if (window.gBrowser.isTab(child)) {
                        folder.addTabs([child]);
                    } else if (child.hasAttribute("split-view-group")) {
                        // createFolder pins each split tab first so handleTabPin carries the wrapper over.
                        for (const tab of child.tabs) window.gBrowser.pinTab(tab);
                        folder.addTabs([child]);
                    } else if (canNest) {
                        this._convertGroupToFolder(child, wsId, { parent: folder });
                    } else {
                        folder.addTabs(child.tabs.filter(t => !t.hasAttribute("zen-empty-tab")));
                    }
                } catch (e) {
                    console.error("[ZenLibrary Spaces] moving into the new folder threw:", e);
                }
            }
            // createFolder's empty tab is added through the active space; stamp everything for the target one.
            for (const tab of folder.tabs || []) tab.setAttribute("zen-workspace-id", wsId);
            this._forgetAtgGroupState(group);
            this._removeWhenEmpty(group);
            return folder;
        }

        // Unpinned section = plain groups. A tab-group element with the folder's label is placed
        // first, then the folder's children move in, in order: tabs (addTabs unpins them),
        // split views, subfolders as nested groups; the folder's zen-empty-tab is closed and the
        // emptied folder removes itself. ATG's body observer decorates the new group.
        _convertFolderToGroup(folder, wsId, { parent = null, ref = null, after = false } = {}) {
            if (!this._isZenFolder(folder) || folder.isLiveFolder) return null;
            const items = this._groupChildren(folder);
            const emptyTabs = (folder.allItems || []).filter(t => t.hasAttribute?.("zen-empty-tab"));

            const group = document.createXULElement("tab-group", { is: "tab-group" });
            group.id = `${Date.now()}-${Math.round(Math.random() * 100)}`;
            // Label before connecting: ATG starts a rename on any group that mounts unnamed.
            group.label = folder.label || "Tab Group";
            group.setAttribute("zen-workspace-id", wsId);
            if (this._isGroupCollapsed(folder)) group.setAttribute("collapsed", "true");
            this._placeGroup(group, wsId, false, { parent, ref, after });

            for (const item of items) {
                try {
                    if (window.gBrowser.isTab(item)) {
                        this._clearFolderRowStyles(item);
                        group.addTabs([item]);
                    } else if (item.hasAttribute("split-view-group")) {
                        for (const tab of item.tabs) {
                            this._clearFolderRowStyles(tab);
                            window.gBrowser.unpinTab(tab);
                        }
                        this._clearFolderRowStyles(item);
                        window.gBrowser.handleTabMove(item, () => group.appendChild(item));
                    } else if (this._isZenFolder(item)) {
                        this._convertFolderToGroup(item, wsId, { parent: group });
                    } else {
                        window.gBrowser.handleTabMove(item, () => group.appendChild(item));
                    }
                } catch (e) {
                    console.error("[ZenLibrary Spaces] moving into the new group threw:", e);
                }
            }
            for (const tab of emptyTabs) {
                try { window.gBrowser.removeTab(tab); } catch (e) { }
            }
            // unpinTab routes each tab through the active space; the group may have landed in another.
            this._stampGroupWorkspace(group, wsId);
            this._removeWhenEmpty(folder);
            this._afterTabGroupMoved();
            return group;
        }

        // A collapsed folder's rows carry Zen's collapse animation inline (height: 0, opacity: 0,
        // the indent, folder-active); only gZenFolders ever clears those, and it stops caring
        // about a tab the moment it leaves the folder.
        _clearFolderRowStyles(item) {
            if (!item?.style) return;
            for (const prop of ["height", "opacity", "--zen-folder-indent", "margin-top"]) item.style.removeProperty(prop);
            item.removeAttribute("folder-active");
        }

        // An emptied group removes itself once its close animation ends; in a space that is
        // not on screen that animation can never finish, and the husk would linger.
        _removeWhenEmpty(group) {
            setTimeout(() => {
                if (!group?.isConnected) return;
                if ((group.tabs || []).some(t => !t.hasAttribute("zen-empty-tab"))) return;
                for (const tab of group.tabs || []) {
                    try { window.gBrowser.removeTab(tab); } catch (e) { }
                }
                try { group.remove(); } catch (e) { }
            }, 700);
        }

        _expandFolderAfterDrop(folder) {
            if (!this._isDropGroup(folder)) return;
            // Live folders and has-active peeks stay collapsed, same as Zen's addTabs / drop.
            if (folder.isLiveFolder || folder.hasAttribute("has-active")) return;
            try {
                if (folder.collapsed) {
                    folder.collapsed = false;
                    if (this._isZenFolder(folder)) window.gZenFolders?.animateGroupMove?.(folder, true);
                }
            } catch (e) {
                console.error("[ZenLibrary Spaces] expand folder after drop threw:", e);
            }
            const folderId = folder.id;
            if (folderId) this._folderExpansion.set(folderId, true);
        }

        // Appends a tab or group as the last child of a folder / group. addTabs routes tabs
        // through moveTabToExistingGroup (which also pins/unpins to match the group); it throws
        // for a group argument, so groups go through handleTabMove + appendChild instead.
        _addTabToFolder(tab, folder) {
            if (!folder || !tab) return;
            try {
                if (this._isDropGroup(tab)) {
                    window.gBrowser.handleTabMove(tab, () => folder.appendChild(tab));
                    return;
                }
                if (typeof folder.addTabs === "function") {
                    folder.addTabs([tab]);
                    return;
                }
            } catch (e) {
                console.error("[ZenLibrary Spaces] adding to the group threw:", e);
            }
            const last = this._groupChildren(folder).at(-1);
            if (last && last !== tab && last.isConnected) {
                window.gBrowser.moveTabAfter(tab, last);
            }
        }

        _setTabPinned(tab, wantPinned) {
            try {
                if (wantPinned) window.gBrowser.pinTab(tab);
                else window.gBrowser.unpinTab(tab);
            } catch (e) {
                console.error("[ZenLibrary Spaces] pin/unpin threw:", e);
            }

            if (tab.pinned !== wantPinned) {
                console.warn("[ZenLibrary Spaces] Tab pinned state did not change");
                this.clearTabDragState();
                return false;
            }
            return true;
        }

        _workspaceContainerFor(tab, wsId) {
            const wsEl = window.gZenWorkspaces?.workspaceElement?.(wsId);
            return tab.pinned ? wsEl?.pinnedTabsContainer : wsEl?.tabsContainer;
        }

        // moveTabsToWorkspace reports success even when it skipped the tab, so confirm from
        // where the tab actually ended up. It also early-returns without stamping the id when
        // the tab already sits in the destination container — which is exactly what happens
        // when pin/unpin has just relocated it into the active workspace and that *is* the
        // destination. Stamp it the same way moveTabsToWorkspace would have.
        //
        // If the insert does not stick, revert zen-workspace-id. moveTabsToWorkspace
        // writes that attribute before insertBefore; a failed or snapped-back move
        // would otherwise leave the tab claiming a space it does not live in.
        _moveTabToWorkspace(tab, wsId) {
            const previousId = tab.getAttribute("zen-workspace-id");
            try {
                window.gZenWorkspaces?.moveTabToWorkspace?.(tab, wsId);
            } catch (e) {
                console.error("[ZenLibrary Spaces] moveTabToWorkspace threw:", e);
            }

            if (!this._workspaceContainerFor(tab, wsId)?.contains(tab)) {
                if (previousId) tab.setAttribute("zen-workspace-id", previousId);
                else tab.removeAttribute("zen-workspace-id");
                console.warn("[ZenLibrary Spaces] Tab was not moved to workspace", wsId);
                return false;
            }

            if (tab.getAttribute("zen-workspace-id") !== wsId) {
                tab.setAttribute("zen-workspace-id", wsId);
            }
            return true;
        }

        // `settle` repaints the same cards again later: a conversion leaves the emptied
        // group / folder in the strip until its close animation ends and removes it.
        _finishTabDrop(draggedTab, sourceWsId, targetWsId, { settle = 0 } = {}) {
            const changedWorkspace = sourceWsId !== targetWsId;

            // Dragging the tab you are currently looking at out of the space you are
            // currently in would leave gBrowser.selectedTab pointing at a tab the active
            // space no longer contains. Zen's own changeTabWorkspace resolves that by
            // following the tab, so do the same — but only in that one case, so ordinary
            // organising never yanks the user between spaces.
            const selectedTab = window.gBrowser.selectedTab;
            const selectedInGroup = this._isDropGroup(draggedTab) && (draggedTab.tabs || []).includes(selectedTab);
            const shouldFollow = changedWorkspace &&
                (draggedTab.selected || selectedInGroup) &&
                window.gZenWorkspaces?.activeWorkspace === sourceWsId;

            if (changedWorkspace && window.gZenWorkspaces.lastSelectedWorkspaceTabs) {
                // Always a tab: changeWorkspace selects this entry, and a group element is not selectable.
                const landmark = selectedInGroup ? selectedTab : window.gBrowser.isTab(draggedTab) ? draggedTab : (draggedTab.tabs || [])[0];
                if (landmark) window.gZenWorkspaces.lastSelectedWorkspaceTabs[targetWsId] = landmark;
            }

            // The active space is repainted too: pin/unpin routes the tab through its
            // containers on the way past, so its card can be stale even when uninvolved.
            const cards = new Set([targetWsId, sourceWsId, window.gZenWorkspaces?.activeWorkspace]);
            const repaint = () => cards.forEach(id => { if (id) this.renderIntoExistingCard(id); });
            repaint();
            if (settle > 0) setTimeout(repaint, settle);
            this.clearTabDragState();

            if (shouldFollow) window.gZenWorkspaces.changeWorkspaceWithID(targetWsId);
        }

        _markDropCard(wsId) {
            const root = this.library.shadowRoot;
            if (!root) return;
            const card = root.querySelector(`.library-workspace-card[workspace-id="${CSS.escape(wsId)}"]`);
            if (card?.hasAttribute("drop-target")) return;
            root.querySelectorAll(".library-workspace-card[drop-target]")
                .forEach(el => el.removeAttribute("drop-target"));
            card?.setAttribute("drop-target", "true");
        }

        clearTabDragState() {
            const root = this.library.shadowRoot;
            // Scoped to items: .library-workspace-card also uses [dragged] for its own
            // reorder drag, which this must never clear out from under.
            root?.querySelectorAll?.(".library-workspace-item[dragged], [drag-over], .library-workspace-card[drop-target]")
                .forEach(item => {
                    this._setCollapsedFolderDragIcon(item, false);
                    item.removeAttribute("dragged");
                    item.removeAttribute("drag-over");
                    item.removeAttribute("drop-target");
                });
            const grid = root?.querySelector?.(".library-workspace-grid");
            grid?.removeAttribute("dragging-tab");
            grid?.removeAttribute("dragging-group");
            grid?.removeAttribute("drop-converts");
            this._hideDropIndicator();
            this._draggedTabInfo = null;
            this._dropIntent = null;
            if (this._suppressFolderToggle) {
                setTimeout(() => { this._suppressFolderToggle = false; }, 0);
            }
        }

        // Shared by the full card render and the in-place repaint so the two cannot drift.
        collectWorkspaceItems(wsEl) {
            const items = [];
            const collect = (container) => {
                if (!container) return;
                Array.from(container.children).forEach(child => {
                    if (child.hasAttribute("cloned") || child.hasAttribute("zen-empty-tab")) return;
                    if (window.gBrowser.isTab(child) || window.gBrowser.isTabGroup(child)) items.push(child);
                });
            };

            collect(wsEl.pinnedTabsContainer);
            const pinnedCount = items.length;
            collect(wsEl.tabsContainer);
            return { items, pinnedCount };
        }

        fillWorkspaceList(list, wsId, wsEl) {
            const { items, pinnedCount } = this.collectWorkspaceItems(wsEl);

            // The separator doubles as the pin/unpin drop zone, so it is still in the
            // DOM when there is nothing unpinned. CSS hides that case until a tab or
            // folder drag is in progress; Clear only belongs on the row when there are
            // unpinned tabs.
            const separator = this.createWorkspaceSeparator(wsId);
            if (items.length === pinnedCount) separator.setAttribute("no-unpinned", "true");
            if (pinnedCount === 0) separator.setAttribute("no-pinned", "true");

            const unpinned = this.el("div", { className: "library-workspace-unpinned-section" });

            items.forEach((item, index) => {
                if (index < pinnedCount) this.renderItemRecursive(item, list, wsId);
            });
            list.appendChild(separator);

            if (items.length === 0) {
                unpinned.appendChild(this.el("div", {
                    className: "empty-state",
                    style: "padding: 20px; text-align:center; opacity:0.5; font-size: 12px;",
                    textContent: "Empty Workspace"
                }));
            } else {
                items.forEach((item, index) => {
                    if (index >= pinnedCount) this.renderItemRecursive(item, unpinned, wsId);
                });
            }
            list.appendChild(unpinned);
        }

        renderIntoExistingCard(wsId) {
            const card = this.library.shadowRoot?.querySelector?.(`.library-workspace-card[workspace-id="${CSS.escape(wsId)}"]`);
            const list = card?.querySelector?.(".library-workspace-card-list");
            const wsEl = window.gZenWorkspaces?.workspaceElement?.(wsId);
            if (!list || !wsEl) return;

            const oldScroll = list.scrollTop;
            list.replaceChildren();
            this.fillWorkspaceList(list, wsId, wsEl);
            list.scrollTop = oldScroll;
            this._lastRenderAt = Date.now();
        }

        // Rows of every card, in place. What ATG's tab-strip hooks get instead of a grid rebuild
        // (which would drop every card's scroll position); a repaint this module just did is skipped.
        refreshAllCards({ skipIfFresherThan = 0 } = {}) {
            if (skipIfFresherThan && Date.now() - this._lastRenderAt < skipIfFresherThan) return;
            if (this._draggedTabInfo) return;
            for (const ws of ZenLibrarySpaces.getWorkspaces()) this.renderIntoExistingCard(ws.uuid);
        }

        createWorkspaceSeparator(wsId) {
            const cleanupBtn = this.el("div", {
                className: "library-workspace-cleanup-button",
                title: "Clear unpinned tabs"
            });

            cleanupBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.closeWorkspaceUnpinnedTabs(wsId);
            });

            const container = this.el("div", { className: "library-workspace-separator-container" }, [
                this.el("div", { className: "library-workspace-separator" }),
                cleanupBtn
            ]);
            container.addEventListener("dragover", (e) => this.onSeparatorDragOver(e, wsId));
            container.addEventListener("drop", (e) => this.onSeparatorDrop(e, wsId));
            container.addEventListener("dragleave", (e) => this._onRowDragLeave(e));
            return container;
        }

        _ensureWorkspaceMenu() {
            if (document.getElementById("zen-library-workspace-menu")) return;

            const popup = document.createXULElement("menupopup");
            popup.id = "zen-library-workspace-menu";

            const renameItem = document.createXULElement("menuitem");
            renameItem.id = "zen-library-workspace-menu-rename";
            renameItem.setAttribute("label", "Rename Space");

            const iconItem = document.createXULElement("menuitem");
            iconItem.id = "zen-library-workspace-menu-icon";
            iconItem.setAttribute("label", "Change Icon");

            const themeItem = document.createXULElement("menuitem");
            themeItem.id = "zen-library-workspace-menu-theme";
            themeItem.setAttribute("label", "Edit Theme");

            const unloadItem = document.createXULElement("menuitem");
            unloadItem.id = "zen-library-workspace-menu-unload";
            unloadItem.setAttribute("label", "Unload Space");

            popup.appendChild(renameItem);
            popup.appendChild(iconItem);
            popup.appendChild(themeItem);
            popup.appendChild(document.createXULElement("menuseparator"));
            popup.appendChild(unloadItem);
            (document.getElementById("mainPopupSet") || document.body).appendChild(popup);
        }

        showWorkspaceMenu(e, ws) {
            const button = e.currentTarget;
            this._ensureWorkspaceMenu();

            const popup = document.getElementById("zen-library-workspace-menu");
            const renameItem = document.getElementById("zen-library-workspace-menu-rename");
            const iconItem = document.getElementById("zen-library-workspace-menu-icon");
            const themeItem = document.getElementById("zen-library-workspace-menu-theme");
            const unloadItem = document.getElementById("zen-library-workspace-menu-unload");

            const newRename = renameItem.cloneNode(true);
            const newIcon = iconItem.cloneNode(true);
            const newTheme = themeItem.cloneNode(true);
            const newUnload = unloadItem.cloneNode(true);

            renameItem.replaceWith(newRename);
            iconItem.replaceWith(newIcon);
            themeItem.replaceWith(newTheme);
            unloadItem.replaceWith(newUnload);

            newRename.addEventListener("command", () => this.renameWorkspace(ws));
            newIcon.addEventListener("command", () => this.changeWorkspaceIcon(ws, this.getWorkspaceIconAnchor(ws) || button));
            newTheme.addEventListener("command", (event) => this.editWorkspaceTheme(ws, event));
            newUnload.addEventListener("command", () => this.unloadWorkspace(ws));

            popup.openPopup(button, "after_end", 0, 4, true, false);
        }

        startInlineRename(e, ws) {
            const nameSpan = e.currentTarget;
            if (nameSpan.querySelector('input')) return;

            const originalName = ws.name;
            let finished = false;

            const input = this.el("input", {
                className: "library-workspace-rename-input",
                value: originalName,
                onkeydown: (ev) => {
                    if (ev.key === "Enter") {
                        ev.preventDefault();
                        finish(input.value);
                    } else if (ev.key === "Escape") {
                        ev.preventDefault();
                        finish(originalName);
                    }
                }
            });

            const finish = (newName) => {
                if (finished) return;
                finished = true;
                window.removeEventListener("mousedown", onClickOutside, true);

                if (newName && newName.trim() && newName !== originalName) {
                    ws.name = newName.trim();
                    if (window.gZenWorkspaces?.saveWorkspace) {
                        window.gZenWorkspaces.saveWorkspace(ws);
                    }
                    nameSpan.textContent = ws.name;
                } else {
                    nameSpan.textContent = originalName;
                }
                nameSpan.classList.remove("renaming");
            };

            // Cancel when the press lands outside the name. composedPath, not ev.target: seen
            // from the window, every event from inside the shadow root is retargeted to the
            // <zen-library> host, so a contains() check cancelled the rename on a click inside
            // the input itself.
            const onClickOutside = (ev) => {
                if (!ev.composedPath().includes(nameSpan)) finish(originalName);
            };

            // Use capture phase to ensure we catch the click before blur
            window.addEventListener("mousedown", onClickOutside, true);

            nameSpan.innerHTML = "";
            nameSpan.appendChild(input);
            nameSpan.classList.add("renaming");
            input.focus();
            input.select();
        }

        async renameWorkspace(ws) {
            const header = this.library.shadowRoot.querySelector(`.library-workspace-card[workspace-id="${CSS.escape(ws.uuid)}"] .library-workspace-name`);
            if (header) {
                this.startInlineRename({ currentTarget: header }, ws);
            }
        }

        changeWorkspaceIcon(ws, anchor) {
            if (!window.gZenEmojiPicker) return;

            // Close on select: saving rebuilds the grid, which removes the anchor and hides the panel anyway.
            window.gZenEmojiPicker.open(anchor, {
                allowNone: !!window.gZenWorkspaces?.workspaceHasIcon?.(ws)
            })?.then?.(async (emoji) => {
                ws.icon = emoji || "";
                if (window.gZenWorkspaces?.saveWorkspace) {
                    await window.gZenWorkspaces.saveWorkspace(ws);
                    this.library.update?.();
                }
            }).catch(() => { }); // Rejects when the picker closes without a selection
        }

        async editWorkspaceTheme(ws, e) {
            // Close the library first to return focus to the main window
            if (window.gZenLibrary?.close) {
                window.gZenLibrary.close();
            }

            // Switch workspace if needed
            if (window.gZenWorkspaces.activeWorkspace !== ws.uuid) {
                await window.gZenWorkspaces.changeWorkspaceWithID(ws.uuid);
            }

            // Trigger after a safe delay
            setTimeout(() => {
                const cmd = document.getElementById("cmd_zenOpenZenThemePicker");
                if (cmd) cmd.doCommand();
            }, 300);
        }

        async unloadWorkspace(ws) {
            if (!window.gBrowser?.explicitUnloadTabs) return;

            const tabsToUnload = window.gZenWorkspaces.allStoredTabs.filter(
                (tab) =>
                    tab.getAttribute("zen-workspace-id") === ws.uuid &&
                    !tab.hasAttribute("zen-empty-tab") &&
                    !tab.hasAttribute("zen-essential") &&
                    !tab.hasAttribute("pending")
            );

            if (tabsToUnload.length === 0) return;

            await window.gBrowser.explicitUnloadTabs(tabsToUnload);
            if (this.library.update) setTimeout(() => this.library.update(), 500);
        }
    }

    // Advanced Tab Groups replaces renderItemRecursive with its own plain-group renderer unless it
    // finds this flag already set (its patchZenLibrary returns early on it). With the compat pref
    // on, renderTabGroup above owns those rows, so claim the flag before ATG's poll sees the class.
    if (ZenLibrarySpaces.atgCompatEnabled()) ZenLibrarySpaces.prototype._advancedTabGroupsPatched = true;

    window.ZenLibrarySpaces = ZenLibrarySpaces;
})();
