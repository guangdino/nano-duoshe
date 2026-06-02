import kleur from "kleur";
import { CandidateStore } from "../core/candidate/index.js";
import { vaultExists } from "../core/vault/index.js";
import { log } from "./log.js";
import { shouldShowAndMark } from "./nudge-throttle.js";

function getPendingCount(root: string): number {
  try {
    const store = new CandidateStore(root);
    return store.listByStatus("pending").length;
  } catch {
    return 0;
  }
}

// Called after `duoshe remember` adds a candidate.
// Shows a one-time short-content warning and a pending-count reminder at
// thresholds 3 and 5+ to nudge the user toward `duoshe review`.
export function nudgeAfterRemember(root: string, contentLength: number): void {
  if (!vaultExists(root)) return;

  if (contentLength < 20 && shouldShowAndMark(root, "short-content")) {
    log.blank();
    log.raw(
      kleur.gray(
        "  💬 这条记录有点短，AI 可能看不太懂。下次试试写得更完整一点（这条提醒今天就到这）。",
      ),
    );
    return;
  }

  const pending = getPendingCount(root);
  if (pending >= 5) {
    log.blank();
    log.raw(
      kleur.gray(
        `  💬 你已经有 ${pending} 条记录等着确认了。运行 ${kleur.cyan("duoshe review")} 确认一下。`,
      ),
    );
  } else if (pending === 3) {
    log.blank();
    log.raw(
      kleur.gray(
        `  💬 现在有 3 条待确认的记录了。要不要现在 ${kleur.cyan("duoshe review")} 看一眼？`,
      ),
    );
  }
}
