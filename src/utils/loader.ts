import { db } from "../database/connection.js";
import { queries } from "../database/queries.js";
import { parseDocumentation } from "./parser.js";
import { generateTextEmbedding, vectorToBuffer } from "./embeddings.js";
import { FUNCTION_TYPES, CACHE_DURATION } from "../config/constants.js";
import type { MtasaFunction, CachedDoc } from "../types/interfaces.js";

export const allFunctions: Map<string, MtasaFunction> = new Map();

export const loadMtasaFunctions = async (): Promise<void> => {
  try {
    const [luaRes, mtaRes] = await Promise.all([
      fetch(
        "https://wiki.multitheftauto.com/extensions/_MTAThemeExtensions/luafuncs.js"
      ),
      fetch(
        "https://wiki.multitheftauto.com/extensions/_MTAThemeExtensions/mtafuncs.js"
      ),
    ]);

    const luaText = await luaRes.text();
    const mtaText = await mtaRes.text();

    parseFunctionList(luaText);
    parseFunctionList(mtaText);

    // Store in database
    const insertMany = db.transaction((functions: MtasaFunction[]) => {
      const stmt = queries.insertMetadata();
      for (const func of functions) {
        stmt.run(func.name, func.type, func.category, func.side);
      }
    });

    insertMany(Array.from(allFunctions.values()));

    console.error(`Loaded ${allFunctions.size} MTA:SA functions into database`);
  } catch (error) {
    console.error("Failed to load MTA:SA functions:", error);
  }
};

const parseFunctionList = (jsContent: string): void => {
  const regex = /mh\['([^']+)'\]\s*=\s*(\d+)/g;
  let match;

  while ((match = regex.exec(jsContent)) !== null) {
    const [, name, typeStr] = match;
    if (!name || !typeStr) continue;
    const type = parseInt(typeStr);
    const typeInfo = FUNCTION_TYPES[type] || {
      category: "Unknown",
      side: "shared" as const,
    };

    allFunctions.set(name, {
      name,
      type,
      category: typeInfo.category,
      side: typeInfo.side,
    });
  }
};

export const fetchFunctionDoc = async (
  functionName: string,
  useCache: boolean = true
): Promise<CachedDoc | null> => {
  // Check cache
  if (useCache) {
    const cached = queries.getDoc().get(functionName) as CachedDoc | undefined;
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.error(`Using cached doc for ${functionName}`);
      return cached;
    }
  }

  // Fetch from wiki
  console.error(`Fetching ${functionName} from wiki...`);
  try {
    const url = `https://wiki.multitheftauto.com/wiki/${functionName}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const docData = parseDocumentation(html, functionName);

    // Extract related functions from wiki
    const relatedList: string[] = [];
    const seeAlsoMatch = html.match(/See [Aa]lso[\s\S]*?(?=<h[23]|$)/i);
    if (seeAlsoMatch) {
      const links = seeAlsoMatch[0].matchAll(/title="([^"]+)"/g);
      for (const link of links) {
        const funcName = link[1];
        if (funcName && allFunctions.has(funcName)) {
          relatedList.push(funcName);
        }
      }
    }

    // Generate embedding from full text
    const embedding = generateTextEmbedding(docData.full_text);
    const embeddingBuffer = vectorToBuffer(embedding);

    const doc: CachedDoc = {
      ...docData,
      related_functions: relatedList.join(", "),
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
        doc.deprecated || null
      );

    return doc;
  } catch (error) {
    console.error(`Failed to fetch ${functionName}:`, error);
    return null;
  }
};
