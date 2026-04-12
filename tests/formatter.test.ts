import { describe, expect, test } from "vitest";
import { formatDocumentation } from "../src/utils/formatter.js";
import type { CachedDoc, MtasaFunction } from "../src/types/interfaces.js";

const baseFunc: MtasaFunction = {
  name: "getLocalPlayer",
  type: 6,
  category: "Client Functions",
  side: "client",
};

const baseDoc: CachedDoc = {
  function_name: "getLocalPlayer",
  url: "https://wiki.multitheftauto.com/wiki/GetLocalPlayer",
  description: "Gets the local player element.",
  syntax: "player getLocalPlayer ( )",
  examples:
    "outputConsole(getPlayerName(localPlayer))\n---\noutputChatBox(getPlayerName(localPlayer))",
  parameters: "None",
  returns: "Returns player element",
  related_functions: "getRootElement, getThisResource",
  full_text: "full text",
  timestamp: Date.now(),
  deprecated: "Use localPlayer instead",
};

describe("formatDocumentation", () => {
  test("includes all major sections and deprecation warning", () => {
    const formatted = formatDocumentation(baseDoc, baseFunc, true);

    expect(formatted).toContain("# getLocalPlayer");
    expect(formatted).toContain("**Category:** Client Functions");
    expect(formatted).toContain("**Side:** client");
    expect(formatted).toContain("⚠️ **DEPRECATED:** Use localPlayer instead");
    expect(formatted).toContain("## Description");
    expect(formatted).toContain("## Syntax");
    expect(formatted).toContain("## Parameters");
    expect(formatted).toContain("## Returns");
    expect(formatted).toContain("## Examples");
    expect(formatted).toContain("### Example 1");
    expect(formatted).toContain("### Example 2");
    expect(formatted).toContain("## Related Functions");
  });

  test("omits examples section when includeExamples is false", () => {
    const formatted = formatDocumentation(baseDoc, baseFunc, false);
    expect(formatted).not.toContain("## Examples");
    expect(formatted).toContain("## Description");
  });

  test("handles sparse docs without adding empty sections", () => {
    const sparse: CachedDoc = {
      ...baseDoc,
      description: "",
      syntax: "",
      parameters: "",
      returns: "",
      examples: "",
      related_functions: "",
      deprecated: null,
    };

    const formatted = formatDocumentation(sparse, baseFunc, true);
    expect(formatted).not.toContain("## Description");
    expect(formatted).not.toContain("## Syntax");
    expect(formatted).not.toContain("## Parameters");
    expect(formatted).not.toContain("## Returns");
    expect(formatted).not.toContain("## Examples");
    expect(formatted).not.toContain("## Related Functions");
  });

  test("hides optional arguments when explicitly disabled", () => {
    const withOptionalArgs: CachedDoc = {
      ...baseDoc,
      parameters:
        "Required Arguments\nplayer target\n\nOptional Arguments\nint timeout=5000",
    };

    const formatted = formatDocumentation(withOptionalArgs, baseFunc, {
      includeExamples: true,
      includeOptionalArguments: false,
    });

    expect(formatted).toContain("Required Arguments");
    expect(formatted).not.toContain("Optional Arguments");
  });

  test("keeps optional arguments when there are no required arguments", () => {
    const optionalOnly: CachedDoc = {
      ...baseDoc,
      parameters: "Optional Arguments\nint timeout=5000",
    };

    const formatted = formatDocumentation(optionalOnly, baseFunc, {
      includeExamples: true,
      includeOptionalArguments: false,
    });

    expect(formatted).toContain("Optional Arguments");
  });
});
