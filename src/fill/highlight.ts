export type HighlightKind = "rule" | "laya" | "review";

const COLORS: Record<HighlightKind, string> = {
  rule: "#16a34a",
  laya: "#2563eb",
  review: "#f59e0b",
};

const FILL_HIGHLIGHT_MS = 6000;
const MARK = "data-layafill";

/** Outline a field. Fills fade after a few seconds; "review" stays until the field is focused. */
export function highlight(element: HTMLElement, kind: HighlightKind): void {
  clearHighlight(element);
  const previous = { outline: element.style.outline, outlineOffset: element.style.outlineOffset };
  element.style.outline = `2px solid ${COLORS[kind]}`;
  element.style.outlineOffset = "2px";
  element.setAttribute(MARK, kind);

  const restore = () => {
    if (element.getAttribute(MARK) !== kind) return;
    element.style.outline = previous.outline;
    element.style.outlineOffset = previous.outlineOffset;
    element.removeAttribute(MARK);
  };

  if (kind === "review") {
    element.addEventListener("focus", restore, { once: true });
  } else {
    setTimeout(restore, FILL_HIGHLIGHT_MS);
  }
}

function clearHighlight(element: HTMLElement): void {
  if (element.hasAttribute(MARK)) {
    element.style.outline = "";
    element.style.outlineOffset = "";
    element.removeAttribute(MARK);
  }
}
