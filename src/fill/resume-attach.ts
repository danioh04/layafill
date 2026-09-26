import { buildContext, collectHeadings } from "../scan/context";
import { findFileInputs } from "../scan/scanner";
import { normalize } from "../scan/text";

const RESUME = /\b(resume|cv|curriculum vitae)\b/;
const NOT_RESUME = /\b(cover|transcript|portfolio|writing sample|additional|other|supporting)\b/;

/** Whether an upload field asks for the resume (and not a cover letter, transcript, ...). */
function isResumeInput(input: HTMLInputElement, headings: Element[]): boolean {
  const ctx = buildContext(input, "", headings);
  const text = normalize(
    [ctx.label, ctx.ariaLabel, ctx.nearbyText, ctx.placeholder, ctx.name, ctx.id, ctx.automationId].join(" "),
  );
  return RESUME.test(text) && !NOT_RESUME.test(text);
}

/** Put `file` into an upload field and fire the events a real file pick fires. */
function attachFile(input: HTMLInputElement, file: File): boolean {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input.files?.length === 1;
}

/** Empty resume upload fields under `root`. */
export function findResumeInputs(root: ParentNode): HTMLInputElement[] {
  const headings = collectHeadings(root);
  return findFileInputs(root).filter((input) => !input.files?.length && isResumeInput(input, headings));
}

/** Attach the resume to the given upload fields. */
export function attachResume(inputs: HTMLInputElement[], file: File): boolean {
  let attached = false;
  for (const input of inputs) {
    attached = attachFile(input, file) || attached;
  }
  return attached;
}
