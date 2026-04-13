import { db, isVectorExtensionLoaded } from "./connection.js";
import type { StatementLike } from "./connection.js";
import { bufferToVector } from "../utils/embeddings.js";
import type {
  MtasaFunction,
  CachedDoc,
  MtasaSide,
} from "../types/interfaces.js";

type VectorSearchRow = {
  function_name: string;
  distance: number;
};

type DocEmbeddingRow = {
  function_name: string;
  embedding: unknown;
};

const clampLimit = (limit: number, fallback: number, max: number): number => {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  const normalized = Math.floor(limit);
  return Math.min(Math.max(normalized, 1), max);
};

type Queries = {
  insertMetadata: () => StatementLike;
  getMetadata: () => StatementLike;
  getMetadataInsensitive: () => StatementLike;
  searchMetadata: () => StatementLike;
  getByCategory: () => StatementLike;
  insertDoc: () => StatementLike;
  getDoc: () => StatementLike;
  searchDocsByVector: () => StatementLike;
  listDocEmbeddings: () => StatementLike;
  clearDoc: () => StatementLike;
  clearAllDocs: () => StatementLike;
  countDocs: () => StatementLike;
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

  listDocEmbeddings: () =>
    db.prepare(`
    SELECT function_name, embedding
    FROM function_docs
    WHERE embedding IS NOT NULL
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

  if (!isVectorExtensionLoaded) {
    return searchByVectorInJavaScript(queryVector, safeLimit);
  }

  const rows = queries.searchDocsByVector().all(queryVector, safeLimit);
  return rows as VectorSearchRow[];
};

const toBuffer = (value: unknown): Buffer | null => {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  return null;
};

const calculateL2Distance = (
  left: Float32Array,
  right: Float32Array,
): number => {
  if (left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }

  let sum = 0;
  for (let index = 0; index < left.length; index++) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }

  return Math.sqrt(sum);
};

const searchByVectorInJavaScript = (
  queryVector: Buffer,
  limit: number,
): VectorSearchRow[] => {
  const query = bufferToVector(queryVector);
  const rows = queries.listDocEmbeddings().all() as DocEmbeddingRow[];
  const scored: VectorSearchRow[] = [];

  for (const row of rows) {
    const embeddingBuffer = toBuffer(row.embedding);
    if (!embeddingBuffer) {
      continue;
    }

    const embedding = bufferToVector(embeddingBuffer);
    const distance = calculateL2Distance(query, embedding);
    if (!Number.isFinite(distance)) {
      continue;
    }

    scored.push({
      function_name: row.function_name,
      distance,
    });
  }

  return scored
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);
};
