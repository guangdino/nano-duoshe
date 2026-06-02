import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Candidate, CandidateInput, CandidateStatus } from "../types.js";
import { vaultPathsFor } from "../vault/paths.js";
import { newCandidateId } from "./id.js";
import { defaultTargetFor, titleFromContent } from "./target.js";

function ensureFile(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "", "utf8");
  }
}

function appendJsonl(path: string, record: Candidate): void {
  ensureFile(path);
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

function readJsonl(path: string): Candidate[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  if (raw.trim().length === 0) return [];
  const lines = raw.split("\n");
  const out: Candidate[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as Candidate);
    } catch {}
  }
  return out;
}

export class CandidateStore {
  private readonly pendingPath: string;
  private readonly acceptedPath: string;
  private readonly rejectedPath: string;

  constructor(projectRoot: string) {
    const p = vaultPathsFor(projectRoot);
    this.pendingPath = p.candidatesPending;
    this.acceptedPath = p.candidatesAccepted;
    this.rejectedPath = p.candidatesRejected;
  }

  add(input: CandidateInput): Candidate {
    const now = new Date().toISOString();
    const target = input.target ?? defaultTargetFor(input.type);
    const title = input.title ?? titleFromContent(input.content);

    const candidate: Candidate = {
      id: newCandidateId(),
      type: input.type,
      title,
      content: input.content,
      target,
      status: "pending",
      scope: "project",
      createdAt: now,
    };
    if (input.sourceSessionId !== undefined) candidate.sourceSessionId = input.sourceSessionId;
    if (input.sourceTurnStart !== undefined) candidate.sourceTurnStart = input.sourceTurnStart;
    if (input.sourceTurnEnd !== undefined) candidate.sourceTurnEnd = input.sourceTurnEnd;
    if (input.source !== undefined) candidate.source = input.source;

    appendJsonl(this.pendingPath, candidate);
    return candidate;
  }

  private latestFromLog(path: string): Map<string, Candidate> {
    const all = readJsonl(path);
    const map = new Map<string, Candidate>();
    for (const c of all) {
      map.set(c.id, c);
    }
    return map;
  }

  listByStatus(status: CandidateStatus): Candidate[] {
    const latest = this.latestFromLog(this.pendingPath);
    return [...latest.values()]
      .filter((c) => c.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  findById(id: string): Candidate | undefined {
    const latest = this.latestFromLog(this.pendingPath);
    return latest.get(id);
  }

  markPublished(id: string): Candidate {
    const c = this.findById(id);
    if (!c) throw new Error(`candidate not found: ${id}`);
    if (c.status === "published") return c;
    if (c.status === "rejected") {
      throw new Error(`candidate ${id} was already rejected; cannot publish`);
    }
    const updated: Candidate = { ...c, status: "published", publishedAt: new Date().toISOString() };
    appendJsonl(this.pendingPath, updated);
    appendJsonl(this.acceptedPath, updated);
    return updated;
  }

  markRejected(id: string): Candidate {
    const c = this.findById(id);
    if (!c) throw new Error(`candidate not found: ${id}`);
    if (c.status === "rejected") return c;
    if (c.status === "published") {
      throw new Error(`candidate ${id} was already published; cannot reject`);
    }
    const updated: Candidate = { ...c, status: "rejected", rejectedAt: new Date().toISOString() };
    appendJsonl(this.pendingPath, updated);
    appendJsonl(this.rejectedPath, updated);
    return updated;
  }
}
