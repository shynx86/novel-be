// Mock for src/config/env used by tests via moduleNameMapper
export const env = {
  port: 3000,
  nodeEnv: "test",
  projectId: "test-project",
  firebaseApiKey: "test-api-key",
  firestoreDatabaseId: "",
  version: "1.0.0",
  deepSeekApiKey: "test-deepseek-key",
  deepSeekBaseUrl: "https://api.deepseek.com",
  deepSeekModel: "test-model",
  deepSeekTimeoutMs: 90000,
  betaDefaultModel: "test-model",
  betaAllowedModels: ["test-model", "openai/gpt-5.6-luna"],
  betaMaxChapters: 10,
  betaCustomPromptMaxLength: 4000,
  betaMaxInputCharacters: 120000,
  betaPromptTemplateVersion: "v1",
};
