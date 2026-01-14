import type { Statement } from "better-sqlite3";
import { db } from "./connection.js";
import type { MtasaFunction, CachedDoc } from "../types/interfaces.js";

type Queries = {
  insertMetadata: () => Statement;
  getMetadata: () => Statement;
  searchMetadata: () => Statement;
  getByCategory: () => Statement;
  insertDoc: () => Statement;
  getDoc: () => Statement;
  searchDocsByVector: () => Statement;
  clearDoc: () => Statement;
  clearAllDocs: () => Statement;
  countDocs: () => Statement;
};

export const queries: Queries = {
  insertMetadata: () =>
    db.prepare(`
    INSERT OR REPLACE INTO function_metadata (name, type, category, side)
    VALUES (?, ?, ?, ?)
  `),

  getMetadata: () =>
    db.prepare(`
    SELECT * FROM function_metadata WHERE name = ?
  `),

  searchMetadata: () =>
    db.prepare(`
    SELECT * FROM function_metadata 
    WHERE name LIKE ? 
    AND (? IS NULL OR side = ? OR side = 'shared')
    LIMIT ?
  `),

  getByCategory: () =>
    db.prepare(`
    SELECT * FROM function_metadata WHERE category = ? LIMIT ?
  `),

  insertDoc: () =>
    db.prepare(`
    INSERT OR REPLACE INTO function_docs 
    (function_name, url, description, syntax, examples, parameters, returns, related_functions, full_text, timestamp, embedding, deprecated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getDoc: () =>
    db.prepare(`
    SELECT * FROM function_docs WHERE function_name = ?
  `),

  searchDocsByVector: () =>
    db.prepare(`
    SELECT function_name, 
           vec_distance_L2(embedding, ?) as distance
    FROM function_docs
    WHERE embedding IS NOT NULL
    ORDER BY distance
    LIMIT ?
  `),

  clearDoc: () =>
    db.prepare(`
    DELETE FROM function_docs WHERE function_name = ?
  `),

  clearAllDocs: () =>
    db.prepare(`
    DELETE FROM function_docs
  `),

  countDocs: () =>
    db.prepare(`
    SELECT COUNT(*) as count FROM function_docs
  `),
};

// Helper to execute metadata search
export const searchFunctions = (
  query: string,
  side?: "client" | "server" | "shared",
  limit: number = 30
): MtasaFunction[] => {
  const searchPattern = `%${query}%`;
  const rows = queries
    .searchMetadata()
    .all(searchPattern, side || null, side || null, limit);
  return rows as MtasaFunction[];
};

// Helper to get metadata
export const getMetadata = (
  functionName: string
): MtasaFunction | undefined => {
  return queries.getMetadata().get(functionName) as MtasaFunction | undefined;
};

// Helper to get cached doc
export const getCachedDoc = (functionName: string): CachedDoc | undefined => {
  return queries.getDoc().get(functionName) as CachedDoc | undefined;
};
