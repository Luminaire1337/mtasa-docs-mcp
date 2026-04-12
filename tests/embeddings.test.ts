import { describe, expect, test } from "vitest";
import {
  bufferToVector,
  generateTextEmbedding,
  vectorToBuffer,
} from "../src/utils/embeddings.js";
import { VECTOR_DIMENSIONS } from "../src/config/constants.js";

const magnitude = (vector: Float32Array): number => {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
};

describe("embeddings", () => {
  test("returns fixed-size embedding vector", () => {
    const embedding = generateTextEmbedding(
      "create gui window with close button and local player checks",
    );

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(VECTOR_DIMENSIONS);
  });

  test("is deterministic for same input", () => {
    const one = generateTextEmbedding("db query async results and callback");
    const two = generateTextEmbedding("db query async results and callback");

    expect(Array.from(one)).toEqual(Array.from(two));
  });

  test("normalizes non-empty vectors close to unit length", () => {
    const embedding = generateTextEmbedding(
      "resource root event handler and onClientResourceStart",
    );
    const mag = magnitude(embedding);

    expect(mag).toBeGreaterThan(0.99);
    expect(mag).toBeLessThan(1.01);
  });

  test("handles empty input without NaN values", () => {
    const embedding = generateTextEmbedding("");

    for (const value of embedding) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  test("round-trips vector through buffer conversion", () => {
    const embedding = generateTextEmbedding("dx draw text and render pipeline");
    const buffer = vectorToBuffer(embedding);
    const restored = bufferToVector(buffer);

    expect(restored.length).toBe(embedding.length);
    expect(Array.from(restored)).toEqual(Array.from(embedding));
  });
});
