import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getMetadataMock = vi.hoisted(() => vi.fn());
const searchByVectorMock = vi.hoisted(() => vi.fn());

vi.mock("../src/database/queries.js", () => {
  return {
    getMetadata: getMetadataMock,
    searchByVector: searchByVectorMock,
  };
});

import { findRelatedFunctions } from "../src/utils/search.js";
import { allFunctions } from "../src/utils/loader.js";
import type { MtasaFunction } from "../src/types/interfaces.js";

const makeFunc = (
  name: string,
  category = "Client Functions",
  side: MtasaFunction["side"] = "client",
): MtasaFunction => ({
  name,
  type: 6,
  category,
  side,
});

describe("findRelatedFunctions", () => {
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    allFunctions.clear();
    getMetadataMock.mockReset();
    searchByVectorMock.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  test("returns vector results first and removes duplicates", () => {
    const dbQuery = makeFunc("dbQuery", "Server Functions", "server");
    const dbPoll = makeFunc("dbPoll", "Server Functions", "server");

    allFunctions.set(dbQuery.name, dbQuery);
    allFunctions.set(dbPoll.name, dbPoll);

    searchByVectorMock.mockReturnValue([
      { function_name: "dbQuery", distance: 0.12 },
      { function_name: "dbQuery", distance: 0.15 },
      { function_name: "dbPoll", distance: 0.2 },
    ]);

    getMetadataMock.mockImplementation((name: string) => {
      if (name === "dbQuery") return dbQuery;
      if (name === "dbPoll") return dbPoll;
      return undefined;
    });

    const results = findRelatedFunctions("database query", 5);

    expect(results.map((x) => x.name)).toEqual(["dbQuery", "dbPoll"]);
  });

  test("falls back to keyword matching when vector search fails", () => {
    searchByVectorMock.mockImplementation(() => {
      throw new Error("vector unavailable");
    });

    const funcs = [
      makeFunc("dbQuery", "Server Functions", "server"),
      makeFunc("dbPoll", "Server Functions", "server"),
      makeFunc("guiCreateWindow"),
      makeFunc("outputChatBox"),
    ];

    for (const func of funcs) {
      allFunctions.set(func.name, func);
    }

    const results = findRelatedFunctions("database query", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toBe("dbQuery");
    expect(results.map((x) => x.name)).toContain("dbPoll");
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  test("uses alias expansion for GUI related queries", () => {
    searchByVectorMock.mockReturnValue([]);

    const guiCreateWindow = makeFunc("guiCreateWindow");
    const dgsCreateWindow = makeFunc("dgsCreateWindow");
    const vehicleFix = makeFunc("fixVehicle", "Server Functions", "server");

    allFunctions.set(guiCreateWindow.name, guiCreateWindow);
    allFunctions.set(dgsCreateWindow.name, dgsCreateWindow);
    allFunctions.set(vehicleFix.name, vehicleFix);

    const results = findRelatedFunctions("create interface window", 2);
    const names = results.map((x) => x.name);

    expect(names).toContain("guiCreateWindow");
    expect(names).toContain("dgsCreateWindow");
  });

  test("honors result limit", () => {
    searchByVectorMock.mockReturnValue([]);

    for (let i = 0; i < 10; i++) {
      const func = makeFunc(`dbQuery${i}`, "Server Functions", "server");
      allFunctions.set(func.name, func);
    }

    const results = findRelatedFunctions("database", 4);
    expect(results).toHaveLength(4);
  });
});
