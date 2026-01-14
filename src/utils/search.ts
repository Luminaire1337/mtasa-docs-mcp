import { queries, getMetadata } from "../database/queries.js";
import { allFunctions } from "../utils/loader.js";
import { generateTextEmbedding, vectorToBuffer } from "./embeddings.js";
import type { MtasaFunction } from "../types/interfaces.js";

/**
 * Keyword aliases mapped to function prefixes (based on actual MTA:SA function names)
 * Top prefixes: get(438), set(311), on(226), dgs(144), gui(132), is(118), engine(74),
 * handling(49), dx(44), create(29), acl(23), xml(20), text(20), file(17), db(6)
 */
const KEYWORD_ALIASES: Record<string, string[]> = {
  // Database
  database: ["db"],
  sqlite: ["db"],
  sql: ["db"],
  query: ["db"],

  // GUI/Interface
  gui: ["gui", "dgs"],
  interface: ["gui", "dgs"],
  window: ["gui", "dgs", "create"],
  button: ["gui", "dgs", "create"],
  ui: ["gui", "dgs"],
  menu: ["gui", "dgs"],
  dialog: ["gui", "dgs"],
  cegui: ["gui", "dgs"],

  // Browser/CEF
  browser: ["browser", "gui", "create"],
  cef: ["browser", "create", "inject"],
  html: ["browser", "create"],
  javascript: ["browser", "execute"],
  js: ["browser", "execute"],
  web: ["browser", "create"],
  webview: ["browser", "create"],

  // Elements
  element: ["element", "get", "set", "create"],
  player: ["player", "get", "set"],
  vehicle: ["vehicle", "get", "set", "create"],
  car: ["vehicle"],
  ped: ["ped", "get", "set", "create"],
  pedestrian: ["ped"],
  npc: ["ped"],
  object: ["object", "create"],
  pickup: ["pickup", "create"],
  marker: ["marker", "create"],
  blip: ["blip", "create"],

  // Drawing/Rendering
  draw: ["dx", "dgs", "gui", "text"],
  render: ["dx"],
  directx: ["dx"],
  graphics: ["dx"],
  shader: ["shader", "dx", "engine"],
  texture: ["texture", "dx", "engine"],

  // Sound/Effects
  sound: ["sound", "play"],
  audio: ["sound", "play"],
  music: ["sound", "play"],
  effect: ["fx", "play"],

  // Animation
  animation: ["set", "get"],
  anim: ["set", "get"],

  // Weapon
  weapon: ["weapon", "give", "take"],
  gun: ["weapon", "give"],

  // Events
  event: ["event", "add", "trigger", "on"],
  handler: ["add", "remove"],
  callback: ["add", "on"],

  // Controls
  bind: ["bind", "toggle"],
  key: ["bind", "get", "is"],
  control: ["get", "set", "toggle"],

  // ACL/Permissions
  permission: ["acl"],
  access: ["acl"],
  admin: ["acl"],

  // File/XML
  xml: ["xml"],
  file: ["file"],
  config: ["xml", "file"],

  // Camera/World
  camera: ["get", "set"],
  weather: ["get", "set"],
  time: ["get", "set"],
  world: ["get", "set"],

  // Network
  network: ["fetch", "call"],
  remote: ["call", "fetch"],
  http: ["http", "fetch"],

  // Engine/Model
  engine: ["engine"],
  model: ["engine"],
  handling: ["handling"],

  // Utility
  timer: ["set", "kill"],
  debug: ["debug", "output"],
  console: ["output"],
  chat: ["output"],
  message: ["output"],
};

/**
 * Expand query with related function prefixes from keyword aliases
 */
const expandQueryKeywords = (query: string): string[] => {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = new Set(words);

  for (const word of words) {
    const prefixes = KEYWORD_ALIASES[word];
    if (prefixes) {
      prefixes.forEach((prefix) => expanded.add(prefix));
    }
  }

  return Array.from(expanded);
};

/**
 * Search for related functions using vector similarity
 */
export const findRelatedFunctions = (
  query: string,
  limit: number = 10
): MtasaFunction[] => {
  // Generate embedding for the query
  const queryEmbedding = generateTextEmbedding(query);
  const queryBuffer = vectorToBuffer(queryEmbedding);

  try {
    // Try vector search first
    const results = queries
      .searchDocsByVector()
      .all(queryBuffer, limit * 2) as Array<{
      function_name: string;
      distance: number;
    }>;

    if (results.length > 0) {
      const functions: MtasaFunction[] = [];
      for (const result of results) {
        const func = getMetadata(result.function_name);
        if (func) {
          functions.push(func);
        }
      }
      if (functions.length >= limit) {
        return functions.slice(0, limit);
      }
    }
  } catch (error) {
    console.error("Vector search error:", error);
  }

  // Fall back to keyword matching on function names
  const keywords = expandQueryKeywords(query).filter((word) => word.length > 2);

  const scored: Array<{ func: MtasaFunction; score: number }> = [];

  for (const func of allFunctions.values()) {
    let score = 0;
    const funcNameLower = func.name.toLowerCase();

    for (const keyword of keywords) {
      // Exact prefix match gets highest score
      if (funcNameLower.startsWith(keyword)) {
        score += 20;
      }
      // Contains keyword gets good score
      if (funcNameLower.includes(keyword)) {
        score += 10;
      }
      // Partial word match in camelCase
      if (
        funcNameLower
          .split(/(?=[A-Z])/)
          .some((part: string) => part.toLowerCase().includes(keyword))
      ) {
        score += 5;
      }
    }

    if (score > 0) {
      scored.push({ func, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.func);
};
