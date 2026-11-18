# Module 3: Nghiệp vụ Lớp học Online nhiều học viên, PayOS theo kỳ & Hoàn tiền

Tài liệu mô tả quy trình quản lý lớp nhóm trực tuyến (`Online Group Classes`) cho phép nhiều học viên tham gia cùng một lớp, thanh toán học phí linh hoạt, học qua phòng tài liệu từng buổi, nhắc hạn tự động và xử lý rời lớp có minh chứng.

---

## 1. Các thực thể dữ liệu chính

| Model | App | Vai trò |
|---|---|---|
| `OnlineClass` | `online_classes` | Thông tin lớp (tiêu đề, môn dạy lấy từ môn gia sư đã đăng ký, lịch học hàng tuần, ngày bắt đầu/kết thúc, sĩ số tối đa, giá/buổi, giá toàn khóa, số ngày gia hạn `payment_grace_days`) |
| `OnlineClassSession` | `online_classes` | Từng buổi học trong lớp online (số thứ tự buổi, tiêu đề, ngày giờ dự kiến, lời nhắn gia sư `notes`, trạng thái `scheduled` / `completed`) |
| `OnlineClassMaterial` | `online_classes` | Tài liệu upload vào phòng của từng buổi học (`note`, `file`, `image`, `video`, `link`) |
| `OnlineClassEnrollment` | `online_classes` | Ghi danh của học viên (`pending_payment`, `active`, `completed`, `kicked_by_tutor`, `kicked_unpaid`, `cancelled`), số buổi đã đóng/đã học, hạn đóng kỳ tiếp (`next_payment_due_date`), thông tin kick & trạng thái hoàn tiền |
| `OnlineClassPayment` | `online_classes` | Nhật ký từng giao dịch đóng học phí PayOS theo ngày (`billing_cycle`, `amount`, `sessions_covered`, `payos_order_code`, `paid_at`, `status`) |
| `OnlineClassReview` | `online_classes` | Đánh giá lớp online từ học viên (`is_visible` cho phép Admin ẩn/hiện kiểm duyệt) |

---

## 2. Tạo lớp & Quản lý phòng buổi học của Gia sư

1. **Ràng buộc môn học & lịch học**:
   - Khi tạo lớp tại `/tutor/online-classes`, gia sư chỉ được chọn môn nằm trong danh sách môn đã đăng ký đang bật của chính gia sư (`TutorSubject` `is_active = True`).
   - Lịch học tuần chọn bằng checkbox thứ (`T2..CN`) + giờ bắt đầu/kết thúc + ngày kết thúc (`end_date >= start_date`).
2. **Phòng tài liệu từng buổi & Thông báo Email**:
   - Gia sư chọn buổi học trong tab **Lớp học** để thêm lời nhắn dặn dò hoặc tải lên tài liệu.
   - Mỗi lần gia sư thêm buổi học, lưu lời nhắn hoặc tải tài liệu lên buổi học, hệ thống tự động gửi email thông báo chi tiết về địa chỉ email của tất cả học viên đang học (`status = active`).
3. **Danh sách học viên & Nhật ký học phí**:
   - Trang riêng `/tutor/online-classes/:id/students` hiển thị toàn bộ học viên theo tên: Email, Số buổi đã học, Các ngày đóng học phí kèm số tiền, Tổng tiền đã đóng, Trạng thái (Đang học / Mời rời lớp) và Lý do rời lớp.

---

## 3. Thanh toán theo kỳ & Worker nhắc hạn / quá hạn tự động

- **Chu kỳ thanh toán**:
  - `per_session`: Đóng theo buổi / gói buổi định kỳ (tăng `sessions_paid_total` và tính lại `next_payment_due_date`).
  - `full_course`: Đóng trọn toàn khóa một lần.
- **Celery Tasks định kỳ** (`apps/online_classes/tasks.py`):
  1. `send_online_class_payment_reminders`: Quét các ghi danh sắp đến `next_payment_due_date` (trong vòng 2 ngày) và gửi email nhắc gia hạn học phí.
  2. `kick_overdue_unpaid_enrollments`: Nếu vượt quá `next_payment_due_date + payment_grace_days` mà học viên vẫn chưa đóng kỳ mới, tự động chuyển `status = kicked_unpaid`, `refund_amount = 0`, `refund_status = none`.

---

## 4. Nghiệp vụ Mời rời lớp (Kick) & Hoàn tiền Pro-rata

Khi gia sư mời học viên rời lớp tại `/tutor/online-classes/:id/students` (`POST /api/online-classes/tutor/enrollments/<id>/kick/`):

1. Gia sư bắt buộc nhập **lý do** (`kick_reason`), có thể đính kèm ghi chú minh chứng + file/ảnh bằng chứng (`kick_evidence_file`) và số buổi học viên thực tế đã học (`attended_sessions`).
2. **Công thức hoàn tiền theo số buổi chưa học (pro-rata)**:
   - `remaining_sessions = max(0, sessions_paid_total - attended_sessions)`
   - `refund_amount = round(total_paid_amount * (remaining_sessions / sessions_paid_total))` (nếu `sessions_paid_total > 0`, ngược lại `0`).
   - Nếu `refund_amount > 0`: đặt `refund_status = pending`; gửi email & thông báo cho học viên.
3. **Admin đối soát hoàn tiền (`/admin/online-classes` → tab Rời lớp & Hoàn tiền)**:
   - Admin xem minh chứng kick, số tiền hoàn, và **tài khoản ngân hàng + ảnh QR do học viên đã lưu trong `/profile`** (`student_bank_info`), sau đó chuyển khoản thực tế và đánh dấu **Đã hoàn tiền** (`mark_refunded`) hoặc **Từ chối** (`reject_refund`).
