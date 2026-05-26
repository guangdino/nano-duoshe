import kleur from "kleur";

export function printStub(commandName: string, milestone: string): void {
  process.stderr.write(
    `${kleur.yellow("[stub]")} ${kleur.bold(`duoshe ${commandName}`)} — not implemented yet (planned for ${milestone}).\n`,
  );
  process.stderr.write(
    `       See DESIGN.md §10 for the v0.1 implementation roadmap.\n`,
  );
  process.exit(2);
}
