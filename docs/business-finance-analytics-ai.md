# Module 4: Nghiệp vụ Tài chính, Báo cáo Lợi nhuận, BXH & Ứng dụng AI

Tài liệu mô tả hệ thống đối soát tài chính tập trung, báo cáo doanh thu - lợi nhuận của Admin, thống kê hiệu suất của Gia sư và các tính năng AI hỗ trợ học tập/giảng dạy/vận hành.

---

## 1. Tài khoản ngân hàng & Ảnh mã QR nhận/hoàn tiền

- Cả **Học viên** (`/profile`) và **Gia sư** (`/tutor/settings`, `/tutor/dashboard`) đều có thể cấu hình tài khoản ngân hàng (`bank_name`, `bank_account_number`, `bank_account_holder`, `bank_branch`) và tải lên **ảnh mã QR chuyển khoản** (`bank_qr_image`).
- Admin có thể xem trực tiếp thông tin ngân hàng & ảnh QR của từng học viên ở nút **Xem chi tiết học viên** (icon mắt tại `/admin/users`), tại màn hình **Yêu cầu hủy khóa** (`/admin/course-cancellations`), **Hoàn tiền lớp online** (`/admin/online-classes`), và tại cột **Yêu cầu chuyển tiền của gia sư** (`/admin/finance`).

---

## 2. Báo cáo Doanh thu, Lợi nhuận Hệ thống & Bảng xếp hạng

### 2.1 Báo cáo tài chính Admin (`/admin/reports` — `AdminReportView`)
Dữ liệu được tổng hợp theo tháng/năm lựa chọn kèm chuỗi **12 tháng trong năm** (`monthly_series`) và hỗ trợ xuất **CSV (UTF-8 BOM)**:

- **Tổng doanh thu hệ thống (GMV)**: `booking_revenue` (Booking 1-1 đã thanh toán) + `online_class_revenue` (giao dịch PayOS lớp online thành công).
- **Lợi nhuận hệ thống (`system_profit`)**: `commission_collected` (hoa hồng thực thu / trừ cọc từ khóa 1-1) + `online_platform_fee` (`online_class_revenue * commission_rate`).
- **Hoàn tiền & Chi trả cọc**: Tổng tiền hoàn trả cho học viên (`course_refunds + online_refunds`) và tổng tiền cọc đã giải ngân cho gia sư (`tutor_payouts_paid`).
- **Dòng tiền ròng (`net_cashflow`)**: `max(0, total_system_revenue - total_refunds - tutor_payouts_paid)`.

### 2.2 Báo cáo Thống kê Gia sư (`/tutor/analytics` — `TutorAnalyticsView`)
Hỗ trợ 4 chế độ thời gian **Tuần / Tháng / Quý / Năm**:
- Tổng số buổi đã dạy, tổng tiền kiếm được (gộp), thực nhận sau khấu trừ (hoa hồng + hoàn tiền do hủy/kick).
- Bảng kê chi tiết **từng khoản khấu trừ** để giải thích minh bạch mức chênh lệch giữa doanh thu gộp và thực nhận.
- Danh sách khóa 1-1 trong kỳ, lớp online trong kỳ, đánh giá nhận được và **Bảng xếp hạng doanh thu gia sư** (chọn độc lập theo tháng, quý, năm).

### 2.3 BXH Gia sư Admin (`/admin/tutor-rankings`)
Gồm 2 bảng song song:
- **BXH Doanh thu cao**: Vinh danh gia sư có doanh thu & điểm đánh giá tốt.
- **BXH Doanh thu kém**: Liệt kê gia sư doanh thu `0đ` hoặc hiệu suất thấp kèm thao tác **AI Phân tích**, **Tạo trao đổi nhắc nhở**, hoặc **Loại bỏ / Khóa tài khoản** khỏi nền tảng.

---

## 3. Các tính năng AI tích hợp (`ai_service` + `ai_proxy`)

Hệ thống tích hợp microservice FastAPI (`ai_service`, cổng `8010`) với cơ chế fallback heuristic an toàn khi thiếu/lỗi OpenAI key:

1. **AI Lộ trình học & Ghép gia sư / Lớp online (`/api/ai/learning-roadmap/`)**:
   - Dành cho học viên/khách ở trang Lớp học online & Tìm gia sư: phân tích mục tiêu, thời lượng tuần, ngân sách để tạo lộ trình theo giai đoạn và gợi ý gia sư/lớp phù hợp nhất từ database.
2. **AI Soạn giáo án & Bài tập theo buổi (`/api/ai/lesson-assistant/`)**:
   - Dành cho gia sư trong phòng tài liệu lớp online: sinh khung bài giảng, câu hỏi luyện tập kèm gợi ý và lời nhắn gửi học viên; lưu thành tài liệu và gửi email 1 chạm.
3. **AI Cố vấn hiệu suất & Đánh giá rủi ro (`/api/ai/performance-insights/`)**:
   - Phân tích số liệu thực tế của gia sư (hoặc đánh giá gia sư doanh thu kém ở phía Admin) để đề xuất hành động cải thiện doanh thu & giữ chân học viên.
4. **AI Kiểm duyệt đánh giá (`moderate_course_review`)**:
   - Chạy bất đồng bộ qua Celery worker (`payments`/`ai` queue) kiểm tra ngôn từ phản cảm trên đánh giá mới.

---

## 4. Phân trang chuẩn toàn hệ thống (`10 bản ghi/trang`)

- Backend (`core/pagination.py`): Áp dụng `StandardResultsSetPagination` (`PAGE_SIZE = 10`) và `paginate_if_requested` thực hiện SQL `COUNT` + `LIMIT/OFFSET` trước khi serialize trên các endpoint công khai và quản trị.
- Frontend (`src/components/ui/Pagination.tsx`): Dùng chung component `<Pagination />` và hook `useClientPagination` (`10 bản ghi/trang`) đồng bộ giao diện ở tất cả cổng **Admin**, **Gia sư** và **Học viên**.
