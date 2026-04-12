import { db } from "../database/connection.js";
import { queries } from "../database/queries.js";
import { parseDocumentation } from "./parser.js";
import { generateTextEmbedding, vectorToBuffer } from "./embeddings.js";
import { FUNCTION_TYPES, CACHE_DURATION } from "../config/constants.js";
import type { MtasaFunction, CachedDoc } from "../types/interfaces.js";

export const allFunctions: Map<string, MtasaFunction> = new Map();
export const functionNameLookup: Map<string, string> = new Map();

const WIKI_BASE_URL = "https://wiki.multitheftauto.com/wiki";

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
};

const normalizeInputName = (name: string): string => {
  return name.trim();
};

const toWikiTitleCase = (name: string): string => {
  if (name.length === 0) {
    return name;
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
};

const getUrlVariants = (functionName: string): string[] => {
  const normalized = normalizeInputName(functionName);
  return dedupe([
    normalized,
    toWikiTitleCase(normalized),
    normalized.toLowerCase(),
  ]);
};

const registerFunctionInMaps = (
  func: MtasaFunction,
  functionsMap: Map<string, MtasaFunction>,
  lookupMap: Map<string, string>,
): void => {
  functionsMap.set(func.name, func);
  lookupMap.set(func.name.toLowerCase(), func.name);
};

const registerFunction = (func: MtasaFunction): void => {
  registerFunctionInMaps(func, allFunctions, functionNameLookup);
};

const resolveFunctionName = (name: string): string | undefined => {
  return functionNameLookup.get(name.toLowerCase());
};

export const canonicalizeFunctionName = (name: string): string => {
  const trimmed = normalizeInputName(name);
  if (trimmed.length === 0) {
    return trimmed;
  }

  return resolveFunctionName(trimmed) ?? trimmed;
};

export const hydrateFunctionsFromDatabase = (): number => {
  allFunctions.clear();
  functionNameLookup.clear();

  const rows = db
    .prepare("SELECT * FROM function_metadata")
    .all() as MtasaFunction[];

  for (const row of rows) {
    registerFunction(row);
  }

  return rows.length;
};

export const loadMtasaFunctions = async (): Promise<void> => {
  try {
    const [luaRes, mtaRes] = await Promise.all([
      fetch(
        "https://wiki.multitheftauto.com/extensions/_MTAThemeExtensions/luafuncs.js",
      ),
      fetch(
        "https://wiki.multitheftauto.com/extensions/_MTAThemeExtensions/mtafuncs.js",
      ),
    ]);

    const luaText = await luaRes.text();
    const mtaText = await mtaRes.text();

    const nextFunctions = new Map<string, MtasaFunction>();
    const nextLookup = new Map<string, string>();

    const registerNextFunction = (func: MtasaFunction): void => {
      registerFunctionInMaps(func, nextFunctions, nextLookup);
    };

    parseFunctionList(luaText, registerNextFunction);
    parseFunctionList(mtaText, registerNextFunction);

    // Store in database
    const insertMany = db.transaction((functions: MtasaFunction[]) => {
      const stmt = queries.insertMetadata();
      for (const func of functions) {
        stmt.run(func.name, func.type, func.category, func.side);
      }
    });

    insertMany(Array.from(nextFunctions.values()));

    allFunctions.clear();
    functionNameLookup.clear();

    for (const func of nextFunctions.values()) {
      registerFunction(func);
    }

    console.error(`Loaded ${allFunctions.size} MTA:SA functions into database`);
  } catch (error) {
    console.error("Failed to load MTA:SA functions:", error);
  }
};

const parseFunctionList = (
  jsContent: string,
  register: (func: MtasaFunction) => void,
): void => {
  const regex = /mh\['([^']+)'\]\s*=\s*(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(jsContent)) !== null) {
    const [, name, typeStr] = match;
    if (!name || !typeStr) continue;
    const type = Number.parseInt(typeStr, 10);
    const typeInfo = FUNCTION_TYPES[type] || {
      category: "Unknown",
      side: "shared" as const,
    };

    register({
      name,
      type,
      category: typeInfo.category,
      side: typeInfo.side,
    });
  }
};

export const fetchFunctionDoc = async (
  functionName: string,
  useCache: boolean = true,
): Promise<CachedDoc | null> => {
  try {
    const canonicalName = normalizeInputName(functionName);
    if (canonicalName.length === 0) {
      throw new Error("Function name is required");
    }

    // Check cache
    if (useCache) {
      const cached = queries.getDoc().get(canonicalName) as
        | CachedDoc
        | undefined;
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.error(`Using cached doc for ${canonicalName}`);
        return cached;
      }
    }

    // Try multiple wiki URL variants
    console.error(`Fetching ${canonicalName} from wiki...`);
    const urlVariants = getUrlVariants(canonicalName);
    let html: string | null = null;
    let usedUrl: string | null = null;

    for (const variant of urlVariants) {
      const url = `${WIKI_BASE_URL}/${variant}`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          html = await response.text();
          // Use the final redirected URL if available
          usedUrl = response.url || url;
          break;
        }
      } catch {
        // ignore and try next
      }
    }
    if (!html || !usedUrl) {
      throw new Error(`Could not fetch wiki page for ${canonicalName}`);
    }

    const docData = parseDocumentation(html, canonicalName, usedUrl);

    // Extract related functions from wiki
    const relatedList: string[] = [];
    const seeAlsoMatch = html.match(/See [Aa]lso[\s\S]*?(?=<h[23]|$)/i);
    if (seeAlsoMatch) {
      const links = seeAlsoMatch[0].matchAll(/title="([^"]+)"/g);
      for (const link of links) {
        const relatedName = link[1];
        if (!relatedName) {
          continue;
        }

        const resolvedName = resolveFunctionName(relatedName);
        if (resolvedName) {
          relatedList.push(resolvedName);
        }
      }
    }

    // Generate embedding from full text
    const embedding = generateTextEmbedding(docData.full_text);
    const embeddingBuffer = vectorToBuffer(embedding);

    const relatedFromParser = docData.related_functions
      .split(",")
      .map((name) => resolveFunctionName(normalizeInputName(name)))
      .filter((name): name is string => typeof name === "string");

    const doc: CachedDoc = {
      ...docData,
      function_name: canonicalName,
      related_functions: dedupe([...relatedFromParser, ...relatedList]).join(
        ", ",
      ),
    };

    // Store in database
    queries
      .insertDoc()
      .run(
        doc.function_name,
        doc.url,
        doc.description,
        doc.syntax,
        doc.examples,
        doc.parameters,
        doc.returns,
        doc.related_functions,
        doc.full_text,
        doc.timestamp,
        embeddingBuffer,
        doc.deprecated || null,
      );

    return doc;
  } catch (error) {
    console.error(`Failed to fetch ${functionName}:`, error);
    return null;
  }
};
