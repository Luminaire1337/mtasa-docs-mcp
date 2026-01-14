import * as path from "path";
import * as os from "os";
import type { FunctionTypeInfo } from "../types/interfaces.js";

export const FUNCTION_TYPES: Record<number, FunctionTypeInfo> = {
  2: { category: "Lua Keywords", side: "shared" },
  3: { category: "Standard Lua Functions", side: "shared" },
  4: { category: "Data Types/Classes", side: "shared" },
  5: { category: "MTA:SA Shared Functions", side: "shared" },
  6: { category: "Client Functions", side: "client" },
  7: { category: "Server Functions", side: "server" },
  8: { category: "Client Events", side: "client" },
  9: { category: "Server Events", side: "server" },
};

export const DB_PATH = path.join(
  os.tmpdir(),
  "mtasa-mcp-cache",
  "mtasa_docs.db"
);

export const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export const VECTOR_DIMENSIONS = 384; // Dimension for embedding vectors
