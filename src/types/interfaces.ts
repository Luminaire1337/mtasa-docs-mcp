export type MtasaSide = "client" | "server" | "shared";

export interface MtasaFunction {
  name: string;
  type: number;
  category: string;
  side: MtasaSide;
}

export interface CachedDoc {
  function_name: string;
  url: string;
  description: string;
  syntax: string;
  examples: string;
  parameters: string;
  returns: string;
  related_functions: string;
  full_text: string;
  timestamp: number;
  embedding?: Buffer | null;
  deprecated?: string | null;
}

export interface FunctionTypeInfo {
  category: string;
  side: MtasaSide;
}
