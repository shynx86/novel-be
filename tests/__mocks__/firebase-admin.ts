// Mock for firebase-admin used by tests via moduleNameMapper
import { jest } from "@jest/globals";

// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCreateUser: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockVerifyIdToken: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCreateCustomToken: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockDocGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockDocSet: any = jest.fn();

const mockApp = {
  auth: () => ({
    createUser: mockCreateUser,
    verifyIdToken: mockVerifyIdToken,
    createCustomToken: mockCreateCustomToken,
  }),
  firestore: () => ({
    collection: () => ({
      doc: () => ({
        get: mockDocGet,
        set: mockDocSet,
      }),
    }),
    listCollections: jest.fn(),
  }),
};

// biome-ignore lint/suspicious/noExplicitAny: mock module
const admin: any = {
  initializeApp: jest.fn(() => mockApp),
  app: { App: class {} },
  auth: jest.fn(),
  firestore: jest.fn(),
};

export default admin;
