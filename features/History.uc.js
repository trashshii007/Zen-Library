"use strict";

(function () {
    class ZenLibraryHistory {
        constructor(library) {
            this.library = library;
            this._container = null;
            this._closedWindowsContainer = null;
            this._wrapper = null;
            this._items = [];
            this._searchTerm = "";
            this._batchSize = 30;
            this._isLoading = false;
            this._renderedCount = 0;
            this._lastGroupLabel = null;
            this._isFetching = false;
            this._initialized = false; // Track if data has been pre-fetched
            this._unsubscribe = null;  // [audit] BUG-2 — store subscription, released in destroy()
            this._activeWhenFilter = "all";
            this._activeSort = "date";
            this._filtersOpen = false;
            this._searchDebounce = null;
            this._placesListener = null;
            this._placesTimer = null;
        }

        // Visits made while the panel is open re-query Places, debounced like native's nsINavHistoryResultObserver rebuild.
        static PLACES_EVENTS = ["page-visited", "page-removed", "page-title-changed", "history-cleared"];

        _placesObservers() {
            try {
                return globalThis.PlacesObservers || ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs").PlacesUtils.observers;
            } catch (e) { return null; }
        }

        _watchPlaces() {
            const observers = this._placesObservers();
            if (this._placesListener || !observers) return;
            this._placesListener = (events) => {
                if (!this._container) return;
                // sync() only refetches when the newest visit changed; title updates and removals never move it.
                const refetch = events.some(e => e.type !== "page-visited");
                clearTimeout(this._placesTimer);
                this._placesTimer = setTimeout(() => {
                    this._placesTimer = null;
                    if (!this._container) return;
                    if (refetch) this.fetchHistory().then(() => this.renderBatch(true));
                    else this.sync();
                }, 250);
            };
            try {
                observers.addListener(ZenLibraryHistory.PLACES_EVENTS, this._placesListener);
            } catch (e) {
                this._placesListener = null;
            }
        }

        _unwatchPlaces() {
            clearTimeout(this._placesTimer);
            this._placesTimer = null;
            if (!this._placesListener) return;
            try { this._placesObservers()?.removeListener(ZenLibraryHistory.PLACES_EVENTS, this._placesListener); } catch (e) { }
            this._placesListener = null;
        }

        /**
         * Background initialization - called at startup to pre-fetch data.
         *
         * [audit] BUG-2 — this class used to declare init() twice. In a class body the
         * second declaration silently replaces the first, so the one that actually ran was
         * the *other* one further down: no re-entrancy guard, and a fresh store subscription
         * added on every call. The two are merged here and the duplicate is gone.
         */
        async init() {
            if (this._isFetching || this._initialized) return;
            this._isFetching = true;
            try {
                // Subscribed once, on the first init only, so repeated calls cannot stack up
                // listeners that each re-render the list.
                if (!this._unsubscribe && this.library.store) {
                    this._unsubscribe = this.library.store.subscribe((state) => {
                        if (state.history && state.history !== this._items) {
                            this._items = state.history;
                            // Only re-render if we are already displaying something.
                            if (this._container) this.renderBatch(true);
                        }
                    });
                }
                await this.fetchHistory();
                this._initialized = true;
                this._watchPlaces();
            } catch (e) {
                console.error("ZenLibrary History init error:", e);
            } finally {
                this._isFetching = false;
            }
        }

        get el() { return this.library.el.bind(this.library); }

        // Built once per section render; the filter panel and chips toggle in place so the list transition runs and the sub-pane survives.
        renderHeaderControls() {
            const top = this.el("div", { className: "zen-library-search-top" });

            const searchInput = this.el("input", {
                type: "search",
                placeholder: "Search History…",
                value: this._searchTerm,
                oninput: (event) => this._onSearchInput(event)
            });

            const searchHeader = this.el("div", { className: "zen-library-search-header" }, [
                this.el("div", { className: "zen-library-search-box" }, [
                    this.el("img", {
                        src: "chrome://browser/skin/zen-icons/search-glass.svg",
                        alt: ""
                    }),
                    searchInput
                ]),
                this.el("button", {
                    className: "zen-library-filter-button",
                    onclick: (event) => {
                        event.preventDefault();
                        this._setFiltersOpen(true);
                    }
                }, [
                    this.el("img", {
                        src: "chrome://browser/skin/zen-icons/sliders.svg",
                        alt: ""
                    }),
                    this.el("span", { textContent: "Filter" })
                ])
            ]);

            const filterHeader = this.el("div", { className: "zen-library-filter-header" }, [
                this.el("h2", { textContent: "Filter History…" }),
                this.el("button", {
                    className: "zen-library-filter-done",
                    textContent: "Done",
                    onclick: (event) => {
                        event.preventDefault();
                        this._setFiltersOpen(false);
                    }
                })
            ]);

            this._chipEls = [];
            const panelInner = this.el("div", { className: "zen-library-filter-panel-inner" }, [
                this._renderFilterGroup("when", "When was it visited?", [
                    ["today", "Today"],
                    ["week", "This Week"],
                    ["month", "This Month"]
                ]),
                this._renderFilterGroup("sort", "Sort by", [
                    ["date", "By Date"],
                    ["site", "By Site"],
                    ["mostvisited", "By Most Visited"]
                ]),
                this.el("div", { className: "zen-library-filter-divider" })
            ]);

            top.appendChild(searchHeader);
            top.appendChild(filterHeader);
            top.appendChild(this.el("div", { className: "zen-library-filter-panel" }, [panelInner]));

            this._headerEls = { top, searchHeader, filterHeader, panelInner };
            this._syncChips();
            this._applyFiltersOpen();
            return top;
        }

        _setFiltersOpen(open) {
            this._filtersOpen = open;
            this._applyFiltersOpen();
        }

        _applyFiltersOpen() {
            const els = this._headerEls;
            if (!els) return;
            const open = this._filtersOpen;
            els.top.toggleAttribute("open", open);
            els.searchHeader.toggleAttribute("inert", open);
            els.filterHeader.toggleAttribute("inert", !open);
            els.panelInner.toggleAttribute("inert", !open);
            // The shifted list is a sibling of the header, so the var lives on the host; scrollHeight needs a layout frame.
            const host = this.library;
            if (!open) {
                host.style?.setProperty("--zen-library-filter-height", "0px");
                return;
            }
            requestAnimationFrame(() => {
                if (this._headerEls !== els || !this._filtersOpen) return;
                host.style?.setProperty("--zen-library-filter-height", `${els.panelInner.scrollHeight + 8}px`);
            });
        }

        _renderFilterGroup(groupId, title, options) {
            return this.el("div", { className: "zen-library-filter-group" }, [
                this.el("h3", { textContent: title }),
                this.el("div", { className: "zen-library-filter-options" },
                    options.map(([id, label]) => this._renderFilterChip(groupId, id, label))
                )
            ]);
        }

        _renderFilterChip(groupId, id, label) {
            const chip = this.el("button", {
                className: "zen-library-filter-chip",
                onclick: (event) => {
                    event.preventDefault();
                    if (groupId === "when") this._toggleWhenFilter(id);
                    else this._setSort(id);
                }
            }, [this.el("span", { textContent: label })]);
            this._chipEls.push({ chip, groupId, id });
            return chip;
        }

        _syncChips() {
            for (const { chip, groupId, id } of this._chipEls || []) {
                const active = groupId === "when" ? this._activeWhenFilter === id : this._activeSort === id;
                chip.toggleAttribute("active", active);
            }
        }

        _onSearchInput(event) {
            const value = event.target.value;
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this._searchDebounce = null;
                const query = value.trim();
                if (query === this._searchTerm) return;
                this._searchTerm = query;
                this.renderBatch(true);
            }, 300);
        }

        _toggleWhenFilter(id) {
            this._activeWhenFilter = this._activeWhenFilter === id ? "all" : id;
            this._syncChips();
            this.renderBatch(true);
        }

        _setSort(id) {
            const next = ["date", "site", "mostvisited"].includes(id) ? id : "date";
            if (this._activeSort === next) return;
            this._activeSort = next;
            this._syncChips();
            this.renderBatch(true);
        }

        _historyTimeMs(item) {
            return (Number(item?.time) || 0) / 1000;
        }

        _whenCutoff() {
            const now = new Date();
            if (this._activeWhenFilter === "today") {
                now.setHours(0, 0, 0, 0);
                return now.getTime();
            }
            if (this._activeWhenFilter === "week") {
                return Date.now() - 7 * 24 * 60 * 60 * 1000;
            }
            if (this._activeWhenFilter === "month") {
                return Date.now() - 30 * 24 * 60 * 60 * 1000;
            }
            return 0;
        }

        // Memoised on the item: the sort comparators read the host O(n log n) times.
        _hostLabel(item) {
            if (item._host === undefined) {
                try {
                    item._host = new URL(item.uri).hostname.replace(/^www\./i, "") || "Other";
                } catch (e) {
                    item._host = "Other";
                }
            }
            return item._host;
        }

        // Cached until items, term, filter or sort change, so each loadMore() batch slices the same list.
        _filteredAndSortedItems() {
            const key = [this._searchTerm, this._activeWhenFilter, this._activeSort].join("\u0001");
            const cache = this._filterCache;
            if (cache && cache.items === this._items && cache.key === key) return cache.result;

            const term = this._searchTerm.trim().toLowerCase();
            const cutoff = this._whenCutoff();

            const items = this._items.filter((item) => {
                if (cutoff && this._historyTimeMs(item) < cutoff) return false;
                if (!term) return true;
                return item.title.toLowerCase().includes(term) ||
                    item.uri.toLowerCase().includes(term) ||
                    this._hostLabel(item).toLowerCase().includes(term);
            });

            if (this._activeSort === "site") {
                items.sort((a, b) =>
                    this._hostLabel(a).localeCompare(this._hostLabel(b)) ||
                    this._historyTimeMs(b) - this._historyTimeMs(a));
            } else if (this._activeSort === "mostvisited") {
                // Visit counts are per host over the loaded 500-entry window, not Places' visit_count.
                const visitCounts = new Map();
                for (const item of this._items) {
                    const host = this._hostLabel(item);
                    visitCounts.set(host, (visitCounts.get(host) || 0) + 1);
                }
                items.sort((a, b) =>
                    (visitCounts.get(this._hostLabel(b)) || 0) - (visitCounts.get(this._hostLabel(a)) || 0) ||
                    this._historyTimeMs(b) - this._historyTimeMs(a));
            } else {
                items.sort((a, b) => this._historyTimeMs(b) - this._historyTimeMs(a));
            }

            this._filterCache = { items: this._items, key, result: items };
            return items;
        }

        resetView() {
            this.resetControls();
            // Prefer the mounted wrapper: a forced section re-render can leave _wrapper pointing at a detached one.
            const wrapper = this.library.shadowRoot?.querySelector?.(".library-content .library-list-wrapper") || this._wrapper;
            if (wrapper) {
                wrapper.classList.remove("panes-shifted");
                this._container?.classList.add("scrollbar-visible");
            }
        }

        resetControls() {
            this._setFiltersOpen(false);
        }

        render() {
            // Main wrapper for switcher and panes
            const wrapper = this.el("div", {
                className: "library-list-wrapper"
            });
            this._wrapper = wrapper;

            const panes = this.el("div", { className: "library-list-panes" });
            wrapper.appendChild(panes);

            // History Pane
            const historyPane = this.el("div", { className: "history-pane" });
            const historyContainer = this.el("div", {
                className: "library-list-container",
                onscroll: (e) => {
                    const el = e.target;
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
                        this.loadMore();
                    }
                }
            });
            this._container = historyContainer;
            historyPane.appendChild(historyContainer);
            panes.appendChild(historyPane);

            // Closed Windows Pane
            const closedPane = this.el("div", { className: "history-pane" });
            const closedContainer = this.el("div", { className: "library-closed-windows-container" });
            this._closedWindowsContainer = closedContainer;

            const backBtn = this.el("div", {
                className: "history-back-button",
                style: "flex-shrink: 0; margin-bottom: 4px;", // Prevent shrinking and add small gap
                onclick: () => this.resetView()
            }, [
                this.el("div", { className: "back-arrow" }),
                this.el("span", { textContent: "Back to History" })
            ]);
            closedPane.appendChild(backBtn);
            closedPane.appendChild(closedContainer);
            panes.appendChild(closedPane);

            const startLoading = () => {
                const onLoaded = () => {
                    this.library.enterContent(historyContainer);
                    setTimeout(() => historyContainer.classList.add("scrollbar-visible"), 100);
                };

                const navItems = document.createDocumentFragment();

                const closedTabsItem = this.el("div", {
                    className: "history-nav-item history-nav-static",
                    onclick: () => {
                        this._wrapper.classList.add("panes-shifted");
                        this.renderClosedTabs();
                    }
                }, [
                    this.el("div", { className: "nav-icon", style: "--history-nav-icon: url('chrome://browser/skin/history.svg')" }),
                    this.el("span", { className: "nav-label", textContent: "Recently closed tabs" }),
                    this.el("div", { className: "nav-arrow" })
                ]);

                const closedWindowsItem = this.el("div", {
                    className: "history-nav-item history-nav-static",
                    onclick: () => {
                        this._wrapper.classList.add("panes-shifted");
                        this.renderClosedWindows();
                    }
                }, [
                    this.el("div", { className: "nav-icon", style: "--history-nav-icon: url('chrome://browser/skin/window.svg')" }),
                    this.el("span", { className: "nav-label", textContent: "Recently closed windows" }),
                    this.el("div", { className: "nav-arrow" })
                ]);

                const clearItem = this.el("div", {
                    className: "history-nav-item history-nav-static",
                    onclick: () => {
                        const win = Services.wm.getMostRecentWindow("browser:pure") || window;
                        const cmd = win.document.getElementById("Tools:Sanitize") ||
                            win.document.getElementById("cmd_sanitizeHistory");
                        if (cmd) {
                            cmd.doCommand();
                            return;
                        }
                        try { Services.obs.notifyObservers(null, "sanitize", ""); } catch (e) { }
                        try {
                            win.openDialog("chrome://browser/content/sanitize.xhtml", "Sanitize", "chrome,modal,resizable=yes,centerscreen");
                        } catch (e) { }
                    }
                }, [
                    this.el("div", { className: "nav-icon", style: "--history-nav-icon: url('chrome://global/skin/icons/delete.svg')" }),
                    this.el("span", { className: "nav-label", textContent: "Clear history..." })
                ]);

                navItems.appendChild(closedTabsItem);
                navItems.appendChild(closedWindowsItem);
                navItems.appendChild(clearItem);
                historyContainer.appendChild(navItems);

                if (this._items.length === 0 && !this._isLoading) {
                    this.fetchHistory().then(() => {
                        this.renderBatch(true);
                        onLoaded();
                    });
                } else {
                    this.renderBatch(true);
                    onLoaded();
                }
            };

            // If already initialized (pre-fetched), skip loading and render instantly
            if (this._initialized && this._items.length > 0) {
                startLoading();
                this.library.enterContent(historyContainer);
                setTimeout(() => historyContainer.classList.add("scrollbar-visible"), 50);
                // Trigger background sync (deferred to avoid stutter during transition)
                setTimeout(() => this.sync(), 400);
                return wrapper;
            }

            // No cache - show loading screen
            const isTransitioning = window.gZenLibrary && window.gZenLibrary._isTransitioning;
            const loading = this.el("div", { className: "empty-state" }, [
                this.el("div", { className: "empty-icon history-icon" }),
                this.el("h3", { textContent: "Preparing history..." }),
                this.el("p", { textContent: "Gathering your browsing history." })
            ]);
            this.library.enterContent(loading);
            historyContainer.appendChild(loading);

            const delay = isTransitioning ? 400 : 200;
            setTimeout(() => {
                const l = historyContainer.querySelector(".empty-state");
                if (l) l.remove();
                startLoading();
            }, delay);

            return wrapper;
        }

        /**
         * Sync - called after rendering cached data to check for updates
         * Optimized: Checks most recent item first before doing full fetch
         */
        async sync() {
            try {
                // Lightweight check: just get 1 item
                const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
                const query = PlacesUtils.history.getNewQuery();
                const options = PlacesUtils.history.getNewQueryOptions();
                options.sortingMode = options.SORT_BY_DATE_DESCENDING;
                options.maxResults = 1;

                const result = PlacesUtils.history.executeQuery(query, options);
                const root = result.root;
                root.containerOpen = true;

                let latestItem = null;
                if (root.childCount > 0) {
                    const node = root.getChild(0);
                    latestItem = { time: node.time, uri: node.uri };
                }
                root.containerOpen = false;

                // Compare with current head
                const currentHead = this._items.length > 0 ? this._items[0] : null;

                let needsUpdate = false;
                if (!latestItem && !currentHead) needsUpdate = false; // Both empty
                else if ((!latestItem && currentHead) || (latestItem && !currentHead)) needsUpdate = true; // One empty
                else if (latestItem.time !== currentHead.time) needsUpdate = true; // Timestamp diff

                if (needsUpdate) {
                    // Track time of current newest item to highlight newer ones
                    this._highlightNewerThan = currentHead ? currentHead.time : 0;

                    // Do full fetch
                    await this.fetchHistory();
                    this.renderBatch(true);

                    // Reset after render
                    this._highlightNewerThan = 0;
                }
            } catch (e) {
                console.error("ZenLibrary History sync error:", e);
            }
        }

        // [audit] BUG-2 — a second `async init()` used to live here, silently overriding the
        // guarded one at the top of the class. Its body has been folded into that one; this
        // is where it was.

        // Releases the store subscription taken in init(). Called from destroy().
        _unsubscribeStore() {
            if (this._unsubscribe) {
                try { this._unsubscribe(); } catch (e) { }
                this._unsubscribe = null;
            }
        }

        destroy() {
            this._unsubscribeStore();
            this._unwatchPlaces();
            if (this._searchDebounce) {
                clearTimeout(this._searchDebounce);
                this._searchDebounce = null;
            }
            this._container = null;
            this._closedWindowsContainer = null;
            this._wrapper = null;
            this._headerEls = null;
            this._chipEls = null;
            this._filterCache = null;
        }

        async fetchHistory() {
            this._isLoading = true;
            try {
                const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
                const query = PlacesUtils.history.getNewQuery();
                const options = PlacesUtils.history.getNewQueryOptions();
                options.sortingMode = options.SORT_BY_DATE_DESCENDING;
                options.maxResults = 500;

                const result = PlacesUtils.history.executeQuery(query, options);
                const root = result.root;
                root.containerOpen = true;

                const items = [];
                for (let i = 0; i < root.childCount; i++) {
                    const node = root.getChild(i);
                    items.push({
                        uri: node.uri,
                        title: node.title || node.uri,
                        time: node.time,
                        timeStr: new Date(node.time / 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        dateStr: new Date(node.time / 1000).toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit', year: 'numeric' })
                    });
                }
                root.containerOpen = false;

                // dispatch to store
                if (this.library.store) {
                    this.library.store.dispatch({ type: 'SET_HISTORY', payload: items });
                } else {
                    this._items = items;
                }
            } catch (e) {
                console.error("ZenLibrary History Fetch Error:", e);
            } finally {
                this._isLoading = false;
            }
        }

        renderBatch(reset = true) {
            try {
                if (!this._container) return;

                // Check if custom elements are properly registered
                if (!customElements.get('zen-library-item')) {
                    console.error("ZenLibrary Error in renderBatch: zen-library-item custom element not registered");
                    return;
                }

                if (reset) {
                    const navItems = this._container.querySelectorAll(".history-nav-static");
                    this._container.innerHTML = "";
                    navItems.forEach(i => this._container.appendChild(i));
                    this._renderedCount = 0;
                    this._lastGroupLabel = null;
                }

                const filtered = this._filteredAndSortedItems();

                if (filtered.length === 0 && !this._isLoading) {
                    if (!reset) return;
                    const empty = this.el("div", { className: "empty-state" }, [
                        this.el("div", { className: "empty-icon history-icon" }),
                        this.el("h3", { textContent: this._searchTerm ? "No results found" : "No history found" }),
                        this.el("p", { textContent: "Your browsing history is empty." })
                    ]);
                    this._container.appendChild(empty);
                    return;
                }

                const nextBatch = filtered.slice(this._renderedCount, this._renderedCount + this._batchSize);
                if (nextBatch.length === 0) return;

                const fragment = document.createDocumentFragment();
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

                nextBatch.forEach(item => {
                    try {
                        const timeMs = item.time / 1000;
                        let groupLabel = "";

                        if (this._activeSort === "site" || this._activeSort === "mostvisited") {
                            groupLabel = this._hostLabel(item);
                        } else if (this._searchTerm) {
                            groupLabel = "Search Results";
                        } else {
                            const d = new Date(timeMs); d.setHours(0, 0, 0, 0);
                            if (d.getTime() === today.getTime()) groupLabel = "Today";
                            else if (d.getTime() === yesterday.getTime()) groupLabel = "Yesterday";
                            else groupLabel = new Date(timeMs).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                        }

                        if (groupLabel !== this._lastGroupLabel) {
                            fragment.appendChild(this.el("div", { className: "history-section-header", textContent: groupLabel }));
                            this._lastGroupLabel = groupLabel;
                        }

                        const displayTime = (this._searchTerm ||
                            this._activeSort === "site" ||
                            this._activeSort === "mostvisited" ||
                            (this._lastGroupLabel !== "Today" && this._lastGroupLabel !== "Yesterday"))
                            ? item.dateStr : item.timeStr;

                        const itemEl = document.createElement('zen-library-item');
                        if (!itemEl || typeof itemEl.setAttribute !== 'function') {
                            console.error("ZenLibrary Error: zen-library-item custom element not properly registered");
                            return;
                        }

                        // Set data first so status/logic can apply
                        itemEl.data = item;

                        itemEl.setAttribute("icon", `page-icon:${item.uri}`);
                        itemEl.setAttribute("title", item.title);
                        itemEl.setAttribute("subtitle", item.uri);
                        itemEl.setAttribute("time", displayTime);

                        const actions = this.el("div", { className: "zen-library-row-actions history-row-actions" });
                        const removeButton = this.el("button", {
                            className: "history-row-action history-row-remove",
                            title: "Remove from history",
                            onclick: (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                this._removeHistoryItem(item, itemEl);
                            }
                        });
                        const reopenButton = this.el("button", {
                            className: "history-row-action history-row-reopen",
                            title: "Reopen page",
                            onclick: (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                this._openHistoryItem(item);
                            }
                        });
                        actions.appendChild(removeButton);
                        actions.appendChild(reopenButton);
                        itemEl.appendSecondaryAction(actions);

                        if (this._highlightNewerThan && item.time > this._highlightNewerThan) {
                            itemEl.classList.add("pop-in");
                        }

                        itemEl.onclick = () => this._openHistoryItem(item);

                        itemEl.oncontextmenu = (e) => {
                            e.preventDefault();
                            this._showContextMenu(e, item, itemEl);
                        };

                        fragment.appendChild(itemEl);
                    } catch (itemError) {
                        console.error("ZenLibrary Error processing history item:", itemError, item);
                    }
                });

                this._renderedCount += nextBatch.length;
                const oldSpacer = this._container.querySelector(".history-bottom-spacer");
                if (oldSpacer) oldSpacer.remove();
                this._container.appendChild(fragment);
                this._container.appendChild(this.el("div", { className: "history-bottom-spacer" }));
            } catch (e) {
                console.error("ZenLibrary Error in renderBatch:", e);
            }
        }

        loadMore() { if (!this._isLoading) this.renderBatch(false); }

        _openHistoryItem(item) {
            // [audit] SEC-2 — was a system triggering principal on a URI read
            // straight out of the Places database. Places will happily store
            // data: and other non-web schemes, and a system principal is what
            // makes those load *with privilege* rather than merely load.
            // Validated against a scheme allowlist, then a null principal.
            if (!window.ZenLibraryUtil.openExternal(window, item.uri)) return;
            window.gZenLibrary.close();
        }

        async _removeHistoryItem(item, itemEl) {
            try {
                const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
                await PlacesUtils.history.remove(item.uri);
                this._items = this._items.filter(i => i.uri !== item.uri);
                if (itemEl) {
                    itemEl.style.transition = "opacity 0.15s, transform 0.15s";
                    itemEl.style.opacity = "0";
                    itemEl.style.transform = "translateX(-8px)";
                }
                setTimeout(() => this.renderBatch(true), 160);
            } catch (err) {
                console.error("[ZenLibrary History] Remove history item failed:", err);
            }
        }

        _copyToClipboard(text) {
            try {
                const helper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                    .getService(Components.interfaces.nsIClipboardHelper);
                helper.copyString(text);
            } catch (err) {
                console.error("[ZenLibrary History] Copy failed:", err);
            }
        }

        _hostnameFromUri(uri) {
            try {
                const url = new URL(uri);
                if (url.protocol === "file:") return ".";
                return url.hostname;
            } catch (err) {
                return "";
            }
        }

        _getBrowserWindow() {
            if (window.gBrowser && window.SessionStore) return window;
            if (window.opener?.gBrowser && window.opener.SessionStore) return window.opener;
            return Services.wm.getMostRecentWindow("navigator:browser") ||
                Services.wm.getMostRecentWindow("browser:pure") ||
                window;
        }

        _getSessionStore(browserWindow = this._getBrowserWindow()) {
            return browserWindow.SessionStore || window.SessionStore || window.opener?.SessionStore || null;
        }

        // [audit] SEC-3 — this was the only correct copy of this escaping in the mod, and it
        // was used at exactly one of the four places that needed it. It now delegates to the
        // shared helper so the other three cannot drift away from it again.
        _cssUrlValue(url) {
            return window.ZenLibraryUtil.cssUrl(url || "about:blank");
        }

        _ensureContextMenu() {
            if (document.getElementById("zen-history-context-menu")) return;
            const popup = document.createXULElement("menupopup");
            popup.id = "zen-history-context-menu";

            const copyItem = document.createXULElement("menuitem");
            copyItem.id = "zen-history-ctx-copy";
            copyItem.setAttribute("label", "Copy");

            const forgetItem = document.createXULElement("menuitem");
            forgetItem.id = "zen-history-ctx-forget-site";
            forgetItem.setAttribute("label", "Forget About This Site");

            const deleteItem = document.createXULElement("menuitem");
            deleteItem.id = "zen-history-ctx-delete";
            deleteItem.setAttribute("label", "Delete");

            popup.appendChild(copyItem);
            popup.appendChild(forgetItem);
            popup.appendChild(document.createXULElement("menuseparator"));
            popup.appendChild(deleteItem);
            (document.getElementById("mainPopupSet") || document.body).appendChild(popup);
        }

        _showContextMenu(e, item, itemEl) {
            this._ensureContextMenu();
            const popup = document.getElementById("zen-history-context-menu");
            for (const id of ["zen-history-ctx-copy", "zen-history-ctx-forget-site", "zen-history-ctx-delete"]) {
                const el = document.getElementById(id);
                if (el) el.replaceWith(el.cloneNode(true));
            }

            document.getElementById("zen-history-ctx-copy").addEventListener("command", () => {
                this._copyToClipboard(item.uri);
            });

            document.getElementById("zen-history-ctx-forget-site").addEventListener("command", async () => {
                const host = this._hostnameFromUri(item.uri);
                if (!host) return;

                try {
                    const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
                    await PlacesUtils.history.removeByFilter({ host });
                    this._items = this._items.filter(i => this._hostnameFromUri(i.uri) !== host);
                    itemEl.style.transition = "opacity 0.15s, transform 0.15s";
                    itemEl.style.opacity = "0";
                    itemEl.style.transform = "translateX(-8px)";
                    setTimeout(() => this.renderBatch(true), 160);
                } catch (err) {
                    console.error("[ZenLibrary History] Forget site failed:", err);
                }
            });

            document.getElementById("zen-history-ctx-delete").addEventListener("command", async () => {
                this._removeHistoryItem(item, itemEl);
            });

            popup.openPopupAtScreen(e.screenX, e.screenY, true);
        }

        renderClosedTabs() {
            if (!this._closedWindowsContainer) return;
            const container = this._closedWindowsContainer;
            container.innerHTML = "";
            container.classList.remove("scrollbar-visible");

            const browserWindow = this._getBrowserWindow();
            const ss = this._getSessionStore(browserWindow);
            if (!ss) return;

            let closedData = ss.getClosedTabData(browserWindow);
            if (typeof closedData === "string") {
                try {
                    closedData = JSON.parse(closedData);
                } catch (err) {
                    closedData = [];
                }
            }

            if (closedData.length === 0) {
                container.appendChild(this.el("div", { className: "empty-state" }, [
                    this.el("div", { className: "empty-icon history-icon" }),
                    this.el("h3", { textContent: "No closed tabs" })
                ]));
                return;
            }

            const fragment = document.createDocumentFragment();
            fragment.appendChild(this.el("div", { className: "history-section-header", textContent: "Recently Closed Tabs" }));

            closedData.forEach((tabData, index) => {
                try {
                    const entries = tabData.state?.entries || [];
                    const entryIndex = Math.max(0, Math.min(entries.length - 1, (tabData.state?.index || 1) - 1));
                    const entry = entries[entryIndex] || entries[0] || {};
                    const title = tabData.title || entry.title || "Untitled";
                    const url = entry.url || "about:blank";
                    const iconUrl = this._cssUrlValue(`page-icon:${url}`);

                    const row = this.el("div", {
                        className: "library-list-item",
                        onclick: () => {
                            ss.undoCloseTab(browserWindow, index);
                            window.gZenLibrary.close();
                        }
                    }, [
                        this.el("div", { className: "item-icon-container" }, [
                            this.el("div", { className: "item-icon", style: `background-image: url("${iconUrl}");` })
                        ]),
                        this.el("div", { className: "item-info" }, [
                            this.el("div", { className: "item-title", textContent: title }),
                            this.el("div", { className: "item-url", textContent: url })
                        ])
                    ]);
                    fragment.appendChild(row);
                } catch (err) {
                    console.error("[ZenLibrary History] Failed to render closed tab:", err, tabData);
                }
            });

            container.appendChild(fragment);
            container.appendChild(this.el("div", { className: "history-bottom-spacer" }));
            this.library.enterContent(container);
            setTimeout(() => container.classList.add("scrollbar-visible"), 100);
        }

        renderClosedWindows() {
            if (!this._closedWindowsContainer) return;
            const container = this._closedWindowsContainer;
            container.innerHTML = "";
            container.classList.remove("scrollbar-visible");

            const browserWindow = this._getBrowserWindow();
            const ss = this._getSessionStore(browserWindow);
            if (!ss) return;

            const closedData = ss.getClosedWindowData();
            if (closedData.length === 0) {
                container.appendChild(this.el("div", { className: "empty-state" }, [
                    this.el("div", { className: "empty-icon history-icon" }),
                    this.el("h3", { textContent: "No closed windows" })
                ]));
                return;
            }

            const fragment = document.createDocumentFragment();
            fragment.appendChild(this.el("div", { className: "history-section-header", textContent: "Recently Closed Windows" }));

            closedData.forEach((win, index) => {
                const tabsCount = win.tabs.length;
                const title = win.title || `Window with ${tabsCount} tabs`;

                const row = this.el("div", {
                    className: "library-list-item",
                    onclick: () => {
                        ss.undoCloseWindow(index);
                        window.gZenLibrary.close();
                    }
                }, [
                    this.el("div", { className: "item-icon-container" }, [
                        this.el("div", { className: "item-icon", style: "background-image: url('chrome://browser/skin/window.svg'); opacity: 0.6;" })
                    ]),
                    this.el("div", { className: "item-info" }, [
                        this.el("div", { className: "item-title", textContent: title }),
                        this.el("div", { className: "item-url", textContent: `${tabsCount} tabs` })
                    ])
                ]);
                fragment.appendChild(row);
            });

            container.appendChild(fragment);
            container.appendChild(this.el("div", { className: "history-bottom-spacer" }));
            this.library.enterContent(container);
            setTimeout(() => container.classList.add("scrollbar-visible"), 100);
        }
    }

    window.ZenLibraryHistory = ZenLibraryHistory;
})();
