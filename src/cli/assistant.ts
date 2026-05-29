import { existsSync } from "node:fs";
import kleur from "kleur";
import { CandidateStore } from "../core/candidate/index.js";
import { readConfig } from "../core/vault/config.js";
import { vaultExists, vaultPathsFor } from "../core/vault/index.js";
import type { AssistantMode } from "../core/types.js";
import { log } from "./log.js";

// A nudge is a short, optional follow-up shown after a command completes.
// Each nudge has a minimum mode threshold: it only shows if the current
// assistantMode is at least that talkative.
type NudgeLevel = "normal" | "chatty"; // "quiet" mode suppresses all nudges

type Nudge = {
  level: NudgeLevel;
  lines: string[];
};

function modeAllows(mode: AssistantMode, level: NudgeLevel): boolean {
  if (mode === "quiet") return false;
  if (mode === "chatty") return true;
  return level === "normal"; // "normal" mode only shows normal-level nudges
}

function printNudge(nudge: Nudge): void {
  log.blank();
  for (const line of nudge.lines) {
    log.raw(kleur.gray(`  💬 ${line}`));
  }
}

// ─── Context helpers ──────────────────────────────────────────────────────────

function getPendingCount(root: string): number {
  try {
    const store = new CandidateStore(root);
    return store.listByStatus("pending").length;
  } catch {
    return 0;
  }
}

function guideCompleted(root: string): boolean {
  const paths = vaultPathsFor(root);
  const cfg = readConfig(paths.config);
  return cfg?.guideCompletedAt !== undefined;
}

function getMode(root: string): AssistantMode {
  const paths = vaultPathsFor(root);
  const cfg = readConfig(paths.config);
  return cfg?.assistantMode ?? "normal";
}

// ─── Nudge library ────────────────────────────────────────────────────────────

// (nudgeAfterInit was removed — the main init output already strongly steers
// the user to `duoshe guide`, so a follow-up nudge was just duplicate noise.)

// Called after `duoshe guide` completes
export function nudgeAfterGuide(root: string): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);
  const pending = getPendingCount(root);

  if (pending > 0) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        `你有 ${pending} 条记录等待确认。`,
        `运行 ${kleur.cyan("duoshe review")} 确认后就会永久保存。`,
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  // chatty: encourage user to add their first memory
  const nudge: Nudge = {
    level: "chatty",
    lines: [
      "很好！现在可以开始记录了。",
      `想到什么重要的事，就用 ${kleur.cyan('duoshe remember "..."')} 记下来。`,
    ],
  };
  if (modeAllows(mode, nudge.level)) printNudge(nudge);
}

// Called after `duoshe remember` adds a candidate
export function nudgeAfterRemember(root: string, contentLength: number): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);
  const pending = getPendingCount(root);

  // Content too short — worth surfacing even in normal mode
  if (contentLength < 20) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        "这条记录有点短，AI 可能看不太懂。",
        "要不要重新记一条，说得更完整一点？",
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  // Pending piling up — remind at thresholds 3, 5, 10
  if (pending >= 5) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        `你已经有 ${pending} 条记录等着确认了。`,
        `运行 ${kleur.cyan("duoshe review")} 确认一下，免得忘了。`,
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  if (pending === 3) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        `现在有 3 条待确认的记录了。`,
        `要不要现在 ${kleur.cyan("duoshe review")} 看一眼？`,
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  // chatty: simple encouragement
  const nudge: Nudge = {
    level: "chatty",
    lines: [
      `已记录！运行 ${kleur.cyan("duoshe review")} 确认后会永久保存。`,
    ],
  };
  if (modeAllows(mode, nudge.level)) printNudge(nudge);
}

// Called after `duoshe publish` succeeds
export function nudgeAfterPublish(root: string): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);
  const pending = getPendingCount(root);

  if (pending > 0) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        `还有 ${pending} 条记录等待确认。`,
        `继续运行 ${kleur.cyan("duoshe review")} 处理吧。`,
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  // All done
  const nudge: Nudge = {
    level: "chatty",
    lines: ["没有待确认的记录了，很整齐。"],
  };
  if (modeAllows(mode, nudge.level)) printNudge(nudge);
}

// Called after `duoshe review` when there are no pending candidates
export function nudgeAfterReviewEmpty(root: string): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);

  const guideRan = guideCompleted(root);
  if (!guideRan) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        "你还没有填过项目问卷。",
        `运行 ${kleur.cyan("duoshe guide")} 只需要 3 分钟，能让 AI 更好地认识这个项目。`,
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  const nudge: Nudge = {
    level: "chatty",
    lines: [
      "目前没有待确认的记录。",
      `想到什么重要的事，随时 ${kleur.cyan('duoshe remember "..."')} 记下来。`,
    ],
  };
  if (modeAllows(mode, nudge.level)) printNudge(nudge);
}

// Called after `duoshe search` returns no results
export function nudgeAfterSearchEmpty(root: string, query: string): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);
  const pending = getPendingCount(root);

  // If they have pending items, maybe what they're looking for isn't confirmed yet
  if (pending > 0) {
    const nudge: Nudge = {
      level: "normal",
      lines: [
        `没找到"${query}"，但你有 ${pending} 条记录还没确认。`,
        `也许在里面？运行 ${kleur.cyan("duoshe review")} 看看。`,
      ],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
    return;
  }

  const nudge: Nudge = {
    level: "chatty",
    lines: [
      `没找到"${query}"。`,
      `如果这是重要的事，用 ${kleur.cyan(`duoshe remember "${query}"`)} 记下来吧。`,
    ],
  };
  if (modeAllows(mode, nudge.level)) printNudge(nudge);
}

// Called after `duoshe reject`
export function nudgeAfterReject(root: string): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);
  const pending = getPendingCount(root);

  if (pending > 0) {
    const nudge: Nudge = {
      level: "normal",
      lines: [`还有 ${pending} 条记录等待确认，继续运行 ${kleur.cyan("duoshe review")} 吧。`],
    };
    if (modeAllows(mode, nudge.level)) printNudge(nudge);
  }
}

// Shown when user runs any command but guide hasn't been done yet (first-run check)
export function nudgeGuideNotDone(root: string): void {
  if (!vaultExists(root)) return;
  const mode = getMode(root);
  if (guideCompleted(root)) return;

  const nudge: Nudge = {
    level: "normal",
    lines: [
      "还没有填过项目问卷，AI 对这个项目了解得还很少。",
      `运行 ${kleur.cyan("duoshe guide")} 只需要 3 分钟。`,
    ],
  };
  if (modeAllows(mode, nudge.level)) printNudge(nudge);
}
