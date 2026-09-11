import { CHALLENGE_TYPES } from "../../../../packages/types/index";

/** Keep static rows, live additions, URL history and both navigation surfaces in sync. */
export function initFeedFilters() {
  const input = document.querySelector<HTMLInputElement>("#challenge-search")!;
  const search = document.querySelector<HTMLFormElement>("#feed-search")!;
  const toggle = document.querySelector<HTMLButtonElement>(".search-toggle")!;
  const empty = document.querySelector<HTMLElement>("[data-empty-index]")!;
  const status = document.querySelector<HTMLElement>("[data-feed-status]")!;
  const base = location.pathname.replace(/\/$/, "") || "/";
  function apply() {
    const params = new URLSearchParams(location.search);
    const raw = params.get("type") ?? "";
    const type = (CHALLENGE_TYPES as readonly string[]).includes(raw)
      ? raw
      : "";
    const query = (params.get("q") ?? "").trim().toLowerCase();
    input.value = params.get("q") ?? "";
    if (query) {
      search.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    }
    let count = 0;
    document.querySelectorAll<HTMLElement>("[data-feed-row]").forEach((row) => {
      row.hidden = !!(
        (type && row.dataset.type !== type) ||
        (query && !row.dataset.search?.includes(query))
      );
      if (!row.hidden) count++;
    });
    document.querySelectorAll<SVGElement>("[data-feed-pin]").forEach(pin => {
      const hidden = !!((type && pin.dataset.type !== type) || (query && !pin.dataset.search?.includes(query)));
      pin.style.display = hidden ? "none" : "";
    });
    empty.hidden = count > 0;
    status.textContent =
      type || query
        ? `${count} ${count === 1 ? "Challenge" : "Challenges"}${type ? ` · ${type}` : ""}${query ? ` matching “${params.get("q")}”` : ""}`
        : "";
    document
      .querySelectorAll<HTMLElement>("[data-type-filter]")
      .forEach((link) => {
        if (link.dataset.typeFilter === type)
          link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    window.dispatchEvent(new Event('feed-filtered'));
  }
  document.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-type-filter],.discovery-link",
    );
    if (
      !link ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const url = new URL(link.href);
    if ((url.pathname.replace(/\/$/, "") || "/") !== base || url.origin !== location.origin) return;
    event.preventDefault();
    const query = input.value.trim();
    if (query) url.searchParams.set("q", query);
    history.pushState({}, "", url);
    apply();
  });
  toggle.addEventListener("click", () => {
    search.hidden = !search.hidden;
    toggle.setAttribute("aria-expanded", String(!search.hidden));
    if (!search.hidden) input.focus();
  });
  function updateSearch(value: string) {
    const url = new URL(location.href);
    if (value) url.searchParams.set("q", value);
    else url.searchParams.delete("q");
    history.replaceState({}, "", url);
    apply();
  }
  search.addEventListener("submit", (event) => event.preventDefault());
  input.addEventListener("input", () => updateSearch(input.value));
  search.addEventListener("reset", (event) => {
    event.preventDefault();
    updateSearch("");
    input.focus();
  });
  window.addEventListener("popstate", apply);
  window.addEventListener("feed-updated", apply);
  apply();
}
