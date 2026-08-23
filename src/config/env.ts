function parseCommaSeparatedList(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const legacyBetaModel = process.env.DEEPSEEK_MODEL?.trim() || "";
const configuredBetaModels = parseCommaSeparatedList(process.env.BETA_ALLOWED_MODELS);
const betaDefaultModel =
  process.env.BETA_DEFAULT_MODEL?.trim() || legacyBetaModel || configuredBetaModels[0] || "";
const betaAllowedModels = [...new Set([betaDefaultModel, ...configuredBetaModels].filter(Boolean))];

export const env = {
  port: Number.parseInt(process.env.SERVER_PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || "",
  firebaseApiKey: process.env.WEB_API_KEY || "",
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "",
  version: process.env.npm_package_version || "1.0.0",
  deepSeekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepSeekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  deepSeekModel: process.env.DEEPSEEK_MODEL || "",
  deepSeekTimeoutMs: Number.parseInt(process.env.DEEPSEEK_TIMEOUT_MS || "90000", 10),
  betaDefaultModel,
  betaAllowedModels,
  betaMaxChapters: Number.parseInt(process.env.BETA_MAX_CHAPTERS || "10", 10),
  betaCustomPromptMaxLength: Number.parseInt(
    process.env.BETA_CUSTOM_PROMPT_MAX_LENGTH || "4000",
    10,
  ),
  betaMaxInputCharacters: Number.parseInt(process.env.BETA_MAX_INPUT_CHARACTERS || "120000", 10),
  betaPromptTemplateVersion: process.env.BETA_PROMPT_TEMPLATE_VERSION || "v1",
} as const;
