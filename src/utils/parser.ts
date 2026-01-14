import type { CachedDoc } from "../types/interfaces.js";

export const stripHtml = (html: string): string => {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

export const parseDocumentation = (
  html: string,
  functionName: string
): Omit<CachedDoc, "embedding"> => {
  const doc: Partial<Omit<CachedDoc, "embedding">> = {
    function_name: functionName,
    url: `https://wiki.multitheftauto.com/wiki/${functionName}`,
    timestamp: Date.now(),
  };

  // Extract description
  const descMatches = html.match(/<p>(.*?)<\/p>/is);
  if (descMatches && descMatches[1]) {
    doc.description = stripHtml(descMatches[1]).substring(0, 1000);
  } else {
    doc.description = "";
  }

  // Check for deprecation notice
  const deprecationPatterns = [
    /You should use (?:predefined variable |the )?([\w]+)(?: variable)? instead/i,
    /(?:deprecated|obsolete|no longer recommended)[^.]*?(?:use|replaced by|instead use) ([\w]+)/i,
    /predefined variable '?([\w]+)'? is/i,
  ];

  for (const pattern of deprecationPatterns) {
    const match = html.match(pattern);
    if (match) {
      doc.deprecated = `Use ${match[1]} instead`;
      break;
    }
  }

  // Extract syntax
  const syntaxList: string[] = [];
  const syntaxSection = html.match(/Syntax[\s\S]*?<pre[^>]*>(.*?)<\/pre>/i);
  if (syntaxSection && syntaxSection[1]) {
    syntaxList.push(stripHtml(syntaxSection[1]));
  }

  const allPreTags = html.matchAll(/<pre[^>]*>(.*?)<\/pre>/gis);
  for (const match of allPreTags) {
    if (!match[1]) continue;
    const code = stripHtml(match[1]).trim();
    if (code && !syntaxList.includes(code) && syntaxList.length < 3) {
      if (
        code.includes(functionName) ||
        code.includes("function") ||
        code.includes("=")
      ) {
        syntaxList.push(code);
      }
    }
  }
  doc.syntax = syntaxList.join("\n---\n");

  // Extract examples
  const examplesList: string[] = [];
  const exampleMatches = html.matchAll(
    /<syntaxhighlight[^>]*lang="lua"[^>]*>(.*?)<\/syntaxhighlight>/gis
  );
  for (const match of exampleMatches) {
    if (!match[1]) continue;
    const example = stripHtml(match[1]).trim();
    if (example && example.length > 20) {
      examplesList.push(example);
    }
  }

  const examplePreMatches = html.matchAll(
    /Example[\s\S]{0,100}<pre[^>]*>(.*?)<\/pre>/gis
  );
  for (const match of examplePreMatches) {
    if (!match[1]) continue;
    const example = stripHtml(match[1]).trim();
    if (example && !examplesList.includes(example) && example.length > 20) {
      examplesList.push(example);
    }
  }
  doc.examples = examplesList.join("\n---\n");

  // Extract parameters (both Required and Optional Arguments sections)
  const paramsMatches: string[] = [];

  // Try to find Required Arguments section
  const requiredMatch = html.match(
    /<h3[^>]*>\s*(?:<[^>]*>)*\s*Required\s+Arguments[\s\S]*?(?=<h[23]|$)/i
  );
  if (requiredMatch) {
    paramsMatches.push(stripHtml(requiredMatch[0]));
  }

  // Try to find Optional Arguments section
  const optionalMatch = html.match(
    /<h3[^>]*>\s*(?:<[^>]*>)*\s*Optional\s+Arguments[\s\S]*?(?=<h[23]|$)/i
  );
  if (optionalMatch) {
    paramsMatches.push(stripHtml(optionalMatch[0]));
  }

  // Fallback: try older wiki format
  if (paramsMatches.length === 0) {
    const oldFormatMatch = html.match(
      /===?\s*(?:Required|Optional)?\s*[Aa]rguments[\s\S]*?(?=<h[23]|===|$)/i
    );
    if (oldFormatMatch) {
      paramsMatches.push(stripHtml(oldFormatMatch[0]));
    }
  }

  doc.parameters = paramsMatches.join("\n\n").substring(0, 2000);

  // Extract returns
  const returnsMatch = html.match(
    /<h3[^>]*>\s*(?:<[^>]*>)*\s*Returns[\s\S]*?(?=<h[23]|$)/i
  );
  if (!returnsMatch) {
    // Fallback to older format
    const oldReturnsMatch = html.match(
      /===?\s*Returns[\s\S]*?(?=<h[23]|===|$)/i
    );
    doc.returns = oldReturnsMatch
      ? stripHtml(oldReturnsMatch[0]).substring(0, 500)
      : "";
  } else {
    doc.returns = stripHtml(returnsMatch[0]).substring(0, 500);
  }

  // Extract related functions from "See Also" section
  const relatedFunctions: string[] = [];
  const seeAlsoMatch = html.match(
    /<h2[^>]*>\s*(?:<[^>]*>)*\s*See\s+Also[\s\S]*?(?=<h2|$)/i
  );
  if (seeAlsoMatch) {
    const funcLinks = seeAlsoMatch[0].matchAll(
      /<a[^>]*(?:href|title)="[^"]*\/wiki\/([^"]+)"[^>]*>([^<]+)<\/a>/gi
    );
    for (const match of funcLinks) {
      const funcName = match[1] || match[2];
      if (funcName && !funcName.includes(":") && !funcName.includes("/")) {
        relatedFunctions.push(funcName);
      }
    }
  }
  doc.related_functions = relatedFunctions.join(", ");

  // Create full text for searching
  doc.full_text = [
    doc.description,
    doc.syntax,
    doc.parameters,
    doc.returns,
    doc.examples,
  ].join(" ");

  return doc as Omit<CachedDoc, "embedding">;
};
