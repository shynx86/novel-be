import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import {
  mockBatchSet,
  mockCountGet,
  mockDocGet,
  mockQueryGet,
  mockRoleDocGet,
  mockVerifyIdToken,
} from "../__mocks__/firebase-admin.js";

const adminUser = {
  uid: "admin-1",
  email: "admin@test.com",
  display_name: "Admin",
  avatar_url: "",
  credits: 0,
  role: "admin",
};

function setupAdminAuth() {
  mockVerifyIdToken.mockResolvedValue({ uid: adminUser.uid });
  mockDocGet.mockResolvedValueOnce({ exists: true, data: () => adminUser });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("admin roles", () => {
  it("lists the built-in roles before any role document is persisted", async () => {
    setupAdminAuth();
    mockQueryGet.mockResolvedValue({ docs: [] });

    const response = await app.request("/api/admin/roles", {
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((role: { id: string }) => role.id)).toEqual(
      expect.arrayContaining(["user", "translator", "admin"]),
    );
  });

  it("persists an updated system role and writes an audit log", async () => {
    setupAdminAuth();
    mockRoleDocGet
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    const response = await app.request("/api/admin/roles/translator", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Dịch giả",
        description: "Quản lý nội dung được giao",
        permissions: ["admin.access", "novels.view.own", "novels.update.own"],
      }),
    });

    expect(response.status).toBe(200);
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor_id: "admin-1",
        role_id: "translator",
        action: "update",
      }),
    );
  });

  it("does not allow removing critical permissions from the admin role", async () => {
    setupAdminAuth();
    mockRoleDocGet
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      .mockResolvedValueOnce({ exists: false, data: () => undefined });

    const response = await app.request("/api/admin/roles/admin", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permissions: ["admin.access"] }),
    });

    expect(response.status).toBe(400);
  });
});

describe("dynamic role permissions", () => {
  const editorUser = { ...adminUser, uid: "editor-1", role: "editor" };

  it("allows a custom role to use an enabled feature", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: editorUser.uid });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => editorUser });
    mockRoleDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ permissions: ["admin.access", "genres.manage"] }),
    });
    mockCountGet.mockResolvedValue({ data: () => ({ count: 0 }) });
    mockQueryGet.mockResolvedValue({ docs: [] });

    const response = await app.request("/api/admin/genres", {
      headers: { Authorization: "Bearer editor-token" },
    });

    expect(response.status).toBe(200);
  });

  it("denies a custom role when the feature permission is disabled", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: editorUser.uid });
    mockDocGet.mockResolvedValueOnce({ exists: true, data: () => editorUser });
    mockRoleDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ permissions: ["admin.access"] }),
    });

    const response = await app.request("/api/admin/genres", {
      headers: { Authorization: "Bearer editor-token" },
    });

    expect(response.status).toBe(403);
  });
});
