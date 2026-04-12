import { describe, expect, test } from "vitest";
import { parseDocumentation } from "../../src/utils/parser.js";

type LiveCase = {
  wikiTitle: string;
  canonicalName: string;
  alternativeTitles?: string[];
  expected: {
    syntaxIncludes?: string[];
    deprecatedIncludes?: string;
    returnsIncludes?: string;
    relatedIncludes?: string[];
    parametersIncludes?: string[];
    examplesIncludes?: string[];
    minRelatedCount?: number;
    shouldHaveDeprecated?: boolean;
    descriptionIncludes?: string;
    isEventPage?: boolean;
  };
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const fetchWikiPage = async (
  primaryTitle: string,
  alternatives: string[] = [],
): Promise<{ html: string; url: string; resolvedTitle: string }> => {
  const titles = [primaryTitle, ...alternatives];

  for (const title of titles) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const url = `https://wiki.multitheftauto.com/wiki/${title}`;

      try {
        const response = await fetch(url, {
          headers: {
            "user-agent": "mtasa-docs-mcp-live-tests/1.0",
          },
        });

        if (response.ok) {
          return {
            html: await response.text(),
            url: response.url || url,
            resolvedTitle: title,
          };
        }

        if (
          [403, 408, 425, 429, 500, 502, 503, 504].includes(response.status)
        ) {
          await sleep(250 * attempt);
          continue;
        }

        break;
      } catch {
        await sleep(250 * attempt);
      }
    }
  }

  throw new Error(
    `Failed to fetch wiki page for ${primaryTitle} after retries and alternatives.`,
  );
};

const LIVE_CASES: LiveCase[] = [
  {
    wikiTitle: "GetLocalPlayer",
    canonicalName: "getLocalPlayer",
    expected: {
      syntaxIncludes: ["getLocalPlayer"],
      deprecatedIncludes: "localPlayer",
      returnsIncludes: "local",
      shouldHaveDeprecated: true,
    },
  },
  {
    wikiTitle: "GetRootElement",
    canonicalName: "getRootElement",
    expected: {
      syntaxIncludes: ["getRootElement"],
      deprecatedIncludes: "root",
      returnsIncludes: "root",
      relatedIncludes: ["createElement"],
      shouldHaveDeprecated: true,
    },
  },
  {
    wikiTitle: "GetResourceRootElement",
    canonicalName: "getResourceRootElement",
    expected: {
      syntaxIncludes: ["getResourceRootElement"],
      deprecatedIncludes: "resourceRoot",
      returnsIncludes: "resource",
      relatedIncludes: ["getThisResource"],
      shouldHaveDeprecated: true,
      parametersIncludes: ["theResource"],
    },
  },
  {
    wikiTitle: "DbQuery",
    canonicalName: "dbQuery",
    expected: {
      syntaxIncludes: ["dbQuery"],
      returnsIncludes: "query handle",
      parametersIncludes: ["databaseConnection", "query"],
      examplesIncludes: ["dbPoll", "dbFree"],
      relatedIncludes: ["dbPoll", "dbFree"],
      minRelatedCount: 4,
      descriptionIncludes: "database query",
      shouldHaveDeprecated: false,
    },
  },
  {
    wikiTitle: "DbPoll",
    canonicalName: "dbPoll",
    expected: {
      syntaxIncludes: ["dbPoll"],
      returnsIncludes: "table",
      parametersIncludes: ["queryHandle", "timeout"],
      examplesIncludes: ["dbPoll", "dbQuery"],
      relatedIncludes: ["dbQuery"],
      minRelatedCount: 3,
      shouldHaveDeprecated: false,
    },
  },
  {
    wikiTitle: "DxDrawRectangle",
    canonicalName: "dxDrawRectangle",
    expected: {
      syntaxIncludes: ["dxDrawRectangle"],
      returnsIncludes: "true",
      parametersIncludes: ["startX", "startY", "width", "height"],
      examplesIncludes: ["onClientRender", "dxDrawRectangle"],
      relatedIncludes: ["dxDrawText", "dxDrawLine"],
      minRelatedCount: 5,
      shouldHaveDeprecated: false,
    },
  },
  {
    wikiTitle: "SetElementPosition",
    canonicalName: "setElementPosition",
    expected: {
      syntaxIncludes: ["setElementPosition"],
      returnsIncludes: "true",
      parametersIncludes: ["theElement", "x", "y", "z"],
      relatedIncludes: ["getElementPosition", "setElementFrozen"],
      minRelatedCount: 8,
      descriptionIncludes: "sets the position",
      shouldHaveDeprecated: false,
    },
  },
  {
    wikiTitle: "SetElementFrozen",
    canonicalName: "setElementFrozen",
    expected: {
      syntaxIncludes: ["setElementFrozen"],
      returnsIncludes: "true",
      parametersIncludes: ["theElement", "freezeStatus"],
      relatedIncludes: ["isElementFrozen", "setElementPosition"],
      minRelatedCount: 8,
      descriptionIncludes: "freezes an element",
      shouldHaveDeprecated: false,
    },
  },
  {
    wikiTitle: "OnClientResourceStart",
    canonicalName: "onClientResourceStart",
    alternativeTitles: ["onClientResourceStart"],
    expected: {
      parametersIncludes: ["startedResource"],
      examplesIncludes: ["addEventHandler", "onClientResourceStart"],
      relatedIncludes: ["onClientResourceStop", "triggerServerEvent"],
      minRelatedCount: 4,
      descriptionIncludes: "resource",
      shouldHaveDeprecated: false,
      isEventPage: true,
    },
  },
  {
    wikiTitle: "OnResourceStart",
    canonicalName: "onResourceStart",
    alternativeTitles: ["onResourceStart"],
    expected: {
      parametersIncludes: ["startedResource"],
      examplesIncludes: ["addEventHandler", "onResourceStart"],
      relatedIncludes: ["onResourceStop", "addEventHandler"],
      minRelatedCount: 4,
      descriptionIncludes: "resource",
      shouldHaveDeprecated: false,
      isEventPage: true,
    },
  },
  {
    wikiTitle: "OnClientRender",
    canonicalName: "onClientRender",
    alternativeTitles: ["onClientRender"],
    expected: {
      parametersIncludes: ["none"],
      examplesIncludes: ["onClientRender", "setCameraMatrix"],
      relatedIncludes: ["onClientPreRender", "onClientHUDRender"],
      minRelatedCount: 4,
      descriptionIncludes: "every time",
      shouldHaveDeprecated: false,
      isEventPage: true,
    },
  },
  {
    wikiTitle: "SetVehicleFrozen",
    canonicalName: "setVehicleFrozen",
    expected: {
      syntaxIncludes: ["setVehicleFrozen"],
      deprecatedIncludes: "setElementFrozen",
      returnsIncludes: "true",
      parametersIncludes: ["theVehicle", "freezeStatus"],
      relatedIncludes: ["isVehicleOnGround", "setVehicleLocked"],
      minRelatedCount: 8,
      shouldHaveDeprecated: true,
      descriptionIncludes: "freezes a vehicle",
    },
  },
  {
    wikiTitle: "SetPlayerChoking",
    canonicalName: "setPlayerChoking",
    expected: {
      syntaxIncludes: ["setPlayerChoking"],
      deprecatedIncludes: "setPedChoking",
      returnsIncludes: "true",
      parametersIncludes: ["thePlayer", "choking"],
      relatedIncludes: ["getPlayerName", "setPlayerMoney"],
      minRelatedCount: 5,
      shouldHaveDeprecated: true,
      descriptionIncludes: "choking animation",
    },
  },
];

