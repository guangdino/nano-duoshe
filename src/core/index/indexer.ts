import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { vaultPathsFor } from "../vault/paths.js";
import { closeDb, openDb, type IndexDb } from "./db.js";
import { slugify, splitMarkdownSections } from "./sections.js";
import { bigramize } from "./tokenize.js";

const FILE_TO_TYPE: Record<string, string> = {
  "PROJECT.md": "project",
  "CODEMAP.md": "code_map",
  "DECISIONS.md": "decision",
  "TROUBLESHOOTING.md": "troubleshooting",
  "MODULES.md": "module",
  "TODO.md": "todo",
};

function indexableFiles(vaultRoot: string): { absPath: string; relPath: string; type: string }[] {
  const out: { absPath: string; relPath: string; type: string }[] = [];

  for (const [fname, type] of Object.entries(FILE_TO_TYPE)) {
    const p = join(vaultRoot, fname);
    if (existsSync(p) && statSync(p).isFile()) {
      out.push({ absPath: p, relPath: fname, type });
    }
  }

  const sessionsDir = join(vaultRoot, "SESSIONS");
  if (existsSync(sessionsDir) && statSync(sessionsDir).isDirectory()) {
    for (const sessionDir of readdirSync(sessionsDir)) {
      const summaryPath = join(sessionsDir, sessionDir, "summary.md");
      if (existsSync(summaryPath) && statSync(summaryPath).isFile()) {
        out.push({
          absPath: summaryPath,
          relPath: relative(vaultRoot, summaryPath).replaceAll("\\", "/"),
          type: "session_summary",
        });
      }
    }
  }

  return out;
}

function upsertDocument(
  db: IndexDb,
  doc: {
    id: string;
    path: string;
    type: string;
    title: string;
    content: string;
    candidateId?: string;
    updatedAt: string;
  },
): void {
  db.prepare("DELETE FROM documents_fts WHERE path = ? AND title_raw = ?").run(doc.path, doc.title);
  db.prepare("DELETE FROM documents WHERE id = ?").run(doc.id);

  db.prepare(
    `INSERT INTO documents (id, path, type, title, content, candidate_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(doc.id, doc.path, doc.type, doc.title, doc.content, doc.candidateId ?? null, doc.updatedAt);

  db.prepare(
    `INSERT INTO documents_fts (title, content, title_raw, path, type, candidate_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    bigramize(doc.title),
    bigramize(doc.content),
    doc.title,
    doc.path,
    doc.type,
    doc.candidateId ?? "",
  );
}

export type IndexResult = {
  filesIndexed: number;
  sectionsIndexed: number;
  durationMs: number;
};

export function reindex(projectRoot: string): IndexResult {
  const start = Date.now();
  const paths = vaultPathsFor(projectRoot);
  if (!existsSync(paths.vault)) {
    throw new Error(`No .duoshe/ found at ${projectRoot}. Run \`duoshe init\` first.`);
  }

  const db = openDb(paths.indexDb);
  let filesIndexed = 0;
  let sectionsIndexed = 0;

  try {
    const tx = db.transaction(() => {
      db.exec("DELETE FROM documents; DELETE FROM documents_fts;");

      const files = indexableFiles(paths.vault);
      for (const f of files) {
        const md = readFileSync(f.absPath, "utf8");
        const sections = splitMarkdownSections(md);
        if (sections.length === 0) continue;

        const fileTitle = basename(f.relPath);
        const updatedAt = new Date(statSync(f.absPath).mtimeMs).toISOString();
        filesIndexed += 1;

        for (const sec of sections) {
          const docId = `${f.relPath}#${slugify(sec.title)}`;
          const fullTitle = sec.title === "(intro)" ? fileTitle : `${fileTitle} › ${sec.title}`;
          upsertDocument(db, {
            id: docId,
            path: f.relPath,
            type: f.type,
            title: fullTitle,
            content: sec.body,
            ...(sec.candidateId !== undefined ? { candidateId: sec.candidateId } : {}),
            updatedAt,
          });
          sectionsIndexed += 1;
        }
      }
    });
    tx();
  } finally {
    closeDb(db);
  }

  return { filesIndexed, sectionsIndexed, durationMs: Date.now() - start };
}
