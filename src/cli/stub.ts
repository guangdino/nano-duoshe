import kleur from "kleur";

export function printStub(commandName: string, milestone: string): void {
  process.stdout.write(
    `\n  ${kleur.yellow("🛠")} ${kleur.bold(`duoshe ${commandName}`)} ${kleur.gray(`正在开发中（计划于 ${milestone} 上线）。`)}\n`,
  );
  process.stdout.write(
    `  ${kleur.gray("现在可以用：")}${kleur.cyan("duoshe guide")}${kleur.gray("、")}${kleur.cyan('duoshe remember "..."')}${kleur.gray("、")}${kleur.cyan("duoshe review")}${kleur.gray("。")}\n\n`,
  );
}