describe.sequential("live wiki parser integration", () => {
  for (const liveCase of LIVE_CASES) {
    test(`parses ${liveCase.wikiTitle} with expected core fields`, async () => {
      const fetched = await fetchWikiPage(
        liveCase.wikiTitle,
        liveCase.alternativeTitles,
      );

      const parsed = parseDocumentation(
        fetched.html,
        liveCase.canonicalName,
        fetched.url,
      );

      expect(parsed.description.length).toBeGreaterThan(20);
      if (!liveCase.expected.isEventPage) {
        expect(parsed.syntax.length).toBeGreaterThan(5);
      }
      if (liveCase.expected.isEventPage) {
        expect(parsed.parameters.length).toBeGreaterThan(5);
      } else {
        expect(parsed.returns.length).toBeGreaterThan(5);
      }
      expect(parsed.full_text.length).toBeGreaterThan(40);
      expect(parsed.url.toLowerCase()).toContain(
        fetched.resolvedTitle.toLowerCase(),
      );

      if (liveCase.expected.descriptionIncludes) {
        expect(parsed.description.toLowerCase()).toContain(
          liveCase.expected.descriptionIncludes.toLowerCase(),
        );
      }

      if (liveCase.expected.shouldHaveDeprecated === false) {
        expect(parsed.deprecated ?? "").toBe("");
      }

      if (liveCase.expected.shouldHaveDeprecated === true) {
        expect(parsed.deprecated).toBeTruthy();
      }

      for (const syntaxNeedle of liveCase.expected.syntaxIncludes ?? []) {
        expect(parsed.syntax.toLowerCase()).toContain(
          syntaxNeedle.toLowerCase(),
        );
      }

      for (const parameterNeedle of liveCase.expected.parametersIncludes ??
        []) {
        expect(parsed.parameters.toLowerCase()).toContain(
          parameterNeedle.toLowerCase(),
        );
      }

      for (const exampleNeedle of liveCase.expected.examplesIncludes ?? []) {
        expect(parsed.examples.toLowerCase()).toContain(
          exampleNeedle.toLowerCase(),
        );
      }

      if (liveCase.expected.deprecatedIncludes) {
        expect((parsed.deprecated ?? "").toLowerCase()).toContain(
          liveCase.expected.deprecatedIncludes.toLowerCase(),
        );
      }

      if (liveCase.expected.returnsIncludes) {
        const returnsNormalized = parsed.returns.toLowerCase();
        const fullTextNormalized = parsed.full_text.toLowerCase();
        const expectedNeedle = liveCase.expected.returnsIncludes.toLowerCase();

        expect(
          returnsNormalized.includes(expectedNeedle) ||
            fullTextNormalized.includes(expectedNeedle),
        ).toBe(true);
      }

      for (const relatedNeedle of liveCase.expected.relatedIncludes ?? []) {
        expect(parsed.related_functions.toLowerCase()).toContain(
          relatedNeedle.toLowerCase(),
        );
      }

      if (liveCase.expected.minRelatedCount) {
        const relatedCount = parsed.related_functions
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0).length;
        expect(relatedCount).toBeGreaterThanOrEqual(
          liveCase.expected.minRelatedCount,
        );
      }
    });
  }
});
