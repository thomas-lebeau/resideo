export function toKebabCase(string: string): string {
  return string
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // Insert hyphen between lowercase/digit and uppercase
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2") // Insert hyphen in sequences like "HTTPServer"
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .toLowerCase();
}
