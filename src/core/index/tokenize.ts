const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/;
const CJK_RUN_RE = /[㐀-䶿一-鿿豈-﫿]+/g;

export function hasCjk(s: string): boolean {
  return CJK_RE.test(s);
}

function bigramsOf(run: string): string[] {
  if (run.length === 0) return [];
  if (run.length === 1) return [run];
  const out: string[] = [];
  for (let i = 0; i < run.length - 1; i++) {
    out.push(run.slice(i, i + 2));
  }
  return out;
}

export function bigramize(text: string): string {
  if (!hasCjk(text)) return text;
  // Wrap CJK bigrams in spaces so they don't fuse with adjacent ASCII/digits.
  // Without this, "for循环用range" tokenizes as ["for循环", "环用range"], so
  // a user searching for "for" / "range" / "循环" alone gets zero hits.
  return text
    .replace(CJK_RUN_RE, (run) => ` ${bigramsOf(run).join(" ")} `)
    .replace(/\s+/g, " ")
    .trim();
}
