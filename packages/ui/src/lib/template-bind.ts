function normalizeBoundValue(value: unknown): string | null {
  if (value === null || value === undefined || value === false) {
    return null;
  }

  if (value === true) {
    return '';
  }

  return String(value);
}

export function bindTemplateFragment(
  fragment: DocumentFragment,
  data: Record<string, unknown>,
): void {
  const elements = fragment.querySelectorAll<HTMLElement>('*');

  for (const element of elements) {
    const textField = element.getAttribute('data-field');
    if (textField) {
      const value = data[textField];
      element.textContent = value === null || value === undefined ? '' : String(value);
    }

    for (const attrName of element.getAttributeNames()) {
      if (attrName === 'data-field' || !attrName.startsWith('data-field-')) {
        continue;
      }

      const targetAttr = attrName.slice('data-field-'.length);
      if (!targetAttr) {
        continue;
      }

      const fieldName = element.getAttribute(attrName);
      if (!fieldName) {
        continue;
      }

      const boundValue = normalizeBoundValue(data[fieldName]);
      if (boundValue === null) {
        element.removeAttribute(targetAttr);
      } else {
        element.setAttribute(targetAttr, boundValue);
      }
    }
  }
}

export function createBoundTemplate(
  template: HTMLTemplateElement,
  data: Record<string, unknown>,
): DocumentFragment {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  bindTemplateFragment(fragment, data);
  return fragment;
}
