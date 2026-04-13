import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { getExtensionPath as getEsmExtensionPath } from "@sqliteai/sqlite-vector";
import { DB_PATH } from "../config/constants.js";

export type StatementLike = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

type TransactionFactory = <TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
) => (...args: TArgs) => TResult;

type GenericTxFunction = (...args: any[]) => any;

type DatabaseAdapter = {
  prepare: (sql: string) => StatementLike;
  exec: (sql: string) => void;
  loadExtension: (extensionPath: string) => void;
  pragma: (statement: string) => unknown;
  transaction: TransactionFactory;
  close: () => void;
};

type NodeSqliteStatement = {
  run: (...params: any[]) => unknown;
  get: (...params: any[]) => unknown;
  all: (...params: any[]) => unknown[];
};

type NodeSqliteDatabase = {
  prepare: (sql: string) => NodeSqliteStatement;
  exec: (sql: string) => void;
  loadExtension: (extensionPath: string) => void;
  close: () => void;
};

type NodeSqliteModule = {
  DatabaseSync: new (
    location: string,
    options?: { allowExtension?: boolean },
  ) => NodeSqliteDatabase;
};

type BunSqliteStatement = {
  run: (...params: any[]) => unknown;
  get: (...params: any[]) => unknown;
  all: (...params: any[]) => unknown[];
};

type BunSqliteDatabase = {
  prepare: (sql: string) => BunSqliteStatement;
  exec: (sql: string) => void;
  loadExtension: (extensionPath: string) => void;
  transaction: (fn: GenericTxFunction) => GenericTxFunction;
  close: () => void;
};

type BunSqliteModule = {
  Database: new (filename: string) => BunSqliteDatabase;
};

export let db!: DatabaseAdapter;
export let isVectorExtensionLoaded = false;

const require = createRequire(import.meta.url);

const createNodeSqliteAdapter = (): DatabaseAdapter => {
  let database: NodeSqliteDatabase;

  try {
    const nodeSqlite = require("node:sqlite") as NodeSqliteModule;
    database = new nodeSqlite.DatabaseSync(DB_PATH, { allowExtension: true });
  } catch (error) {
    throw new Error(
      [
        "Failed to initialize Node sqlite adapter.",
        "This runtime requires Node.js v24+ with the `node:sqlite` module available.",
        `Underlying error: ${String(error)}`,
      ].join("\n"),
    );
  }

  return {
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        run: (...params: unknown[]) => statement.run(...(params as any[])),
        get: (...params: unknown[]) => statement.get(...(params as any[])),
        all: (...params: unknown[]) =>
          statement.all(...(params as any[])) as unknown[],
      };
    },
    exec: (sql) => {
      database.exec(sql);
    },
    loadExtension: (extensionPath) => {
      database.loadExtension(extensionPath);
    },
    pragma: (statement) => {
      const normalized = statement.trim().toUpperCase().startsWith("PRAGMA")
        ? statement
        : `PRAGMA ${statement}`;
      database.exec(normalized);
      return undefined;
    },
    transaction: <TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => TResult,
    ) => {
      return (...args: TArgs): TResult => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const result = fn(...args);
          database.exec("COMMIT");
          return result;
        } catch (error) {
          try {
            database.exec("ROLLBACK");
          } catch {
            // Ignore rollback failures after a failed transaction.
          }
          throw error;
        }
      };
    },
    close: () => {
      database.close();
    },
  };
};

const createBunSqliteAdapter = (): DatabaseAdapter => {
  let database: BunSqliteDatabase;

  try {
    const bunSqlite = require("bun:sqlite") as BunSqliteModule;
    database = new bunSqlite.Database(DB_PATH);
  } catch (error) {
    throw new Error(
      [
        "Failed to initialize Bun sqlite adapter.",
        "This runtime requires Bun with the `bun:sqlite` module available.",
        `Underlying error: ${String(error)}`,
      ].join("\n"),
    );
  }

  return {
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        run: (...params: unknown[]) => statement.run(...(params as any[])),
        get: (...params: unknown[]) => statement.get(...(params as any[])),
        all: (...params: unknown[]) =>
          statement.all(...(params as any[])) as unknown[],
      };
    },
    exec: (sql) => {
      database.exec(sql);
    },
    loadExtension: (extensionPath) => {
      database.loadExtension(extensionPath);
    },
    pragma: (statement) => {
      const normalized = statement.trim().toUpperCase().startsWith("PRAGMA")
        ? statement
        : `PRAGMA ${statement}`;
      database.exec(normalized);
      return undefined;
    },
    transaction: <TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => TResult,
    ) => {
      const wrapped = database.transaction(fn as GenericTxFunction);
      return (...args: TArgs): TResult => wrapped(...args);
    },
    close: () => {
      database.close();
    },
  };
};

const isBunRuntime = (): boolean => {
  return typeof process.versions["bun"] === "string";
};

const createDatabase = (): DatabaseAdapter => {
  if (isBunRuntime()) {
    return createBunSqliteAdapter();
  }

  return createNodeSqliteAdapter();
};

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
    "",
    "The server will continue without native sqlite-vector and use a JS distance fallback.",
  ].join("\n");
};

export const initializeDatabase = (): void => {
  // Ensure directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize SQLite database
  db = createDatabase();

  // Load vector extension using upstream resolver
  try {
    db.loadExtension(resolveVectorExtensionPath());
    isVectorExtensionLoaded = true;
  } catch (error) {
    isVectorExtensionLoaded = false;
    console.error(
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
