export const PERMISSION_DEFINITIONS = [
  {
    key: "admin.access",
    group: "admin",
    group_label: "Khu vực quản trị",
    label: "Truy cập khu vực quản trị",
    description: "Cho phép đăng nhập và sử dụng các trang quản trị.",
  },
  {
    key: "novels.view.own",
    group: "novels",
    group_label: "Truyện",
    label: "Xem truyện được giao",
    description: "Chỉ xem các truyện mà người dùng là dịch giả phụ trách.",
  },
  {
    key: "novels.view.any",
    group: "novels",
    group_label: "Truyện",
    label: "Xem tất cả truyện",
    description: "Xem mọi truyện trong khu vực quản trị.",
  },
  {
    key: "novels.create",
    group: "novels",
    group_label: "Truyện",
    label: "Tạo truyện",
    description: "Tạo truyện mới.",
  },
  {
    key: "novels.update.own",
    group: "novels",
    group_label: "Truyện",
    label: "Sửa truyện được giao",
    description: "Chỉnh sửa truyện mà người dùng là dịch giả phụ trách.",
  },
  {
    key: "novels.update.any",
    group: "novels",
    group_label: "Truyện",
    label: "Sửa tất cả truyện",
    description: "Chỉnh sửa mọi truyện.",
  },
  {
    key: "novels.delete.own",
    group: "novels",
    group_label: "Truyện",
    label: "Xóa truyện được giao",
    description: "Xóa truyện mà người dùng là dịch giả phụ trách.",
  },
  {
    key: "novels.delete.any",
    group: "novels",
    group_label: "Truyện",
    label: "Xóa tất cả truyện",
    description: "Xóa bất kỳ truyện nào.",
  },
  {
    key: "novels.publish",
    group: "novels",
    group_label: "Truyện",
    label: "Xuất bản truyện",
    description: "Chuyển trạng thái xuất bản giữa bản nháp và công khai.",
  },
  {
    key: "novels.feature",
    group: "novels",
    group_label: "Truyện",
    label: "Đặt truyện nổi bật",
    description: "Bật hoặc tắt trạng thái nổi bật của truyện.",
  },
  {
    key: "novels.assign_translator",
    group: "novels",
    group_label: "Truyện",
    label: "Gán dịch giả",
    description: "Thay đổi dịch giả phụ trách truyện.",
  },
  {
    key: "chapters.manage.own",
    group: "chapters",
    group_label: "Chương truyện",
    label: "Quản lý chương được giao",
    description: "Xem, tạo, sửa và xóa chương của truyện được giao.",
  },
  {
    key: "chapters.manage.any",
    group: "chapters",
    group_label: "Chương truyện",
    label: "Quản lý tất cả chương",
    description: "Xem, tạo, sửa và xóa chương của mọi truyện.",
  },
  {
    key: "genres.manage",
    group: "catalog",
    group_label: "Danh mục",
    label: "Quản lý thể loại",
    description: "Tạo, sửa và xóa thể loại.",
  },
  {
    key: "authors.manage",
    group: "catalog",
    group_label: "Danh mục",
    label: "Quản lý tác giả",
    description: "Tạo, sửa và xóa tác giả.",
  },
  {
    key: "users.view",
    group: "users",
    group_label: "Người dùng",
    label: "Xem người dùng",
    description: "Xem danh sách và thông tin người dùng.",
  },
  {
    key: "users.update",
    group: "users",
    group_label: "Người dùng",
    label: "Sửa người dùng",
    description: "Cập nhật thông tin người dùng.",
  },
  {
    key: "users.delete",
    group: "users",
    group_label: "Người dùng",
    label: "Xóa người dùng",
    description: "Xóa hồ sơ người dùng.",
  },
  {
    key: "roles.assign",
    group: "roles",
    group_label: "Vai trò và phân quyền",
    label: "Gán vai trò",
    description: "Thay đổi vai trò của người dùng.",
  },
  {
    key: "roles.manage",
    group: "roles",
    group_label: "Vai trò và phân quyền",
    label: "Quản lý vai trò",
    description: "Tạo, sửa, xóa vai trò và cấu hình quyền.",
  },
  {
    key: "credits.manage",
    group: "credits",
    group_label: "Credits",
    label: "Quản lý credits",
    description: "Nạp credits và xem lịch sử giao dịch của người dùng.",
  },
  {
    key: "subscriptions.manage",
    group: "subscriptions",
    group_label: "Đăng ký",
    label: "Quản lý đăng ký",
    description: "Xem và xóa đăng ký đọc truyện.",
  },
  {
    key: "ads.manage",
    group: "ads",
    group_label: "Quảng cáo",
    label: "Quản lý quảng cáo",
    description: "Tạo, sửa và xóa quảng cáo.",
  },
  {
    key: "media.upload",
    group: "media",
    group_label: "Tệp và hình ảnh",
    label: "Tải hình ảnh",
    description: "Tạo URL tải lên và xác nhận hình ảnh.",
  },
  {
    key: "data.push",
    group: "data",
    group_label: "Nhập dữ liệu",
    label: "Nhập dữ liệu truyện",
    description: "Đẩy metadata và nội dung chương vào hệ thống.",
  },
] as const;

export type Permission = (typeof PERMISSION_DEFINITIONS)[number]["key"];

export const ALL_PERMISSIONS = PERMISSION_DEFINITIONS.map(
  (definition) => definition.key,
) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && ALL_PERMISSIONS.includes(value as Permission);
}

export interface SystemRoleDefinition {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  is_system: true;
}

export const SYSTEM_ROLES: Record<string, SystemRoleDefinition> = {
  user: {
    id: "user",
    name: "Người dùng",
    description: "Đọc truyện và sử dụng các tính năng cá nhân.",
    permissions: [],
    is_system: true,
  },
  translator: {
    id: "translator",
    name: "Dịch giả",
    description: "Quản lý các truyện và chương được giao.",
    permissions: [
      "admin.access",
      "novels.view.own",
      "novels.create",
      "novels.update.own",
      "novels.delete.own",
      "chapters.manage.own",
    ],
    is_system: true,
  },
  admin: {
    id: "admin",
    name: "Quản trị viên",
    description: "Quản trị toàn bộ hệ thống.",
    permissions: ALL_PERMISSIONS,
    is_system: true,
  },
};

export const ADMIN_REQUIRED_PERMISSIONS: Permission[] = ["admin.access", "roles.manage"];

export function groupPermissionDefinitions() {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      permissions: (typeof PERMISSION_DEFINITIONS)[number][];
    }
  >();

  for (const definition of PERMISSION_DEFINITIONS) {
    const current = groups.get(definition.group) ?? {
      key: definition.group,
      label: definition.group_label,
      permissions: [],
    };
    current.permissions.push(definition);
    groups.set(definition.group, current);
  }

  return Array.from(groups.values());
}
