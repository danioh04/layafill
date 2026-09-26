export type FillableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Radio buttons (or checkboxes) sharing a name: one question with one option per input. */
export interface ChoiceGroup {
  kind: "group";
  type: "radio" | "checkbox";
  inputs: HTMLInputElement[];
  /** Lowest element containing every input; used for the question text and the outline. */
  container: HTMLElement;
}

export type FillTarget = { kind: "element"; element: FillableElement } | ChoiceGroup;

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

function inputType(element: HTMLInputElement): string {
  return (element.getAttribute("type") ?? "").toLowerCase();
}

function isExcludedInput(element: HTMLInputElement): boolean {
  const type = inputType(element);
  if (type !== "checkbox" && type !== "radio" && !TEXT_INPUT_TYPES.has(type)) return true;
  const autocomplete = (element.getAttribute("autocomplete") ?? "").toLowerCase();
  return autocomplete.includes("cc-") || autocomplete.includes("password") || autocomplete.includes("one-time-code");
}

/** Styled radios/checkboxes often hide the native input and show only its label. */
function isVisibleChoice(element: HTMLInputElement): boolean {
  if (!isHidden(element)) return true;
  const label = element.labels?.[0];
  return label !== undefined && !isHidden(label);
}

function isFillable(element: Element): element is FillableElement {
  if (element instanceof HTMLInputElement) {
    if (element.disabled || element.readOnly || isExcludedInput(element)) return false;
    const type = inputType(element);
    if (type === "radio" || type === "checkbox") return isVisibleChoice(element);
  } else if (element instanceof HTMLTextAreaElement) {
    if (element.disabled || element.readOnly) return false;
  } else if (element instanceof HTMLSelectElement) {
    if (element.disabled) return false;
  } else {
    return false;
  }
  return !isHidden(element);
}

function commonAncestor(elements: Element[]): HTMLElement {
  let candidate: Element | null = elements[0].parentElement;
  while (candidate && !elements.every((element) => candidate!.contains(element))) {
    candidate = candidate.parentElement;
  }
  return (candidate ?? elements[0].ownerDocument.body) as HTMLElement;
}

function groupKey(input: HTMLInputElement): string | null {
  const name = input.getAttribute("name");
  if (!name) return null;
  const scope = input.form ? `form${Array.from(input.ownerDocument.forms).indexOf(input.form)}` : "doc";
  return `${inputType(input)}:${scope}:${name}`;
}

/**
 * Every fillable field under `root` in document order. Radios sharing a name form one
 * group; checkboxes sharing a name form a group when there are at least two of them.
 */
export function findFillTargets(root: ParentNode = document): FillTarget[] {
  const elements: FillableElement[] = [];
  for (const element of walk(root)) {
    if (isFillable(element)) elements.push(element);
  }

  const members = new Map<string, HTMLInputElement[]>();
  for (const element of elements) {
    if (!(element instanceof HTMLInputElement)) continue;
    const key = inputType(element) === "radio" || inputType(element) === "checkbox" ? groupKey(element) : null;
    if (key) members.set(key, [...(members.get(key) ?? []), element]);
  }

  const targets: FillTarget[] = [];
  const emitted = new Set<string>();
  for (const element of elements) {
    const type = element instanceof HTMLInputElement ? inputType(element) : "";
    const key = element instanceof HTMLInputElement && (type === "radio" || type === "checkbox") ? groupKey(element) : null;
    const group = key ? members.get(key)! : null;

    if (type === "radio" && (!group || group.length < 2)) continue; // a lone radio is not a question
    if (group && group.length >= 2) {
      if (emitted.has(key!)) continue;
      emitted.add(key!);
      targets.push({ kind: "group", type: type as "radio" | "checkbox", inputs: group, container: commonAncestor(group) });
      continue;
    }
    targets.push({ kind: "element", element });
  }
  return targets;
}

/** File inputs, including hidden ones: upload widgets usually hide the input behind a button. */
export function findFileInputs(root: ParentNode = document): HTMLInputElement[] {
  const inputs: HTMLInputElement[] = [];
  for (const element of walk(root)) {
    if (element instanceof HTMLInputElement && inputType(element) === "file" && !element.disabled) {
      inputs.push(element);
    }
  }
  return inputs;
}

/** The element that represents a target for outlines and focus. */
export function targetElement(target: FillTarget): HTMLElement {
  return target.kind === "element" ? target.element : target.container;
}
