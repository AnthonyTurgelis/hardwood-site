/* Teams analyst workflow state: shareable filters, sort, visual, and inspector selection. */
(function () {
  "use strict";

  if (!document.body || document.body.dataset.page !== "teams-dense") return;
  if (typeof URL !== "function" || !window.history || typeof window.history.replaceState !== "function") return;

  const controls = [
    { id: "teams-search", param: "q", event: "input" },
    { id: "teams-conference", param: "conference", event: "change" },
    { id: "teams-availability", param: "availability", event: "change" },
    { id: "teams-outlook", param: "outlook", event: "change" },
  ];
  const defaultSort = { key: "rank", dir: "asc" };
  const defaultViz = "strength-title";
  const qs = (selector, root) => (root || document).querySelector(selector);
  const qsa = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const paramValue = (name) => new URL(location.href).searchParams.get(name);
  const searchInput = document.getElementById("teams-search");
  const sortSelect = document.getElementById("teams-sort");
  const sortDirSelect = document.getElementById("teams-sort-dir");
  const sortWrap = document.getElementById("teams-sort-wrap");
  const sortDirWrap = document.getElementById("teams-sort-dir-wrap");
  const exportButton = document.getElementById("teams-export");
  const mobileSortMedia = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 760px)") : null;
  const vizPanel = document.getElementById("team-viz");
  let hydrating = true;
  let hydrated = false;

  if (searchInput) {
    searchInput.setAttribute("aria-keyshortcuts", "/");
    if (!searchInput.title) searchInput.title = "Press / to focus search; Esc clears search";
  }

  function replaceParam(name, value) {
    const url = new URL(location.href);
    if (value === null || value === undefined || value === "") url.searchParams.delete(name);
    else url.searchParams.set(name, String(value));
    const query = url.searchParams.toString();
    history.replaceState(history.state, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
  }

  function cellText(cell) {
    return String(cell && (cell.innerText || cell.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function renderedTeamRows() {
    const table = document.getElementById("teams-table");
    if (!table) return [];
    const header = qsa("thead th", table).map(cellText);
    const body = qsa("tbody tr", table)
      .filter((row) => !row.querySelector(".hw-empty"))
      .map((row) => Array.from(row.children).filter((cell) => /^(TD|TH)$/.test(cell.tagName)).map(cellText));
    return header.length ? [header].concat(body) : [];
  }

  function exportTeamsCsv() {
    if (!exportButton || typeof Blob !== "function" || !window.URL || typeof window.URL.createObjectURL !== "function") return;
    const rows = renderedTeamRows();
    const count = Math.max(0, rows.length - 1);
    if (!count) {
      exportButton.setAttribute("aria-label", "No filtered team rows available to export");
      return;
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const href = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    link.href = href;
    link.download = `hardwood-teams-${stamp}.csv`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(href), 0);
    exportButton.setAttribute("aria-label", `Download filtered teams CSV; ${count} rows in current view`);
  }

  function initialSortDirection(key) {
    return key === "rank" || key === "gb" ? "asc" : "desc";
  }

  function syncSortVisibility() {
    const show = mobileSortMedia ? mobileSortMedia.matches : true;
    if (sortWrap) sortWrap.style.display = show ? "" : "none";
    if (sortDirWrap) sortDirWrap.style.display = show ? "" : "none";
  }

  function syncSortControls(key, dir) {
    if (sortSelect && Array.from(sortSelect.options).some((option) => option.value === key)) sortSelect.value = key;
    if (sortDirSelect && (dir === "asc" || dir === "desc")) sortDirSelect.value = dir;
    qsa("[data-sort]").forEach((button) => {
      const header = button.closest("th");
      if (!header) return;
      const active = button.dataset.sort === key;
      header.setAttribute("aria-sort", active ? (dir === "asc" ? "ascending" : "descending") : "none");
    });
  }

  function syncVisualTabs(activeButton) {
    qsa("[data-team-viz]").forEach((button) => {
      const active = button === activeButton;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("tabindex", active ? "0" : "-1");
    });
    if (vizPanel && activeButton && activeButton.id) vizPanel.setAttribute("aria-labelledby", activeButton.id);
  }

  function syncSelectionSemantics() {
    qsa("[data-select-team]").forEach((control) => {
      const selected = Boolean(control.closest("tr.selected") || control.classList.contains("selected"));
      control.setAttribute("aria-pressed", String(selected));
      control.setAttribute("aria-controls", "team-inspector");
    });
    qsa("[data-viz-team]").forEach((point) => {
      point.setAttribute("aria-pressed", String(point.classList.contains("selected")));
      point.setAttribute("aria-controls", "team-inspector");
    });
  }

  function writeSortState(key, dir) {
    const isDefault = key === defaultSort.key && dir === defaultSort.dir;
    replaceParam("sort", isDefault ? "" : key);
    replaceParam("dir", isDefault ? "" : dir);
  }

  function driveSort(key, desiredDir) {
    const button = qsa("[data-sort]").find((node) => node.dataset.sort === key);
    if (!button) return false;
    if (button.dataset.dir) {
      if (button.dataset.dir !== desiredDir) button.click();
    } else {
      button.click();
      if (button.dataset.dir !== desiredDir) button.click();
    }
    const actualDir = button.dataset.dir || desiredDir;
    syncSortControls(key, actualDir);
    if (!hydrating) writeSortState(key, actualDir);
    return true;
  }

  function hydrateControl(spec) {
    const value = paramValue(spec.param);
    if (value === null) return true;
    const element = document.getElementById(spec.id);
    if (!element) return false;
    if (element.tagName === "SELECT" && !Array.from(element.options).some((option) => option.value === value)) {
      replaceParam(spec.param, "");
      return true;
    }
    if (element.value !== value) {
      element.value = value;
      element.dispatchEvent(new Event(spec.event, { bubbles: true }));
    }
    return true;
  }

  function hydrateSelection() {
    const team = paramValue("team");
    if (!team) return true;
    const escaped = CSS.escape(team);
    const target = qs(`[data-select-team="${escaped}"]`) || qs(`[data-viz-team="${escaped}"]`);
    if (!target) {
      replaceParam("team", "");
      return true;
    }
    if (!target.closest("tr.selected") && !target.classList.contains("selected")) target.click();
    return true;
  }

  function hydrateSort() {
    let key = paramValue("sort") || defaultSort.key;
    let dir = paramValue("dir");
    let button = qsa("[data-sort]").find((node) => node.dataset.sort === key);
    if (!button) {
      key = defaultSort.key;
      dir = defaultSort.dir;
      replaceParam("sort", "");
      replaceParam("dir", "");
      button = qsa("[data-sort]").find((node) => node.dataset.sort === key);
      if (!button) return false;
    }
    if (dir !== null && dir !== "asc" && dir !== "desc") {
      dir = null;
      replaceParam("dir", "");
    }
    const desired = dir || (key === defaultSort.key ? defaultSort.dir : initialSortDirection(key));
    if (key === defaultSort.key) {
      if (desired !== defaultSort.dir) button.click();
    } else {
      button.click();
      if (button.dataset.dir !== desired) button.click();
    }
    syncSortControls(key, button.dataset.dir || desired);
    return true;
  }

  function hydrateViz() {
    const value = paramValue("viz");
    let button = qs(`[data-team-viz="${CSS.escape(value || defaultViz)}"]`);
    if (value && !button) {
      replaceParam("viz", "");
      button = qs(`[data-team-viz="${defaultViz}"]`);
    }
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    syncVisualTabs(button);
    return true;
  }

  function decorateVizPoints() {
    qsa("[data-viz-team]").forEach((point) => {
      if (!point.hasAttribute("tabindex")) point.setAttribute("tabindex", "0");
      if (!point.hasAttribute("role")) point.setAttribute("role", "button");
      if (!point.hasAttribute("aria-label")) {
        const title = point.querySelector("title");
        if (title && title.textContent) point.setAttribute("aria-label", title.textContent.trim());
      }
    });
  }

  function hydrate() {
    if (hydrated) return true;
    if (!qs("[data-select-team]")) return false;
    const selectionReady = hydrateSelection();
    const controlsReady = controls.every(hydrateControl);
    const sortReady = hydrateSort();
    const vizReady = hydrateViz();
    if (selectionReady && controlsReady && sortReady && vizReady) {
      hydrating = false;
      hydrated = true;
      return true;
    }
    return false;
  }

  function editableTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function moveVisualTab(current, key) {
    const tabs = qsa("[data-team-viz]");
    const index = tabs.indexOf(current);
    if (index < 0 || !tabs.length) return false;
    let nextIndex = index;
    if (key === "ArrowRight" || key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
    else if (key === "ArrowLeft" || key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = tabs.length - 1;
    else return false;
    const next = tabs[nextIndex];
    next.focus();
    next.click();
    return true;
  }

  function boot() {
    syncSortVisibility();
    if (mobileSortMedia) {
      const listener = () => syncSortVisibility();
      if (typeof mobileSortMedia.addEventListener === "function") mobileSortMedia.addEventListener("change", listener);
      else if (typeof mobileSortMedia.addListener === "function") mobileSortMedia.addListener(listener);
    }

    controls.forEach((spec) => {
      const element = document.getElementById(spec.id);
      if (!element) return;
      element.addEventListener(spec.event, () => {
        if (hydrating) return;
        replaceParam(spec.param, typeof element.value === "string" ? element.value.trim() : element.value);
      });
    });

    if (sortSelect) sortSelect.addEventListener("change", () => {
      if (hydrating) return;
      const dir = initialSortDirection(sortSelect.value);
      if (sortDirSelect) sortDirSelect.value = dir;
      driveSort(sortSelect.value, dir);
    });
    if (sortDirSelect) sortDirSelect.addEventListener("change", () => {
      if (hydrating || !sortSelect) return;
      driveSort(sortSelect.value, sortDirSelect.value);
    });
    if (exportButton) exportButton.addEventListener("click", exportTeamsCsv);

    document.addEventListener("click", (event) => {
      const selected = event.target.closest("[data-select-team], [data-viz-team]");
      if (selected) {
        requestAnimationFrame(() => syncSelectionSemantics());
        if (!hydrating) replaceParam("team", selected.getAttribute("data-select-team") || selected.getAttribute("data-viz-team"));
      }

      const sortButton = event.target.closest("[data-sort]");
      if (sortButton && !hydrating) {
        requestAnimationFrame(() => {
          const key = sortButton.dataset.sort;
          const dir = sortButton.dataset.dir || initialSortDirection(key);
          syncSortControls(key, dir);
          writeSortState(key, dir);
        });
      }

      const vizButton = event.target.closest("[data-team-viz]");
      if (vizButton) {
        requestAnimationFrame(() => syncVisualTabs(vizButton));
        if (!hydrating) {
          const value = vizButton.getAttribute("data-team-viz");
          replaceParam("viz", value === defaultViz ? "" : value);
        }
      }

      if (event.target.closest("#teams-reset") && !hydrating) {
        requestAnimationFrame(() => {
          controls.forEach((spec) => replaceParam(spec.param, ""));
          syncSortControls(defaultSort.key, defaultSort.dir);
          replaceParam("sort", "");
          replaceParam("dir", "");
        });
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && searchInput && !event.metaKey && !event.ctrlKey && !event.altKey && !editableTarget(event.target)) {
        event.preventDefault();
        searchInput.focus();
        if (typeof searchInput.select === "function") searchInput.select();
        return;
      }
      if (event.key === "Escape" && searchInput && document.activeElement === searchInput && searchInput.value) {
        event.preventDefault();
        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        replaceParam("q", "");
        return;
      }
      const tab = event.target.closest("[data-team-viz]");
      if (tab && moveVisualTab(tab, event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      const point = event.target.closest("[data-viz-team]");
      if (!point) return;
      event.preventDefault();
      point.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const observer = new MutationObserver(() => {
      decorateVizPoints();
      syncSelectionSemantics();
      hydrate();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    decorateVizPoints();
    syncSelectionSemantics();
    hydrate();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}());
