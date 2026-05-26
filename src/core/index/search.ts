import { existsSync } from "node:fs";
import { vaultPathsFor } from "../vault/paths.js";
import { closeDb, openDb } from "./db.js";
import { bigramize, hasCjk } from "./tokenize.js";

export type SearchHit = {
  id: string;
  path: string;
  type: string;
  title: string;
  snippet: string;
  candidateId?: string;
  score: number;
};

const FTS_RESERVED = /[":()*^]/g;

function sanitizeQuery(raw: string): string {
  const transformed = bigramize(raw);
  const cleaned = transformed.replace(FTS_RESERVED, " ").trim();
  if (cleaned.length === 0) return "";

  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^[+\-]+/, ""))
    .filter((t) => t.length > 0)
    .filter((t) => !/^(AND|OR|NOT|NEAR)$/i.test(t));

  if (tokens.length === 0) return "";

  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

function buildSnippet(content: string, rawQuery: string, max = 160): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length === 0) return "";

  const needle = rawQuery.trim();
  let pivot = 0;
  if (needle.length > 0) {
    const idx = oneLine.toLowerCase().indexOf(needle.toLowerCase());
    if (idx >= 0) {
      pivot = idx;
    } else if (hasCjk(needle) && needle.length >= 2) {
      const firstBigram = needle.slice(0, 2).toLowerCase();
      const idx2 = oneLine.toLowerCase().indexOf(firstBigram);
      if (idx2 >= 0) pivot = idx2;
    }
  }

  const half = Math.floor(max / 2);
  const start = Math.max(0, pivot - half);
  const end = Math.min(oneLine.length, start + max);
  let out = oneLine.slice(start, end);
  if (start > 0) out = `…${out}`;
  if (end < oneLine.length) out = `${out}…`;

  if (needle.length > 0) {
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, (m) => `«${m}»`);
  }
  return out;
}

export type SearchOptions = {
  limit?: number;
  type?: string;
};

export function search(projectRoot: string, rawQuery: string, opts: SearchOptions = {}): SearchHit[] {
  const paths = vaultPathsFor(projectRoot);
  if (!existsSync(paths.indexDb)) {
    return [];
  }

  const ftsQuery = sanitizeQuery(rawQuery);
  if (ftsQuery.length === 0) return [];

  const limit = Math.max(1, Math.min(opts.limit ?? 8, 100));
  const db = openDb(paths.indexDb);
  try {
    const typeFilter = opts.type ? "AND documents_fts.type = ?" : "";
    const params: unknown[] = [ftsQuery];
    if (opts.type) params.push(opts.type);
    params.push(limit);

    const rows = db
      .prepare(
        `SELECT
           documents.id AS id,
           documents.title AS title,
           documents.path AS path,
           documents.type AS type,
           documents.content AS content,
           documents.candidate_id AS candidate_id,
           bm25(documents_fts) AS score
         FROM documents_fts
         JOIN documents
           ON documents.path = documents_fts.path
          AND documents.title = documents_fts.title_raw
         WHERE documents_fts MATCH ?
         ${typeFilter}
         ORDER BY score
         LIMIT ?`,
      )
      .all(...params) as {
        id: string;
        title: string;
        path: string;
        type: string;
        content: string;
        candidate_id: string | null;
        score: number;
      }[];

    return rows.map((r) => {
      const hit: SearchHit = {
        id: r.id,
        path: r.path,
        type: r.type,
        title: r.title,
        snippet: buildSnippet(r.content, rawQuery),
        score: r.score,
      };
      if (r.candidate_id) hit.candidateId = r.candidate_id;
      return hit;
    });
  } finally {
    closeDb(db);
  }
}
