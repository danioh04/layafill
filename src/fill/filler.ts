import type { FillableElement } from "../scan/scanner";
import { isPlaceholderOption } from "../scan/text";

/** Whether the field currently holds no user-visible value. */
export function isEmpty(element: FillableElement): boolean {
  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions[0];
    if (!selected || selected.value === "") return true;
    return element.selectedIndex === 0 && isPlaceholderOption(selected.text);
  }
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    return !element.checked;
  }
  return element.value.trim() === "";
}

/** Assign through the prototype setter so React/Vue value trackers see the change. */
function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
}

function dispatchChange(element: Element): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur"));
}

export function fillText(element: HTMLInputElement | HTMLTextAreaElement, text: string): boolean {
  if (element.disabled || element.readOnly) return false;
  const value = element.maxLength > 0 ? text.slice(0, element.maxLength) : text;
  setNativeValue(element, value);
  dispatchChange(element);
  return element.value === value;
}

export function fillSelect(element: HTMLSelectElement, index: number): boolean {
  const option = element.options[index];
  if (element.disabled || !option || option.disabled) return false;
  setNativeValue(element, option.value);
  if (element.selectedIndex !== index) {
    element.selectedIndex = index;
  }
  dispatchChange(element);
  return element.selectedIndex === index;
}

/** Typeahead inputs (React-Select, Workday prompts) that only accept a value picked from their list. */
export function isCombobox(element: Element): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) return false;
  const autocomplete = element.getAttribute("aria-autocomplete");
  return (
    element.getAttribute("role") === "combobox" ||
    autocomplete === "list" ||
    autocomplete === "both" ||
    element.getAttribute("aria-haspopup") === "listbox"
  );
}

const COMBOBOX_WAIT_MS = 2000;
const COMBOBOX_POLL_MS = 100;

function visibleOptions(input: HTMLInputElement): HTMLElement[] {
  const doc = input.ownerDocument;
  const ids = [input.getAttribute("aria-controls"), input.getAttribute("aria-owns")].filter(Boolean) as string[];
  const lists = ids.map((id) => doc.getElementById(id)).filter((el): el is HTMLElement => el !== null);
  const scope: ParentNode[] = lists.length > 0 ? lists : [doc];
  return scope
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('[role="option"]')))
    .filter((option) => option.getAttribute("aria-disabled") !== "true" && !option.hidden);
}

function pick(option: HTMLElement): void {
  const init = { bubbles: true, cancelable: true };
  option.dispatchEvent(new MouseEvent("mousedown", init));
  option.dispatchEvent(new MouseEvent("mouseup", init));
  option.click();
}

/**
 * Type into a combobox, wait for its list, and click the option `choose` picks.
 * Clears the text again when nothing matches so no half-entered value is left.
 */
export async function fillCombobox(
  input: HTMLInputElement,
  text: string,
  choose: (options: string[]) => number | null,
): Promise<boolean> {
  if (input.disabled || input.readOnly) return false;
  input.focus();
  setNativeValue(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));

  for (let waited = 0; waited <= COMBOBOX_WAIT_MS; waited += COMBOBOX_POLL_MS) {
    const options = visibleOptions(input);
    if (options.length > 0) {
      const index = choose(options.map((option) => (option.textContent ?? "").replace(/\s+/g, " ").trim()));
      if (index !== null && options[index]) {
        pick(options[index]);
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, COMBOBOX_POLL_MS));
  }

  setNativeValue(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  input.blur();
  return false;
}

export function fillCheckbox(element: HTMLInputElement, checked: boolean): boolean {
  if (element.disabled) return false;
  if (element.checked !== checked) {
    // click() runs the page's own handlers the same way a user click does.
    element.click();
  }
  return element.checked === checked;
}
