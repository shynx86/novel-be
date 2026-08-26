import { describe, expect, it } from "@jest/globals";
import { getBetaModelCatalog, resolveBetaModel } from "../../src/services/ai/beta-models.js";

describe("Beta model catalog", () => {
  it("returns the backend-configured catalog and default", () => {
    expect(getBetaModelCatalog()).toEqual({
      default_model: "test-model",
      models: [
        "test-model",
        "openai/gpt-5.6-luna",
        "google/gemini-2.5-flash-lite",
        "inclusionai/ling-2.6-flash",
        "openai/gpt-5-nano",
        "google/gemini-3.7-flash",
        "xiaomi/mimo-v2.5",
        "qwen/qwen3.7-flash",
      ],
    });
  });

  it("uses the default when no model is supplied", () => {
    expect(resolveBetaModel(undefined)).toBe("test-model");
    expect(resolveBetaModel("   ")).toBe("test-model");
  });

  it.each([
    "openai/gpt-5.6-luna",
    "google/gemini-2.5-flash-lite",
    "inclusionai/ling-2.6-flash",
    "openai/gpt-5-nano",
    "google/gemini-3.7-flash",
    "xiaomi/mimo-v2.5",
    "qwen/qwen3.7-flash",
  ])("accepts allowed model %s", (model) => {
    expect(resolveBetaModel(` ${model} `)).toBe(model);
  });

  it("rejects an unknown model", () => {
    expect(() => resolveBetaModel("unknown/model")).toThrow("Unsupported Beta model");
  });
});
