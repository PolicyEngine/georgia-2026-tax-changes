/**
 * Parse CSV text into an array of objects.
 *
 * - First row = headers
 * - Numeric strings auto-converted to numbers
 * - Trims whitespace from headers and values
 */
export default function parseCSV(text: string): Record<string, string | number>[] {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const obj: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const v = values[i];
      const trimmed = (v || "").trim();
      obj[h.trim()] =
        trimmed !== "" && !isNaN(Number(trimmed))
          ? parseFloat(trimmed)
          : trimmed;
    });
    return obj;
  });
}
