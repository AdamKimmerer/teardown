// The document's title: its first level-one heading, or null if it has none.
export function documentTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+?)\s*#*\s*$/m);
  return match?.[1] ? match[1].trim() : null;
}
