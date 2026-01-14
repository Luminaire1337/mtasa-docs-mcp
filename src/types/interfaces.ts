export interface MtasaFunction {
  name: string;
  type: number;
  category: string;
  side: "client" | "server" | "shared";
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
  deprecated?: string;
}

export interface FunctionTypeInfo {
  category: string;
  side: "client" | "server" | "shared";
}
