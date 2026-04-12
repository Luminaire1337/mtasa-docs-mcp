import type { CachedDoc } from "../types/interfaces.js";

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

const normalizeWhitespace = (value: string): string => {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const extractSection = (html: string, heading: string): string => {
  const sectionRegex = new RegExp(
    `<h[23][^>]*>[\\s\\S]*?${heading}[\\s\\S]*?<\\/h[23]>([\\s\\S]*?)(?=<h[23]|$)`,
    "i",
  );
  const match = html.match(sectionRegex);
  return match?.[1] ?? "";
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
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

const getSyntaxCandidate = (html: string): string => {
  const syntaxSection = extractSection(html, "Syntax");

  if (syntaxSection) {
    const highlightedSyntax = syntaxSection.match(
      /<syntaxhighlight[^>]*>([\s\S]*?)<\/syntaxhighlight>/i,
    );
    if (highlightedSyntax?.[1]) {
      return stripHtml(highlightedSyntax[1]);
    }

    const preSyntax = syntaxSection.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preSyntax?.[1]) {
      return stripHtml(preSyntax[1]);
    }
  }

  const fallback = html.match(/Syntax[\s\S]*?<pre[^>]*>(.*?)<\/pre>/i);
  return fallback?.[1] ? stripHtml(fallback[1]) : "";
};

const getExamples = (html: string, syntaxBlock: string): string[] => {
  const candidates: string[] = [];

  const syntaxHighlightMatches = html.matchAll(
    /<syntaxhighlight[^>]*lang="lua"[^>]*>(.*?)<\/syntaxhighlight>/gis,
  );
  for (const match of syntaxHighlightMatches) {
    if (match[1]) {
      candidates.push(stripHtml(match[1]));
    }
  }

  const preMatches = html.matchAll(
    /<pre[^>]*class="prettyprint[^"]*lang-lua[^"]*"[^>]*>(.*?)<\/pre>/gis,
  );
  for (const match of preMatches) {
    if (match[1]) {
      candidates.push(stripHtml(match[1]));
    }
  }

  const sectionExampleMatches = html.matchAll(
    /Example[\s\S]{0,150}<pre[^>]*>(.*?)<\/pre>/gis,
  );
  for (const match of sectionExampleMatches) {
    if (match[1]) {
      candidates.push(stripHtml(match[1]));
    }
  }

  return unique(
    candidates
      .map((example) => normalizeWhitespace(example))
      .filter((example) => example.length > 20 && example !== syntaxBlock),
  );
};

export const stripHtml = (html: string): string => {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
        .replace(/<li[^>]*>/gi, "- ")
        .replace(/<[^>]*>/g, ""),
    ),
  );
};

export const parseDocumentation = (
  html: string,
  functionName: string,
  urlOverride?: string,
): Omit<CachedDoc, "embedding"> => {
  const doc: Partial<Omit<CachedDoc, "embedding">> = {
    function_name: functionName,
    url: urlOverride ?? `https://wiki.multitheftauto.com/wiki/${functionName}`,
    timestamp: Date.now(),
    description: "",
    syntax: "",
    examples: "",
    parameters: "",
    returns: "",
    related_functions: "",
    full_text: "",
  };

  // Extract description
  const descMatches = html.match(/<p>(.*?)<\/p>/is);
  if (descMatches && descMatches[1]) {
    doc.description = stripHtml(descMatches[1]).substring(0, 1000);
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
      const replacement = match[1]?.trim();
      doc.deprecated = replacement
        ? `Use ${replacement} instead`
        : "Deprecated";
      break;
    }
  }

  // Extract syntax from Syntax section first, fallback to generic pattern
  const syntaxBlock = getSyntaxCandidate(html);
  doc.syntax = syntaxBlock;

  // Extract examples
  const examplesList = getExamples(html, syntaxBlock);
  doc.examples = examplesList.join("\n---\n");

  // Extract parameters (both Required and Optional Arguments sections)
  const paramsMatches: string[] = [];

  // Try to find Required Arguments section
  const requiredMatch = html.match(
    /<h3[^>]*>\s*(?:<[^>]*>)*\s*Required\s+Arguments[\s\S]*?(?=<h[23]|$)/i,
  );
  if (requiredMatch) {
    paramsMatches.push(stripHtml(requiredMatch[0]));
  }

  // Try to find Optional Arguments section
  const optionalMatch = html.match(
    /<h3[^>]*>\s*(?:<[^>]*>)*\s*Optional\s+Arguments[\s\S]*?(?=<h[23]|$)/i,
  );
  if (optionalMatch) {
    paramsMatches.push(stripHtml(optionalMatch[0]));
  }

  // Fallback: try older wiki format
  if (paramsMatches.length === 0) {
    const oldFormatMatch = html.match(
      /===?\s*(?:Required|Optional)?\s*[Aa]rguments[\s\S]*?(?=<h[23]|===|$)/i,
    );
    if (oldFormatMatch) {
      paramsMatches.push(stripHtml(oldFormatMatch[0]));
    }
  }

  doc.parameters = unique(paramsMatches).join("\n\n").substring(0, 2000);

  // Extract returns
  const returnsMatch = html.match(
    /<h3[^>]*>\s*(?:<[^>]*>)*\s*Returns[\s\S]*?(?=<h[23]|$)/i,
  );
  if (!returnsMatch) {
    // Fallback to older format
    const oldReturnsMatch = html.match(
      /===?\s*Returns[\s\S]*?(?=<h[23]|===|$)/i,
    );
    doc.returns = oldReturnsMatch
      ? stripHtml(oldReturnsMatch[0]).substring(0, 500)
      : "";
  } else {
    doc.returns = stripHtml(returnsMatch[0]).substring(0, 500);
  }

  // Remove #catlinks section to avoid category/footer links
  const htmlNoCatlinks = html.replace(
    /<div id="catlinks"[\s\S]*?<\/div>\s*<\/div>/i,
    "",
  );

  // Extract related functions from "See Also" section
  const relatedFunctions: string[] = [];
  const seeAlsoMatch = htmlNoCatlinks.match(
    /<h2[^>]*>\s*(?:<[^>]*>)*\s*See\s+Also[\s\S]*?(?=<h2|$)/i,
  );
  if (seeAlsoMatch) {
    // Only grab <li><a ...>...</a></li> elements
    const liLinks = seeAlsoMatch[0].matchAll(
      /<li>\s*<a[^>]*(?:href|title)="[^"]*\/wiki\/([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/li>/gi,
    );
    for (const match of liLinks) {
      const linkText = match[2];
      if (linkText && !linkText.includes(":") && !linkText.includes("/")) {
        relatedFunctions.push(linkText);
      }
    }
  }
  doc.related_functions = unique(relatedFunctions).join(", ");

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
