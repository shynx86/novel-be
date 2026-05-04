/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^firebase-admin$": "<rootDir>/tests/__mocks__/firebase-admin.ts",
    "(.+)/config/env\\.js$": "<rootDir>/tests/__mocks__/config-env.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
