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

// Role documents use dedicated mocks so authorization reads do not consume
// service-level document responses in existing route tests.
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockRoleDocGet: any = jest.fn(async () => ({
  exists: false,
  data: () => undefined,
}));
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockRoleDocSet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockRoleDocDelete: any = jest.fn();

// Collection-level mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCollectionAdd: any = jest.fn();

// Query mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockQueryGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCountGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockQueryWhere: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockQueryOrderBy: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockQueryLimit: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockQueryOffset: any = jest.fn();

// Transaction mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockRunTransaction: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionGet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionSet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionUpdate: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockTransactionDelete: any = jest.fn();

// Batch mocks
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockBatchDelete: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockBatchSet: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockBatchUpdate: any = jest.fn();
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockBatchCommit: any = jest.fn();

// getAll mock (for batch fetching multiple documents)
// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockGetAll: any = jest.fn();

// FieldValue sentinel mock
const FieldValue = {
  increment: jest.fn((n: number) => ({ _increment: n })),
  delete: jest.fn(() => ({ _delete: true })),
};

// biome-ignore lint/suspicious/noExplicitAny: mock module
mockRunTransaction.mockImplementation(async (fn: any) => {
  const transaction = {
    get: mockTransactionGet,
    set: mockTransactionSet,
    update: mockTransactionUpdate,
    delete: mockTransactionDelete,
  };
  return fn(transaction);
});

// Create a chainable query builder
function createQueryBuilder() {
  // biome-ignore lint/suspicious/noExplicitAny: mock module
  const builder: Record<string, any> = {};
  builder.where = jest.fn((...args: unknown[]) => {
    mockQueryWhere(...args);
    return builder;
  });
  builder.orderBy = jest.fn((...args: unknown[]) => {
    mockQueryOrderBy(...args);
    return builder;
  });
  builder.startAt = jest.fn(() => builder);
  builder.endAt = jest.fn(() => builder);
  builder.limit = jest.fn((...args: unknown[]) => {
    mockQueryLimit(...args);
    return builder;
  });
  builder.offset = jest.fn((...args: unknown[]) => {
    mockQueryOffset(...args);
    return builder;
  });
  builder.select = jest.fn(() => builder);
  builder.get = mockQueryGet;
  builder.count = jest.fn(() => ({ get: mockCountGet }));
  return builder;
}

// Create a doc reference mock
function createDocRef(id?: string, collectionName?: string) {
  return {
    id,
    get: collectionName === "roles" ? mockRoleDocGet : mockDocGet,
    set: collectionName === "roles" ? mockRoleDocSet : mockDocSet,
    update: mockDocUpdate,
    delete: collectionName === "roles" ? mockRoleDocDelete : mockDocDelete,
    recursiveDelete: jest.fn(),
    collection: jest.fn(() => createCollectionRef()),
  };
}

// Create a collection reference mock with query builder support
function createCollectionRef(collectionName?: string) {
  const builder = createQueryBuilder();
  return {
    doc: jest.fn((id?: string) => createDocRef(id, collectionName)),
    add: mockCollectionAdd,
    where: builder.where,
    orderBy: builder.orderBy,
    startAt: builder.startAt,
    endAt: builder.endAt,
    limit: builder.limit,
    offset: builder.offset,
    select: builder.select,
    get: builder.get,
    count: builder.count,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: mock module
export const mockCollectionGroup: any = jest.fn(() => createQueryBuilder());

const mockApp = {
  auth: () => ({
    createUser: mockCreateUser,
    verifyIdToken: mockVerifyIdToken,
    createCustomToken: mockCreateCustomToken,
  }),
  firestore: () => ({
    collection: jest.fn((name: string) => createCollectionRef(name)),
    collectionGroup: mockCollectionGroup,
    listCollections: jest.fn(),
    runTransaction: mockRunTransaction,
    getAll: mockGetAll,
    batch: jest.fn(() => ({
      delete: mockBatchDelete,
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
  }),
};

// firestore is both callable and has FieldValue property
const firestoreFn = jest.fn(() => ({
  collection: jest.fn((name: string) => createCollectionRef(name)),
  collectionGroup: mockCollectionGroup,
  listCollections: jest.fn(),
  runTransaction: mockRunTransaction,
  getAll: mockGetAll,
  batch: jest.fn(() => ({
    delete: mockBatchDelete,
    set: mockBatchSet,
    update: mockBatchUpdate,
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
