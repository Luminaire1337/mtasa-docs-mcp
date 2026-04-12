import { describe, expect, test } from "vitest";
import { parseDocumentation, stripHtml } from "../src/utils/parser.js";
import {
  GET_LOCAL_PLAYER_HTML,
  GET_RESOURCE_ROOT_ELEMENT_HTML,
  GET_ROOT_ELEMENT_HTML,
  LEGACY_ARGUMENTS_HTML,
} from "./helpers/fixtures.js";

describe("stripHtml", () => {
  test("removes tags and decodes entities", () => {
    const value = stripHtml(
      `<div>Hello&nbsp;<b>world</b><br/>&lt;tag&gt; &amp; &#39;ok&#39;</div>`,
    );

    expect(value).toContain("Hello world");
    expect(value).toContain("<tag> & 'ok'");
    expect(value).not.toContain("<div>");
  });
});

describe("parseDocumentation", () => {
  test("extracts deprecation warning from getLocalPlayer style page", () => {
    const doc = parseDocumentation(
      GET_LOCAL_PLAYER_HTML,
      "getLocalPlayer",
      "https://wiki.multitheftauto.com/wiki/GetLocalPlayer",
    );

    expect(doc.function_name).toBe("getLocalPlayer");
    expect(doc.url).toBe("https://wiki.multitheftauto.com/wiki/GetLocalPlayer");
    expect(doc.deprecated).toBe("Use localPlayer instead");
    expect(doc.syntax).toContain("getLocalPlayer");
    expect(doc.examples).toContain("outputLocalPlayerPosition");
    expect(doc.examples).toContain("onClientPlayerDamage");
    expect(doc.related_functions).toContain("GetPlayerMapOpacity");
    expect(doc.related_functions).toContain("GetPlayerMapBoundingBox");
    expect(doc.related_functions).not.toContain("Category:");
    expect(doc.full_text.length).toBeGreaterThan(50);
  });

  test("extracts root deprecation phrasing variant", () => {
    const doc = parseDocumentation(
      GET_ROOT_ELEMENT_HTML,
      "getRootElement",
      "https://wiki.multitheftauto.com/wiki/GetRootElement",
    );

    expect(doc.deprecated).toBe("Use root instead");
    expect(doc.syntax).toContain("getRootElement");
    expect(doc.returns).toContain("root element");
  });

  test("extracts optional arguments and returns sections", () => {
    const doc = parseDocumentation(
      GET_RESOURCE_ROOT_ELEMENT_HTML,
      "getResourceRootElement",
      "https://wiki.multitheftauto.com/wiki/GetResourceRootElement",
    );

    expect(doc.deprecated).toBe("Use resourceRoot instead");
    expect(doc.parameters).toContain("Optional Arguments");
    expect(doc.parameters).toContain("theResource");
    expect(doc.returns).toContain("representing the resource's root");
    expect(doc.examples).toContain("onResourceStart");
  });

  test("uses legacy fallback for arguments and returns extraction", () => {
    const doc = parseDocumentation(LEGACY_ARGUMENTS_HTML, "doLegacyThing");

    expect(doc.parameters.toLowerCase()).toContain("arguments");
    expect(doc.parameters).toContain("string query");
    expect(doc.returns.toLowerCase()).toContain("returns");
    expect(doc.returns).toContain("bool success");
  });

  test("uses default URL when override is not provided", () => {
    const doc = parseDocumentation(GET_ROOT_ELEMENT_HTML, "getRootElement");

    expect(doc.url).toBe("https://wiki.multitheftauto.com/wiki/getRootElement");
  });
});
