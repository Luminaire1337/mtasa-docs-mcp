import { VECTOR_DIMENSIONS } from "../config/constants.js";

/**
 * Simple TF-IDF based text embedding generator
 * Creates a fixed-size vector representation of text
 */
export const generateTextEmbedding = (text: string): Float32Array => {
  const vector = new Float32Array(VECTOR_DIMENSIONS);

  // Normalize and tokenize text
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Simple hash-based embedding with term frequency
  const termFreq = new Map<number, number>();

  for (const word of words) {
    // Simple hash function to map word to vector index
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    const index = Math.abs(hash) % VECTOR_DIMENSIONS;
    termFreq.set(index, (termFreq.get(index) || 0) + 1);
  }

  // Fill vector with normalized term frequencies
  for (const [index, freq] of termFreq.entries()) {
    vector[index] = freq / Math.sqrt(words.length + 1);
  }

  // Normalize vector to unit length
  let magnitude = 0;
  for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
    const val = vector[i];
    if (val !== undefined) {
      magnitude += val * val;
    }
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
      const val = vector[i];
      if (val !== undefined) {
        vector[i] = val / magnitude;
      }
    }
  }

  return vector;
};

/**
 * Convert Float32Array to buffer for SQLite storage
 */
export const vectorToBuffer = (vector: Float32Array): Buffer => {
  return Buffer.from(vector.buffer);
};

/**
 * Convert buffer from SQLite to Float32Array
 */
export const bufferToVector = (buffer: Buffer): Float32Array => {
  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  );
};
