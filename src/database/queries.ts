import type { Statement } from "better-sqlite3";
import { db } from "./connection.js";
import type {
  MtasaFunction,
  CachedDoc,
  MtasaSide,
} from "../types/interfaces.js";

type VectorSearchRow = {
  function_name: string;
  distance: number;
};

const clampLimit = (limit: number, fallback: number, max: number): number => {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  const normalized = Math.floor(limit);
  return Math.min(Math.max(normalized, 1), max);
};

type Queries = {
  insertMetadata: () => Statement;
  getMetadata: () => Statement;
  getMetadataInsensitive: () => Statement;
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

  getMetadataInsensitive: () =>
    db.prepare(`
    SELECT * FROM function_metadata WHERE LOWER(name) = LOWER(?) LIMIT 1
  `),

  searchMetadata: () =>
    db.prepare(`
    SELECT * FROM function_metadata 
    WHERE name LIKE ? 
    AND (? IS NULL OR side = ? OR side = 'shared')
    ORDER BY name COLLATE NOCASE
    LIMIT ?
  `),

  getByCategory: () =>
    db.prepare(`
    SELECT * FROM function_metadata WHERE category = ? ORDER BY name COLLATE NOCASE LIMIT ?
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
  side?: MtasaSide,
  limit: number = 30,
): MtasaFunction[] => {
  const safeLimit = clampLimit(limit, 30, 200);
  const trimmedQuery = query.trim();
  const searchPattern = `%${trimmedQuery}%`;
  const rows = queries
    .searchMetadata()
    .all(searchPattern, side || null, side || null, safeLimit);
  return rows as MtasaFunction[];
};

// Helper to get metadata
export const getMetadata = (
  functionName: string,
): MtasaFunction | undefined => {
  return queries.getMetadata().get(functionName) as MtasaFunction | undefined;
};

export const findMetadataByName = (
  functionName: string,
): MtasaFunction | undefined => {
  const exact = getMetadata(functionName);
  if (exact) {
    return exact;
  }

  return queries.getMetadataInsensitive().get(functionName) as
    | MtasaFunction
    | undefined;
};

// Helper to get cached doc
export const getCachedDoc = (functionName: string): CachedDoc | undefined => {
  return queries.getDoc().get(functionName) as CachedDoc | undefined;
};

export const listFunctionsByCategory = (
  category: string,
  limit: number = 100,
): MtasaFunction[] => {
  const safeLimit = clampLimit(limit, 100, 500);
  const rows = queries.getByCategory().all(category, safeLimit);
  return rows as MtasaFunction[];
};

export const searchByVector = (
  queryVector: Buffer,
  limit: number = 10,
): VectorSearchRow[] => {
  const safeLimit = clampLimit(limit, 10, 200);
  const rows = queries.searchDocsByVector().all(queryVector, safeLimit);
  return rows as VectorSearchRow[];
};
