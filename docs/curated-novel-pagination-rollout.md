# Rollout phân trang curated novel

Tài liệu này chỉ là runbook cho phase deploy sau. Không chạy các lệnh dưới đây trong phase code hiện tại.

1. Deploy `firestore.indexes.json` và chờ ba index curated novel ở trạng thái sẵn sàng.
2. Chạy kiểm tra migration với `DRY_RUN=true npm run migrate:novel-list-fields`.
3. Sau khi xác nhận số lượng, chạy `npm run migrate:novel-list-fields` để backfill `publication_status` và `title_lowercase` cho novel cũ.
4. Deploy backend và frontend cùng thay đổi pagination fixed 10.

Backfill phải hoàn tất trước khi backend dùng `where("publication_status", "==", "public")`; nếu không, novel cũ thiếu field này sẽ không xuất hiện trong curated lists.
