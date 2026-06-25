export function nowIso(): string {
  return new Date().toISOString();
}

export function generateId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${random}`;
}

export function summarizeText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function sessionTitleFromText(text: string): string {
  return summarizeText(text, 48) || "New Chat";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function splitFirst(value: string): [string, string] {
  const trimmed = value.trim();
  const index = trimmed.search(/\s/);
  if (index === -1) return [trimmed, ""];
  return [trimmed.slice(0, index), trimmed.slice(index).trimStart()];
}

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

export function repeat(value: string, count: number): string {
  return new Array(Math.max(0, count) + 1).join(value);
}

export function truncateVisible(value: string, width: number): string {
  if (width <= 0) return "";
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  if (width <= 3) return plain.slice(0, width);
  return `${plain.slice(0, width - 3)}...`;
}

export function padRightVisible(value: string, width: number): string {
  const length = visibleLength(value);
  if (length >= width) return truncateVisible(value, width);
  return `${value}${repeat(" ", width - length)}`;
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const output: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      output.push("");
      continue;
    }

    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue;
      if (/^\s+$/.test(word)) {
        if (line && !line.endsWith(" ")) line += " ";
        continue;
      }

      if (word.length > width) {
        if (line.trim()) {
          output.push(line.trimEnd());
          line = "";
        }
        for (let i = 0; i < word.length; i += width) {
          output.push(word.slice(i, i + width));
        }
        continue;
      }

      if ((line + word).length > width) {
        output.push(line.trimEnd());
        line = word;
      } else {
        line += word;
      }
    }

    if (line || paragraph === "") output.push(line.trimEnd());
  }

  return output.length > 0 ? output : [""];
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}
