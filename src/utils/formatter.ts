import type { CachedDoc, MtasaFunction } from "../types/interfaces.js";

type FormatDocumentationOptions = {
  includeExamples?: boolean;
  includeOptionalArguments?: boolean;
};

const getSectionHeading = (value: string): string => {
  const [firstLine = ""] = value.split("\n", 1);
  return firstLine.trim().toLowerCase();
};

const filterOptionalArguments = (parameters: string): string => {
  const blocks = parameters
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (blocks.length === 0) {
    return "";
  }

  const hasRequiredOrGenericBlock = blocks.some((block) => {
    const heading = getSectionHeading(block);
    return (
      heading.startsWith("required arguments") ||
      heading.startsWith("arguments") ||
      heading.startsWith("parameters")
    );
  });

  const filteredBlocks = blocks.filter((block) => {
    const heading = getSectionHeading(block);
    if (!heading.startsWith("optional arguments")) {
      return true;
    }

    return !hasRequiredOrGenericBlock;
  });

  return filteredBlocks.join("\n\n");
};

const normalizeOptions = (
  optionsOrIncludeExamples?: boolean | FormatDocumentationOptions,
): Required<FormatDocumentationOptions> => {
  if (typeof optionsOrIncludeExamples === "boolean") {
    return {
      includeExamples: optionsOrIncludeExamples,
      includeOptionalArguments: true,
    };
  }

  return {
    includeExamples: optionsOrIncludeExamples?.includeExamples ?? true,
    includeOptionalArguments:
      optionsOrIncludeExamples?.includeOptionalArguments ?? true,
  };
};

export const formatDocumentation = (
  doc: CachedDoc,
  funcInfo: MtasaFunction,
  optionsOrIncludeExamples?: boolean | FormatDocumentationOptions,
): string => {
  const { includeExamples, includeOptionalArguments } = normalizeOptions(
    optionsOrIncludeExamples,
  );

  let output = `# ${funcInfo.name}\n\n`;
  output += `**Category:** ${funcInfo.category}\n`;
  output += `**Side:** ${funcInfo.side}\n`;
  output += `**URL:** ${doc.url}\n\n`;

  if (doc.deprecated) {
    output += `⚠️ **DEPRECATED:** ${doc.deprecated}\n\n`;
  }

  if (doc.description) {
    output += `## Description\n${doc.description}\n\n`;
  }

  if (doc.syntax) {
    output += `## Syntax\n`;
    const syntaxParts = doc.syntax.split("\n---\n");
    syntaxParts.forEach((syntax) => {
      output += `\`\`\`lua\n${syntax}\n\`\`\`\n\n`;
    });
  }

  const parameters = includeOptionalArguments
    ? doc.parameters
    : filterOptionalArguments(doc.parameters);

  if (parameters) {
    output += `## Parameters\n${parameters}\n\n`;
  }

  if (doc.returns) {
    output += `## Returns\n${doc.returns}\n\n`;
  }

  if (includeExamples && doc.examples) {
    output += `## Examples\n\n`;
    const exampleParts = doc.examples.split("\n---\n");
    exampleParts.forEach((example, i) => {
      output += `### Example ${i + 1}\n\`\`\`lua\n${example}\n\`\`\`\n\n`;
    });
  }

  if (doc.related_functions) {
    output += `## Related Functions\n${doc.related_functions}\n\n`;
  }

  return output;
};
