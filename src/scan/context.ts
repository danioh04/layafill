import type { FieldContext, FieldTag } from "../types";
import { parentElementAcrossShadow, type ChoiceGroup, type FillableElement } from "./scanner";
import { cleanText, isPlaceholderOption, textWithoutControls } from "./text";

const HEADING_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "legend",
  "[role=heading]",
  "[class*=section-title i]",
  "[class*=section-header i]",
  "[class*=section-heading i]",
  "[class*=sectionTitle]",
  "[class*=sectionHeader]",
  "[data-automation-id*=Heading]",
].join(",");

const MAX_OPTIONS = 60;
const MAX_ANCESTOR_DEPTH = 10;
const VISIBLE_FIELD = "input:not([type=hidden]), select, textarea";

function byIdInRoot(element: Element, id: string): Element | null {
  const root = element.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? element.ownerDocument.getElementById(id);
}

function getLabel(element: FillableElement): string {
  const labelledBy = labelledByText(element);
  if (labelledBy) return labelledBy;

  const labels = element.labels ? Array.from(element.labels) : [];
  if (labels.length === 0 && element.id) {
    // Labels in a different shadow root than the control are not in `element.labels`.
    const root = element.getRootNode() as Document | ShadowRoot;
    const escaped =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(element.id) : element.id.replace(/["\\]/g, "\\$&");
    const label = root.querySelector?.(`label[for="${escaped}"]`);
    if (label) labels.push(label as HTMLLabelElement);
  }
  return cleanText(labels.map((label) => textWithoutControls(label)).join(" "));
}

/**
 * Text right before the field: preceding siblings in its parent, climbing a few
 * levels while nothing is found (label divs are often cousins, not siblings).
 */
function getNearbyText(element: Element): string {
  let node: Element = element;
  for (let depth = 0; depth < 4; depth += 1) {
    const parent = parentElementAcrossShadow(node);
    if (!parent) break;
    const chunks: string[] = [];
    for (let sibling = node.previousSibling; sibling; sibling = sibling.previousSibling) {
      if (sibling.nodeType === Node.TEXT_NODE) {
        chunks.unshift(sibling.textContent ?? "");
      } else if (sibling instanceof Element) {
        // Stop at the previous field: text before it belongs to that field.
        if (sibling.matches(VISIBLE_FIELD) || sibling.querySelector(VISIBLE_FIELD)) break;
        chunks.unshift(textWithoutControls(sibling));
      }
    }
    const text = cleanText(chunks.join(" "));
    if (text) return text;
    node = parent;
  }
  return "";
}

function precedes(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Nearest heading before the field, or the legend of its fieldset. */
function getSection(element: Element, headings: Element[], useLegend = true): string {
  const fieldset = useLegend ? element.closest("fieldset") : null;
  const legend = fieldset?.querySelector(":scope > legend");
  if (legend) {
    const text = cleanText(textWithoutControls(legend), 120);
    if (text) return text;
  }

  let best: Element | null = null;
  for (const heading of headings) {
    if (heading.contains(element)) continue;
    if (precedes(heading, element)) {
      best = heading;
    } else {
      break;
    }
  }
  return best ? cleanText(textWithoutControls(best), 120) : "";
}

function getGroupHint(element: Element): string {
  const hints: string[] = [];
  let node = parentElementAcrossShadow(element);
  for (let depth = 0; node && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
    const id = node.getAttribute("id");
    const automationId = node.getAttribute("data-automation-id");
    const groupLabel =
      node.matches("fieldset, section, [role=group], [role=region]") ? node.getAttribute("aria-label") : null;
    for (const hint of [automationId, id, groupLabel]) {
      if (hint && !/^[\d\W_]+$/.test(hint) && !hints.includes(hint)) {
        hints.push(hint);
      }
    }
    node = parentElementAcrossShadow(node);
  }
  return cleanText(hints.join(" | "), 300);
}

function getOptions(element: HTMLSelectElement): string[] {
  const options: string[] = [];
  for (const option of Array.from(element.options)) {
    const text = cleanText(option.text, 80);
    if (!text || (isPlaceholderOption(text) && (!option.value || option.index === 0))) continue;
    options.push(text);
    if (options.length >= MAX_OPTIONS) break;
  }
  return options;
}

export function collectHeadings(root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll(HEADING_SELECTOR)).filter(
    (heading) => cleanText(heading.textContent).length > 0,
  );
}

function labelledByText(element: Element): string {
  const ids = element.getAttribute("aria-labelledby");
  if (!ids) return "";
  return cleanText(
    ids
      .split(/\s+/)
      .map((id) => byIdInRoot(element, id))
      .filter((node): node is Element => node !== null)
      .map((node) => textWithoutControls(node))
      .join(" "),
  );
}

/** The question a radio/checkbox group answers: legend, ARIA group label, or the text around the options. */
function getGroupQuestion(group: ChoiceGroup, optionLabels: string[]): string {
  const { container } = group;
  const fieldset = container.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend");
  if (legend && group.inputs.every((input) => fieldset!.contains(input))) {
    const text = cleanText(textWithoutControls(legend));
    if (text) return text;
  }

  const ariaGroup = container.closest("[role=radiogroup], [role=group]");
  if (ariaGroup) {
    const text = labelledByText(ariaGroup) || cleanText(ariaGroup.getAttribute("aria-label"));
    if (text) return text;
  }

  // "<div><p>Question?</p><label><input> Yes</label>…</div>": the container's text minus the options.
  let text = textWithoutControls(container).replace(/\s+/g, " ");
  for (const option of optionLabels) {
    if (option) text = text.replace(option, " ");
  }
  const remaining = cleanText(text);
  if (remaining && remaining.length <= 300) return remaining;
  return getNearbyText(container);
}

export function buildGroupContext(group: ChoiceGroup, fieldId: string, headings: Element[]): FieldContext {
  const first = group.inputs[0];
  const optionLabels = group.inputs.map((input) => getLabel(input) || cleanText(input.value, 80));
  const context: FieldContext = { fieldId, tag: "group", inputType: group.type, options: optionLabels };
  const name = first.getAttribute("name");
  if (name) context.name = name;
  const question = getGroupQuestion(group, optionLabels);
  if (question) context.label = question;
  const section = getSection(group.container, headings, false);
  if (section) context.section = section;
  const hint = getGroupHint(group.container);
  if (hint) context.groupHint = hint;
  return context;
}

export function buildContext(element: FillableElement, fieldId: string, headings: Element[]): FieldContext {
  const tag = element.tagName.toLowerCase() as FieldTag;
  const context: FieldContext = { fieldId, tag };

  const set = <K extends keyof FieldContext>(key: K, value: FieldContext[K] | null | undefined | "") => {
    if (value !== null && value !== undefined && value !== "") {
      context[key] = value;
    }
  };

  if (element instanceof HTMLInputElement) {
    set("inputType", (element.getAttribute("type") ?? "text").toLowerCase() || "text");
  }
  set("name", element.getAttribute("name"));
  set("id", element.getAttribute("id"));
  set("placeholder", cleanText(element.getAttribute("placeholder")));
  set("autocomplete", element.getAttribute("autocomplete")?.toLowerCase().trim());
  set("ariaLabel", cleanText(element.getAttribute("aria-label")));
  set("automationId", element.getAttribute("data-automation-id"));
  set("label", getLabel(element));
  set("nearbyText", getNearbyText(element));
  set("section", getSection(element, headings));
  set("groupHint", getGroupHint(element));
  if (element instanceof HTMLSelectElement) {
    set("options", getOptions(element));
  }
  if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.maxLength > 0) {
    context.maxLength = element.maxLength;
  }
  return context;
}
