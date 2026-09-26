export type FillableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const TEXT_INPUT_TYPES = new Set(["", "text", "email", "tel", "url", "number", "month", "date"]);

/** Every element under `root`, descending into open shadow roots, in document order. */
function* walk(root: ParentNode): Generator<Element> {
  for (const element of root.querySelectorAll("*")) {
    yield element;
    if (element.shadowRoot) {
      yield* walk(element.shadowRoot);
    }
  }
}

function isHidden(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  for (let node: Element | null = element; node; node = parentElementAcrossShadow(node)) {
    if (node instanceof HTMLElement && node.hidden) return true;
    if (node.getAttribute("aria-hidden") === "true" && node !== element) return true;
    const style = view?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden")) return true;
  }
  return false;
}

export function parentElementAcrossShadow(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function isExcludedInput(element: HTMLInputElement): boolean {
  const type = (element.getAttribute("type") ?? "").toLowerCase();
  if (type !== "checkbox" && !TEXT_INPUT_TYPES.has(type)) return true;
  const autocomplete = (element.getAttribute("autocomplete") ?? "").toLowerCase();
  if (autocomplete.includes("cc-") || autocomplete.includes("password") || autocomplete.includes("one-time-code")) {
    return true;
  }
  return false;
}

function isFillable(element: Element): element is FillableElement {
  if (element instanceof HTMLInputElement) {
    if (element.disabled || element.readOnly || isExcludedInput(element)) return false;
  } else if (element instanceof HTMLTextAreaElement) {
    if (element.disabled || element.readOnly) return false;
  } else if (element instanceof HTMLSelectElement) {
    if (element.disabled) return false;
  } else {
    return false;
  }
  return !isHidden(element);
}

export function findFillableElements(root: ParentNode = document): FillableElement[] {
  const found: FillableElement[] = [];
  for (const element of walk(root)) {
    if (isFillable(element)) {
      found.push(element);
    }
  }
  return found;
}
