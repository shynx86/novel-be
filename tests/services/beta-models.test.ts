import { describe, expect, it } from "@jest/globals";
import { getBetaModelCatalog, resolveBetaModel } from "../../src/services/ai/beta-models.js";

describe("Beta model catalog", () => {
  it("returns the backend-configured catalog and default", () => {
    expect(getBetaModelCatalog()).toEqual({
      default_model: "test-model",
      models: ["test-model", "openai/gpt-5.6-luna"],
    });
  });

  it("uses the default when no model is supplied", () => {
    expect(resolveBetaModel(undefined)).toBe("test-model");
    expect(resolveBetaModel("   ")).toBe("test-model");
  });

  it("accepts an allowed model and rejects an unknown model", () => {
    expect(resolveBetaModel(" openai/gpt-5.6-luna ")).toBe("openai/gpt-5.6-luna");
    expect(() => resolveBetaModel("unknown/model")).toThrow("Unsupported Beta model");
  });
});
