"use strict";

(function () {
    class ZenLibrarySpaces {
        static CARD_WIDTH = 224;
        static CARD_GAP = 16;

        static getWorkspaces() { return window.gZenWorkspaces ? window.gZenWorkspaces.getWorkspaces() : []; }

        static calculatePanelWidth(count) {
            // sidebar (90) + grid padding (40) + cards + gaps + create-button (36 + 2 margin)
            const total = 90 + 40 + (count * this.CARD_WIDTH) + (count * this.CARD_GAP) + 38;
            return Math.min(total, window.innerWidth * 0.8);
        }

        static getLastWidth() { return this._lastWidth || 340; }

        static calculateMediaColumns(width) {
            const sidebar = 90;
            const padding = 36;
            const colWidth = 210;
            const gap = 16;
            const scrollbarBuffer = 4;

            const avail = width - sidebar - padding - scrollbarBuffer;
            return Math.max(1, Math.floor((avail + gap + 2) / (colWidth + gap)));
        }

        static calculateMediaWidth(count) {
            const sidebar = 90;
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

        static getData() {
            const workspaces = this.getWorkspaces();
            const width = this.calculatePanelWidth(workspaces.length);
            this._lastWidth = width;
            return { workspaces, width };
        }

        constructor(library) {
            this.library = library;
            // Local state for folder expansion
            this._folderExpansion = new Map();
        }

        get el() { return this.library.el.bind(this.library); }
        get svg() { return this.library.svg.bind(this.library); }

        render() {
            // Capture existing scroll position
            const oldGrid = this.library.shadowRoot.querySelector(".library-workspace-grid");
            const oldScroll = oldGrid ? oldGrid.scrollLeft : 0;

            const { workspaces, width } = ZenLibrarySpaces.getData();
            // We return the grid to be appended by the main update loop,
            // OR we can manage the container ourselves if the shell delegates that.
            // Based on ZenLibrary.uc.js's shell logic, it calls render() but also handles the grid creation
            // in its `update()` method for sticky headers etc?
            // Actually, the main shell's update() seems to handle the High Level structure.
            // But if we want to modularize, we should do as much as possible here.

            // However, the main shell's `update()` (lines 2856+ in backup) does a lot of heavy lifting
            // including calculating width and diffing hash.
            // The REFRACTORED ZenLibrary.uc.js (which we verified) delegates to `.update()`?
            // No, the refactored ZenLibrary.uc.js calls `this._spaces.render()`?
            // Let's look at the refactored ZenLibrary.uc.js ... I don't have it fully in memory
            // but the plan was for `renderSpaces()` or similar.

            // Assuming the shell calls `render()` and expects an element back.
            // BUT, the Spaces UI is a horizontal grid that affects the WINDOW WIDTH.
            // The logic to resize the window (`this.style.setProperty("--zen-library-width"...)`)
            // IS in the shell's `update()`.

            // So this module should primarily return the CONTENT (the grid).

            const grid = this.el("div", { className: "library-workspace-grid" });
            const fragment = document.createDocumentFragment();

            for (const ws of workspaces) {
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
                this.el("span", { textContent: "+" })
            ]));

            grid.appendChild(fragment);

            // Optimized wheel handling matching backup
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

            return grid;
        }

        // --- Core Rendering Logic Copied from Backup ---

        createFolderIconSVG(iconURL = '', state = 'close', active = false) {
            const id1 = "nebula-native-grad-0-" + Math.floor(Math.random() * 100000);
            const id2 = "nebula-native-grad-1-" + Math.floor(Math.random() * 100000);

            let imageTag = "";
            if (iconURL) {
                imageTag = `<image href="${iconURL}" height="10" width="10" transform="translate(9 11)" />`;
            }

            const svgStr = `
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" state="${state}" active="${active}">
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
                <path class="back" d="M8 5.625H11.9473C12.4866 5.625 13.0105 5.80861 13.4316 6.14551L14.2881 6.83105C14.9308 7.34508 15.7298 7.625 16.5527 7.625H20C21.3117 7.625 22.375 8.68832 22.375 10V20C22.375 21.3117 21.3117 22.375 20 22.375H8C6.68832 22.375 5.625 21.3117 5.625 20V8C5.625 6.68832 6.68832 5.625 8 5.625Z" style="fill: var(--ws-folder-behind);" />
                <path class="back" d="M8 5.625H11.9473C12.4866 5.625 13.0105 5.80861 13.4316 6.14551L14.2881 6.83105C14.9308 7.34508 15.7298 7.625 16.5527 7.625H20C21.3117 7.625 22.375 8.68832 22.375 10V20C22.375 21.3117 21.3117 22.375 20 22.375H8C6.68832 22.375 5.625 21.3117 5.625 20V8C5.625 6.68832 6.68832 5.625 8 5.625Z" style="stroke-width: 1.5px; stroke: var(--ws-folder-stroke); fill: url(#${id1}); fill-opacity: 0.1;" />
                <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" style="fill: var(--ws-folder-front);" />
                <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" style="stroke-width: 1.5px; stroke: var(--ws-folder-stroke); fill: url(#${id2}); fill-opacity: 0.1;" />
                <g class="icon" style="fill: var(--ws-folder-stroke, currentColor);">
                     ${imageTag}
                </g>
                <g class="dots" style="fill: var(--ws-folder-stroke);">
                    <ellipse cx="10" cy="16" rx="1.25" ry="1.25"/>
                    <ellipse cx="14" cy="16" rx="1.25" ry="1.25"/>
                    <ellipse cx="18" cy="16" rx="1.25" ry="1.25"/>
                </g>
            </svg>`;
            return this.svg(svgStr);
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
                card.style.setProperty("--ws-gradient", themeData.gradient);
                card.style.setProperty("--ws-grain", themeData.grain);

                const pColor = themeData.primaryColor;
                const tColor = `rgba(${themeData.toolbarColor.join(',')})`;

                card.style.setProperty("--ws-primary-color", pColor);
                card.style.setProperty("--ws-text-color", tColor);
                card.style.colorScheme = themeData.isDarkMode ? "dark" : "light";

                // Native Zen Tab Highlights
                if (themeData.isDarkMode) {
                    card.style.setProperty("--ws-tab-selected-color", "rgba(255, 255, 255, 0.12)");
                    card.style.setProperty("--ws-tab-selected-shadow", "0 1px 1px 1px rgba(0, 0, 0, 0.1)");
                } else {
                    card.style.setProperty("--ws-tab-selected-color", "rgba(255, 255, 255, 0.8)");
                    card.style.setProperty("--ws-tab-selected-shadow", "0 1px 1px 1px rgba(0, 0, 0, 0.09)");
                }
                card.style.setProperty("--ws-tab-hover-color", `color-mix(in srgb, ${tColor}, transparent 92.5%)`);

                if (themeData.isDarkMode) {
                    card.style.setProperty("--ws-folder-front", `color-mix(in srgb, ${pColor}, black 40%)`);
                    card.style.setProperty("--ws-folder-behind", `color-mix(in srgb, ${pColor} 60%, #c1c1c1)`);
                    card.style.setProperty("--ws-folder-stroke", `color-mix(in srgb, ${pColor} 15%, #ebebeb)`);
                } else {
                    card.style.setProperty("--ws-folder-front", `color-mix(in srgb, ${pColor}, white 70%)`);
                    card.style.setProperty("--ws-folder-behind", `color-mix(in srgb, ${pColor} 60%, gray)`);
                    card.style.setProperty("--ws-folder-stroke", `color-mix(in srgb, ${pColor} 50%, black)`);
                }

                if (themeData.isDarkMode) card.classList.add("dark");

                let iconEl;
                if (ws.icon && (ws.icon.includes("/") || ws.icon.startsWith("data:"))) {
                    // [audit] SEC-3 — ws.icon is stored workspace data and this string is
                    // assigned to cssText by el(), so an unescaped quote in it injected CSS
                    // declarations into privileged chrome rather than merely breaking a mask.
                    iconEl = this.el("div", {
                        className: "library-workspace-icon",
                        style: `mask-image: url("${window.ZenLibraryUtil.cssUrl(ws.icon)}");`
                    });
                } else if (ws.icon && ws.icon.trim().length > 0) {
                    iconEl = this.el("span", { textContent: ws.icon, className: "library-workspace-icon-text" });
                } else {
                    iconEl = this.el("span", {
                        textContent: this.getWorkspaceIcon(ws),
                        className: "library-workspace-icon-text fallback"
                    });
                }

                const iconContainer = this.el("div", {
                    className: "library-workspace-icon-container"
                }, [iconEl]);
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

                const menuBtn = this.el("div", {
                    className: "library-workspace-menu-button",
                    title: "Space Options"
                }, [this.el("div")]);

                menuBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
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

                    const placeholder = this.el("div", { className: "library-workspace-card-placeholder entering" });
                    grid.insertBefore(placeholder, card);

                    card.style.width = preDragRect.width + "px";
                    card.style.height = preDragRect.height + "px";

                    const gridRectAtStart = grid.getBoundingClientRect();
                    card.style.left = (preDragRect.left - gridRectAtStart.left) + "px";
                    card.style.top = (preDragRect.top - gridRectAtStart.top) + "px";

                    void card.offsetWidth;
                    const scaledRect = card.getBoundingClientRect();
                    const initialOffsetX = e.clientX - scaledRect.left;
                    const lockedY = preDragRect.top;

                    const originalIndex = Array.from(grid.children).indexOf(placeholder);

                    let currentX = preDragRect.left;
                    let targetX = preDragRect.left;
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
                        const currentGridRect = grid.getBoundingClientRect();
                        currentX += (targetX - currentX) * 0.42;
                        if (Math.abs(targetX - currentX) < 0.5) currentX = targetX;

                        card.style.left = (currentX - currentGridRect.left) + "px";
                        card.style.top = (lockedY - currentGridRect.top) + "px";

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
                        targetX = mouseX - initialOffsetX;

                        const gridRect = grid.getBoundingClientRect();
                        const scrollLeft = grid.scrollLeft;
                        const paddingLeft = 16;
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
                } else {
                    this.renderFolder(item, container, wsId);
                }
            } else if (window.gBrowser.isTab(item)) {
                this.renderTab(item, container, wsId);
            }
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

            let isExpanded;
            if (this._folderExpansion.has(folderId)) {
                isExpanded = this._folderExpansion.get(folderId);
            } else {
                const isNativeCollapsed = folder.hasAttribute("zen-folder-collapsed") || folder.collapsed;
                isExpanded = !isNativeCollapsed;
                this._folderExpansion.set(folderId, isExpanded);
            }

            const allTabs = folder.allItemsRecursive || folder.tabs || [];
            const hasActive = allTabs.some(t => t.selected);

            const folderEl = this.el("div", { className: `library-workspace-folder ${isExpanded ? '' : 'collapsed'}` });

            const headerEl = this.el("div", {
                className: "library-workspace-item folder",
                onclick: (e) => {
                    e.stopPropagation();
                    const currentlyExpanded = this._folderExpansion.get(folderId);
                    const newlyExpanded = !currentlyExpanded;

                    this._folderExpansion.set(folderId, newlyExpanded);
                    folderEl.classList.toggle("collapsed", !newlyExpanded);

                    const chevron = headerEl.querySelector(".folder-chevron svg");
                    if (chevron) {
                        const rot = newlyExpanded ? "0deg" : "-90deg";
                        chevron.setAttribute("style", `transform: rotate(${rot}); transition: transform 0.2s;`);
                    }

                    const iconSvg = headerEl.querySelector(".folder-icon svg");
                    if (iconSvg) {
                        iconSvg.setAttribute("state", newlyExpanded ? "open" : "close");
                    }
                }
            });

            const rot = isExpanded ? '0deg' : '-90deg';
            const chevronSvg = this.svg(`<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="transform: rotate(${rot}); transition: transform 0.2s;"><path d="M7 10l5 5 5-5z"/></svg>`);

            const folderIconSvg = this.createFolderIconSVG(folder.iconURL, isExpanded ? "open" : "close", hasActive && !isExpanded);

            headerEl.appendChild(this.el("span", { className: "folder-chevron" }, [chevronSvg]));

            const iconWrapper = this.el("span", { className: "item-icon folder-icon" });
            iconWrapper.appendChild(folderIconSvg);
            headerEl.appendChild(iconWrapper);

            headerEl.appendChild(this.el("span", { className: "item-label", textContent: folder.label || "Folder" }));

            folderEl.appendChild(headerEl);

            const contentEl = this.el("div", { className: "library-workspace-folder-content" });
            const children = (folder.allItems || folder.tabs || []).filter(child => {
                return !child.hasAttribute('cloned') && !child.hasAttribute('zen-empty-tab');
            });
            children.forEach(child => this.renderItemRecursive(child, contentEl, wsId));

            folderEl.appendChild(contentEl);
            container.appendChild(folderEl);
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
                this.el("img", { src: iconSrc, className: "item-icon", onerror: "this.src='chrome://global/skin/icons/defaultFavicon.svg'" }),
                this.el("span", { className: "item-label", textContent: tab.label })
            ]);
            itemEl.draggable = true;
            itemEl.addEventListener("dragstart", (e) => this.onTabDragStart(e, tab, wsId));
            itemEl.addEventListener("dragover", (e) => this.onTabDragOver(e, tab, wsId));
            itemEl.addEventListener("dragleave", () => itemEl.removeAttribute("drag-over"));
            itemEl.addEventListener("drop", (e) => this.onTabDrop(e, tab, wsId));
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
        getTabIcon(tab) {
            return tab.zenStaticIcon ||
                tab.getAttribute?.("image") ||
                "chrome://global/skin/icons/defaultFavicon.svg";
        }

        getWorkspaceIcon(ws) {
            try {
                if (window.gZenWorkspaces?.getWorkspaceIcon) {
                    return window.gZenWorkspaces.getWorkspaceIcon(ws);
                }
            } catch (e) { }

            const icon = String(ws?.icon || "").trim();
            if (icon) return icon;
            const name = String(ws?.name || "").trim();
            return name ? name[0].toUpperCase() : "";
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

        onTabDragOver(e, targetTab, wsId) {
            if (!this._draggedTabInfo || this._draggedTabInfo.tab === targetTab) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            e.currentTarget.setAttribute("drag-over", e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.clientHeight / 2 ? "after" : "before");
            this._markDropCard(wsId);
        }

        onTabDrop(e, targetTab, wsId) {
            if (!this._draggedTabInfo || this._draggedTabInfo.tab === targetTab) return;
            e.preventDefault();
            // The row's own section decides pinned-ness: rows above the separator are
            // pinned, rows below are not.
            this._applyTabDrop(wsId, targetTab.pinned, {
                targetTab,
                placeAfter: e.currentTarget.getAttribute("drag-over") === "after"
            });
        }

        // The separator is the pinned/unpinned boundary, so it is the one place where the
        // section you land in comes from which half you drop on rather than from a row.
        onSeparatorDragOver(e, wsId) {
            if (!this._draggedTabInfo) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            e.currentTarget.setAttribute("drag-over", this._isTopHalf(e) ? "before" : "after");
            this._markDropCard(wsId);
        }

        onSeparatorDrop(e, wsId) {
            if (!this._draggedTabInfo) return;
            e.preventDefault();
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
            if (e.target.closest?.(".library-workspace-item, .library-workspace-separator-container")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            this._markDropCard(wsId);
        }

        onCardDrop(e, wsId) {
            if (!this._draggedTabInfo) return;
            if (e.target.closest?.(".library-workspace-item, .library-workspace-separator-container")) return;
            e.preventDefault();
            this._applyTabDrop(wsId, false);
        }

        // One path for every drop. Order matters: pinTab/unpinTab relocate the tab into the
        // *active* workspace's containers (gBrowser.pinTab uses the global pinned container,
        // unpinTab prepends to gZenWorkspaces.activeWorkspaceStrip), so the workspace move
        // has to come after them to put the tab back where it was actually dropped.
        _applyTabDrop(wsId, wantPinned, { targetTab = null, placeAfter = false } = {}) {
            const draggedTab = this._draggedTabInfo.tab;
            const sourceWsId = this._draggedTabInfo.wsId;
            const changedPinned = draggedTab.pinned !== wantPinned;
            const noop = !changedPinned && sourceWsId === wsId && !targetTab;

            if (noop) {
                this.clearTabDragState();
                return;
            }

            if (changedPinned && !this._setTabPinned(draggedTab, wantPinned)) return;
            if (!this._moveTabToWorkspace(draggedTab, wsId)) return;

            // moveTabBefore/After route through tabbrowser's #handleTabMove, which is what
            // recomputes every _tPos, invalidates the cached tab list, fires TabMove for
            // session store, and handles group/split-view wrappers. A raw insertBefore on
            // the live tab strip does none of that and silently desyncs all of it.
            if (targetTab && targetTab.isConnected && targetTab.pinned === draggedTab.pinned) {
                if (placeAfter) window.gBrowser.moveTabAfter(draggedTab, targetTab);
                else window.gBrowser.moveTabBefore(draggedTab, targetTab);
            }

            this._finishTabDrop(draggedTab, sourceWsId, wsId);
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
        _moveTabToWorkspace(tab, wsId) {
            try {
                window.gZenWorkspaces?.moveTabToWorkspace?.(tab, wsId);
            } catch (e) {
                console.error("[ZenLibrary Spaces] moveTabToWorkspace threw:", e);
            }

            if (!this._workspaceContainerFor(tab, wsId)?.contains(tab)) {
                console.warn("[ZenLibrary Spaces] Tab was not moved to workspace", wsId);
                this.clearTabDragState();
                return false;
            }

            if (tab.getAttribute("zen-workspace-id") !== wsId) {
                tab.setAttribute("zen-workspace-id", wsId);
            }
            return true;
        }

        _finishTabDrop(draggedTab, sourceWsId, targetWsId) {
            const changedWorkspace = sourceWsId !== targetWsId;

            // Dragging the tab you are currently looking at out of the space you are
            // currently in would leave gBrowser.selectedTab pointing at a tab the active
            // space no longer contains. Zen's own changeTabWorkspace resolves that by
            // following the tab, so do the same — but only in that one case, so ordinary
            // organising never yanks the user between spaces.
            const shouldFollow = changedWorkspace &&
                draggedTab.selected &&
                window.gZenWorkspaces?.activeWorkspace === sourceWsId;

            if (changedWorkspace && window.gZenWorkspaces.lastSelectedWorkspaceTabs) {
                window.gZenWorkspaces.lastSelectedWorkspaceTabs[targetWsId] = draggedTab;
            }

            // The active space is repainted too: pin/unpin routes the tab through its
            // containers on the way past, so its card can be stale even when uninvolved.
            new Set([targetWsId, sourceWsId, window.gZenWorkspaces?.activeWorkspace])
                .forEach(id => { if (id) this.renderIntoExistingCard(id); });
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
                    item.removeAttribute("dragged");
                    item.removeAttribute("drag-over");
                    item.removeAttribute("drop-target");
                });
            root?.querySelector?.(".library-workspace-grid")?.removeAttribute("dragging-tab");
            this._draggedTabInfo = null;
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

            // The separator doubles as the pin/unpin drop zone, so it is rendered even with
            // nothing pinned — otherwise such a space could never receive a pinned tab. CSS
            // keeps that empty case hidden until a tab drag is actually in progress.
            const separator = this.createWorkspaceSeparator(wsId);
            if (pinnedCount === 0) separator.setAttribute("no-pinned", "true");

            if (items.length === 0) {
                list.appendChild(separator);
                list.appendChild(this.el("div", {
                    className: "empty-state",
                    style: "padding: 20px; text-align:center; opacity:0.5; font-size: 12px;",
                    textContent: "Empty Workspace"
                }));
                return;
            }

            items.forEach((item, index) => {
                if (index === pinnedCount) list.appendChild(separator);
                this.renderItemRecursive(item, list, wsId);
            });
            if (pinnedCount === items.length) list.appendChild(separator);
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
        }

        createWorkspaceSeparator(wsId) {
            const cleanupBtn = this.el("div", {
                className: "library-workspace-cleanup-button",
                title: "Clear unpinned tabs"
            }, [this.el("span", { textContent: "Clear" })]);

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
            container.addEventListener("dragleave", () => container.removeAttribute("drag-over"));
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
            document.getElementById("mainPopupSet")?.appendChild(popup) || document.body.appendChild(popup);
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

            // Global mousedown listener to cancel rename when clicking elsewhere
            const onClickOutside = (ev) => {
                // Allow clicking inside the name container (input or padding)
                if (!nameSpan.contains(ev.target)) {
                    finish(originalName);
                }
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
            const header = this.library.shadowRoot.querySelector(`.library-workspace-card[workspace-id="${ws.uuid}"] .library-workspace-name`);
            if (header) {
                this.startInlineRename({ currentTarget: header }, ws);
            }
        }

        changeWorkspaceIcon(ws, anchor) {
            if (!window.gZenEmojiPicker) return;

            window.gZenEmojiPicker.open(anchor).then(async (emoji) => {
                // If emoji is null or empty, it means "delete icon" was pressed
                ws.icon = emoji || "";
                if (window.gZenWorkspaces?.saveWorkspace) {
                    await window.gZenWorkspaces.saveWorkspace(ws);
                    if (this.library.update) this.library.update();
                }
            }).catch(() => { }); // Prevent console errors on picker closing
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

            // Force focus to the main window content to ensure commands work
            if (window.content) window.content.focus();

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

    window.ZenLibrarySpaces = ZenLibrarySpaces;
})();
