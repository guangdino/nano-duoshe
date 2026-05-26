import { randomBytes } from "node:crypto";

export function newCandidateId(): string {
  const ts = Date.now().toString(36);
  const rand = randomBytes(3).toString("hex");
  return `cand_${ts}${rand}`;
}
