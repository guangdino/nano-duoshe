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
  return text.replace(CJK_RUN_RE, (run) => bigramsOf(run).join(" "));
}
