import { env } from "../../config/env.js";
import { ValidationError } from "../../utils/errors.js";

export interface BetaModelCatalog {
  default_model: string;
  models: string[];
}

export function getBetaModelCatalog(): BetaModelCatalog {
  return {
    default_model: env.betaDefaultModel,
    models: [...env.betaAllowedModels],
  };
}

export function resolveBetaModel(value: unknown): string {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new ValidationError("model must be a string", { field: "model" });
  }

  const model = typeof value === "string" && value.trim() ? value.trim() : env.betaDefaultModel;
  if (!model) {
    throw new ValidationError("Beta default model is not configured", {
      code: "BETA_MODEL_NOT_CONFIGURED",
    });
  }
  if (!env.betaAllowedModels.includes(model)) {
    throw new ValidationError("Unsupported Beta model", {
      field: "model",
      model,
      allowed_models: env.betaAllowedModels,
    });
  }
  return model;
}
