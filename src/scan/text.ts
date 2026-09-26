/** Dropdown options that are prompts, not answers: "Select...", "-- Please choose --", "". */
const PLACEHOLDER_OPTION = /^[-—\s]*(select|choose|please select|please choose|pick|none selected)\b|^[-—\s]*$/i;

export function isPlaceholderOption(text: string): boolean {
  return PLACEHOLDER_OPTION.test(text.trim());
}

/** Collapse whitespace and drop required-field markers. */
export function cleanText(text: string | null | undefined, max = 200): string {
  if (!text) return "";
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\(\s*(required|optional)\s*\)/gi, "")
    .replace(/[*✱]+/g, "")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

/**
 * Lowercase words for rule matching: splits camelCase, snake_case, brackets and
 * letter/digit boundaries. "job_application[firstName]" -> "job application first name".
 */
export function normalize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // "Résumé" -> "Resume"
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Text content of a node without the text of form controls inside it (e.g. select options). */
export function textWithoutControls(node: Element): string {
  if (!node.querySelector("input, select, textarea, option, script, style")) {
    return node.textContent ?? "";
  }
  const clone = node.cloneNode(true) as Element;
  for (const control of clone.querySelectorAll("input, select, textarea, option, script, style")) {
    control.remove();
  }
  return clone.textContent ?? "";
}
