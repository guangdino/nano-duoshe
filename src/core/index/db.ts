import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database, { type Database as DB } from "better-sqlite3";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

export type IndexDb = DB;

export function openDb(dbPath: string): IndexDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(SCHEMA_SQL);

  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(
      String(SCHEMA_VERSION),
    );
  }

  return db;
}

export function closeDb(db: IndexDb): void {
  try {
    db.close();
  } catch {}
}
