type PlainRecord = Record<string, unknown>;

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is PlainRecord {
  return value !== null && typeof value === "object" && value.constructor === Object;
}

export function transformKeysToCamelCase<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) {
    return value as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformKeysToCamelCase(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce<PlainRecord>((transformed, [key, nestedValue]) => {
      transformed[snakeToCamel(key)] = transformKeysToCamelCase(nestedValue);
      return transformed;
    }, {}) as T;
  }

  return value as T;
}

export function transformKeysToSnakeCase<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) {
    return value as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => transformKeysToSnakeCase(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce<PlainRecord>((transformed, [key, nestedValue]) => {
      transformed[camelToSnake(key)] = transformKeysToSnakeCase(nestedValue);
      return transformed;
    }, {}) as T;
  }

  return value as T;
}
