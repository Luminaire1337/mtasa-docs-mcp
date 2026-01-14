import type { CachedDoc, MtasaFunction } from "../types/interfaces.js";

export const formatDocumentation = (
  doc: CachedDoc,
  funcInfo: MtasaFunction,
  includeExamples: boolean = true
): string => {
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

  if (doc.parameters) {
    output += `## Parameters\n${doc.parameters}\n\n`;
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
