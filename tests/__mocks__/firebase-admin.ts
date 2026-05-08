// Mock for firebase-admin used by tests via moduleNameMapper
import { jest } from "@jest/globals";

// Auth mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCreateUser: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockVerifyIdToken: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCreateCustomToken: any = jest.fn();

// Document-level mocks (shared across all collection/doc paths)
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockDocGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockDocSet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockDocUpdate: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockDocDelete: any = jest.fn();

// Collection-level mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCollectionAdd: any = jest.fn();

// Query mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockQueryGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCountGet: any = jest.fn();

// Transaction mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockRunTransaction: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionSet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionUpdate: any = jest.fn();

// Batch mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockBatchDelete: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockBatchCommit: any = jest.fn();

// FieldValue sentinel mock
const FieldValue = {
  increment: jest.fn((n: number) => ({ _increment: n })),
};

// biome-ignore lint/suspicious/noExplicitAny: mock module
mockRunTransaction.mockImplementation(async (fn: any) => {
  const transaction = {
    get: mockTransactionGet,
    set: mockTransactionSet,
    update: mockTransactionUpdate,
  };
  return fn(transaction);
});

// Create a chainable query builder
function createQueryBuilder() {
  // biome-ignore lint/suspicious/noExplicitAny: mock module
  const builder: Record<string, any> = {};
  builder.where = jest.fn(() => builder);
  builder.orderBy = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.offset = jest.fn(() => builder);
  builder.select = jest.fn(() => builder);
  builder.get = mockQueryGet;
  builder.count = jest.fn(() => ({ get: mockCountGet }));
  return builder;
}

// Create a doc reference mock
function createDocRef() {
  return {
    get: mockDocGet,
    set: mockDocSet,
    update: mockDocUpdate,
    delete: mockDocDelete,
    collection: jest.fn(() => createCollectionRef()),
  };
}

// Create a collection reference mock with query builder support
function createCollectionRef() {
  const builder = createQueryBuilder();
  return {
    doc: jest.fn(() => createDocRef()),
    add: mockCollectionAdd,
    where: builder.where,
    orderBy: builder.orderBy,
    limit: builder.limit,
    offset: builder.offset,
    select: builder.select,
    get: builder.get,
    count: builder.count,
  };
}

const mockApp = {
  auth: () => ({
    createUser: mockCreateUser,
    verifyIdToken: mockVerifyIdToken,
    createCustomToken: mockCreateCustomToken,
  }),
  firestore: () => ({
    collection: jest.fn(() => createCollectionRef()),
    listCollections: jest.fn(),
    runTransaction: mockRunTransaction,
    batch: jest.fn(() => ({
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    })),
  }),
};

// firestore is both callable and has FieldValue property
const firestoreFn = jest.fn(() => ({
  collection: jest.fn(() => createCollectionRef()),
  listCollections: jest.fn(),
  runTransaction: mockRunTransaction,
  batch: jest.fn(() => ({
    delete: mockBatchDelete,
    commit: mockBatchCommit,
  })),
}));
// biome-ignore lint/suspicious/noExplicitAny: mock module
(firestoreFn as any).FieldValue = FieldValue;

// biome-ignore lint/suspicious/noExplicitAny: mock module
const admin: any = {
  initializeApp: jest.fn(() => mockApp),
  app: { App: class {} },
  auth: jest.fn(),
  firestore: firestoreFn,
};

export default admin;
