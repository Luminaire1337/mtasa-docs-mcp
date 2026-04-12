import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { getExtensionPath } from "@sqliteai/sqlite-vector";
import { DB_PATH } from "../config/constants.js";

export let db!: Database.Database;

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
    db.loadExtension(getExtensionPath());
  } catch (error) {
    throw new Error(`Failed to load SQLite vector extension: ${String(error)}`);
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
