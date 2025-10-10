export function capitalize(string: string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function toKebabCase(string: string): string {
  return string.trim().replace(/\s+/g, "-").toLowerCase();
}

export function toLowerCamelCase(string: string): string {
  return string.trim().replace(/\s+/g, "_").toLowerCase();
}
