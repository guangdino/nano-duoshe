export type Section = {
  title: string;
  body: string;
  candidateId?: string;
  lineStart: number;
};

const FOOTER_RE = /<!--\s*duoshe:\s*(cand_[a-z0-9]+)/i;

export function splitMarkdownSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];

  let currentTitle: string | null = null;
  let currentLineStart = 0;
  let bufferStart = 0;
  const buf: string[] = [];

  const flush = (): void => {
    const body = buf.join("\n").trim();
    if (currentTitle === null) {
      if (body.length > 0) {
        sections.push({ title: extractH1(buf) ?? "(intro)", body, lineStart: bufferStart });
      }
    } else if (body.length > 0 || currentTitle.length > 0) {
      const sec: Section = { title: currentTitle, body, lineStart: currentLineStart };
      const footer = body.match(FOOTER_RE);
      if (footer?.[1]) sec.candidateId = footer[1];
      sections.push(sec);
    }
    buf.length = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2?.[1]) {
      flush();
      currentTitle = h2[1].trim();
      currentLineStart = i;
      bufferStart = i + 1;
      continue;
    }
    buf.push(line);
  }
  flush();

  return sections;
}

function extractH1(buf: string[]): string | null {
  for (const line of buf) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  );
}
