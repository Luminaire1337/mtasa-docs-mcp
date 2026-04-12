import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { getExtensionPath as getEsmExtensionPath } from "@sqliteai/sqlite-vector";
import { DB_PATH } from "../config/constants.js";

export let db!: Database.Database;

const require = createRequire(import.meta.url);

const resolveVectorExtensionPath = (): string => {
  try {
    const sqliteVector = require("@sqliteai/sqlite-vector") as {
      getExtensionPath?: () => string;
    };

    if (typeof sqliteVector.getExtensionPath === "function") {
      return sqliteVector.getExtensionPath();
    }
  } catch {
    // Fallback to ESM export below.
  }

  return getEsmExtensionPath();
};

const getVectorInstallHelp = (): string => {
  return [
    "SQLite vector extension binary was not found for this platform.",
    "Try reinstalling dependencies without disabling optional deps:",
    "- pnpm install --force",
    "- npm install --force",
    "- bun install",
  ].join("\n");
};

export const initializeDatabase = (): void => {
  // Ensure directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize SQLite database
  db = new Database(DB_PATH);

  // Load vector extension using upstream resolver
  try {
    db.loadExtension(resolveVectorExtensionPath());
  } catch (error) {
    throw new Error(
      [
        `Failed to load SQLite vector extension: ${String(error)}`,
        "",
        getVectorInstallHelp(),
      ].join("\n"),
    );
  }

  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");

  createTables();
};

const createTables = (): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS function_metadata (
      name TEXT PRIMARY KEY,
      type INTEGER,
      category TEXT,
      side TEXT
    );

    CREATE TABLE IF NOT EXISTS function_docs (
      function_name TEXT PRIMARY KEY,
      url TEXT,
      description TEXT,
      syntax TEXT,
      examples TEXT,
      parameters TEXT,
      returns TEXT,
      related_functions TEXT,
      full_text TEXT,
      timestamp INTEGER,
      embedding BLOB,
      deprecated TEXT,
      FOREIGN KEY (function_name) REFERENCES function_metadata(name)
    );

    CREATE INDEX IF NOT EXISTS idx_metadata_category ON function_metadata(category);
    CREATE INDEX IF NOT EXISTS idx_metadata_side ON function_metadata(side);
    CREATE INDEX IF NOT EXISTS idx_docs_timestamp ON function_docs(timestamp);
  `);
};

export const closeDatabase = (): void => {
  if (db) {
    db.close();
  }
};
