import kleur from "kleur";

export const log = {
  step(msg: string): void {
    process.stdout.write(`${kleur.cyan("==>")} ${kleur.bold(msg)}\n`);
  },
  ok(msg: string): void {
    process.stdout.write(`    ${kleur.green("✓")} ${msg}\n`);
  },
  info(msg: string): void {
    process.stdout.write(`    ${kleur.gray("·")} ${msg}\n`);
  },
  warn(msg: string): void {
    process.stderr.write(`    ${kleur.yellow("!")} ${msg}\n`);
  },
  err(msg: string): void {
    process.stderr.write(`    ${kleur.red("✗")} ${msg}\n`);
  },
  blank(): void {
    process.stdout.write("\n");
  },
  raw(msg: string): void {
    process.stdout.write(`${msg}\n`);
  },
};
