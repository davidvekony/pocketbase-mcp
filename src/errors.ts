type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function flattenDataValues(data: UnknownRecord): string[] {
  const messages: string[] = [];

  for (const key in data) {
    const value = data[key];
    if (isObject(value)) {
      messages.push(...flattenErrors(value));
    }
  }

  return messages;
}

function furtherDataMessages(data: unknown): string[] | undefined {
  if (!data) return undefined;

  const messages = flattenDataValues(data as UnknownRecord);
  return messages.length > 0 ? messages : undefined;
}

function withMessage(message: unknown, data: unknown): string[] {
  return [message as string, ...flattenErrors(data || {})];
}

function flattenErrorObject(errors: UnknownRecord): string[] {
  if (errors.message) {
    return withMessage(errors.message, errors.data);
  }

  return furtherDataMessages(errors.data) ?? Object.values(errors).flatMap(flattenErrors);
}

export function flattenErrors(errors: unknown): string[] {
  if (Array.isArray(errors)) {
    return errors.flatMap(flattenErrors);
  }

  if (typeof errors === "string") {
    return [errors];
  }

  return isObject(errors) ? flattenErrorObject(errors) : [];
}

export function pocketbaseErrorMessage(errors: unknown): string {
  const messages = flattenErrors(errors);
  return messages.length > 0 ? messages.join("\n") : "No errors found";
}
