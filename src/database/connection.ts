import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { DB_PATH } from "../config/constants.js";

const require = createRequire(import.meta.url);

export let db: Database.Database;

const getVectorExtensionPath = (): string => {
  const arch =
    process.arch === "x64"
      ? "x86_64"
      : process.arch === "arm64"
      ? "arm64"
      : process.arch;
  const platformName = `${process.platform}-${arch}`;
  const packageName = `@sqliteai/sqlite-vector-${platformName}`;

  try {
    const platformPackage = require(packageName);
    if (platformPackage?.path && fs.existsSync(platformPackage.path)) {
      return platformPackage.path;
    }
    throw new Error(`Invalid extension path for ${platformName}`);
  } catch {
    throw new Error(`SQLite Vector extension not found: ${packageName}`);
  }
};

export const initializeDatabase = (): void => {
  // Ensure directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize SQLite database
  db = new Database(DB_PATH);

  // Load vector extension (postinstall ensures platform driver is present)
  db.loadExtension(getVectorExtensionPath());

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
