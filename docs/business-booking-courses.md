# Module 2: Nghiệp vụ Đặt lịch (Booking 1-1), Khóa học, Hủy khóa & Hoàn cọc

Tài liệu mô tả toàn bộ vòng đời từ lúc học viên đặt lịch với gia sư 1-1 đến khi thanh toán cọc qua PayOS, triển khai buổi học trong khóa học, gia hạn hoặc hủy khóa & hoàn tiền.

---

## 1. Các thực thể dữ liệu chính

| Model | App | Vai trò |
|---|---|---|
| `TeachingSlot` | `bookings` | Khung giờ rảnh theo tuần/ngày của gia sư (`available` / `booked` / `cancelled`) |
| `Booking` | `bookings` | Yêu cầu đặt lịch học 1-1 (`pending` / `approved` / `confirmed` / `cancelled` / `completed`) & trạng thái thanh toán (`payment_status`) |
| `Course` | `courses` | Khóa học chính thức sinh ra sau khi booking thanh toán cọc thành công (`active` / `completed` / `paused` / `cancelled`) |
| `CourseSession` | `courses` | Từng buổi học trong khóa (ngày học, giờ học, trạng thái hoàn thành từ học viên/gia sư) |
| `CourseMaterial` | `courses` | Tài liệu, ghi chú, hình ảnh, video, link gắn với từng buổi học |
| `CourseCancellationRequest` | `courses` | Yêu cầu hủy khóa + thông tin ngân hàng/QR để admin xét duyệt hoàn cọc |
| `CourseExtensionRequest` | `courses` | Yêu cầu gia hạn ngày kết thúc / lịch khóa học |
| `CourseReview` | `courses` | Đánh giá sao (1–5★) và nhận xét của học viên cho khóa 1-1 |

---

## 2. Luồng Đặt lịch & Thanh toán cọc PayOS

```
1. Học viên chọn gia sư & khung giờ ──► POST /api/bookings/ (status = pending)
                                            │
2. Gia sư kiểm tra & duyệt (/tutor/bookings)│
   ├── Từ chối ──► Booking cancelled, trả lại TeachingSlot (available)
   └── Duyệt   ──► Booking approved (chờ học viên đặt cọc 20%)
                      │
3. Học viên bấm "Thanh toán cọc" (/registration-history)
   ──► Tạo link PayOS & chuyển hướng checkout
                      │
4. PayOS Webhook / Verify (/payment/success)
   ├─ Xác thực atomic: Booking -> confirmed, payment_status -> paid
   └─ Tự động khởi tạo Course + các CourseSession theo lịch tuần
```

- **Chống trùng lịch & race condition**: Xác thực thanh toán PayOS chạy trong transaction atomic với idempotency check (`test_paid_verify_is_idempotent`) đảm bảo không tạo trùng nhiều `Course` cho cùng một `Booking`.

---

## 3. Quản lý Buổi học, Tài liệu & Hoàn thành khóa

- **Phòng tài liệu theo buổi**: Gia sư thêm ghi chú/file/ảnh/link/video ở `/tutor/courses/:id` (`POST /api/courses/tutor/<id>/materials/`). Học viên theo dõi từng buổi ở `/my-courses/:id` và `/my-courses/:id/sessions/:sessionId`.
- **Điểm danh hoàn thành buổi & kết thúc khóa**:
  - Học viên xác nhận hoàn thành từng buổi (`student_completed = True`).
  - Khi đủ số buổi (`completed_sessions == total_sessions`) hoặc Admin/hệ thống chuyển trạng thái sang `completed`, hệ thống tự động gọi `accrue_course_commission(course)` để chốt hoa hồng của khóa và đồng bộ bảng thống kê doanh thu gia sư.

---

## 4. Nghiệp vụ Hủy khóa 1-1 & Hoàn cọc

- Học viên hoặc Gia sư có thể gửi yêu cầu hủy khóa tại trang chi tiết khóa (`POST /api/courses/<id>/cancel-request/`).
- **Quy tắc hoàn cọc mặc định**:
  - Nếu khóa học **chưa hoàn thành buổi nào** (`completed_sessions == 0`): Đủ điều kiện đề xuất hoàn cọc (`refund_required = True`).
  - Thông tin ngân hàng hoàn tiền (`bank_name`, `bank_account_number`, `bank_account_name`, `bank_branch`, `refund_qr`) được **tự động điền sẵn từ hồ sơ ngân hàng của học viên** (`CustomUser`) và hỗ trợ ghi đè hoặc upload ảnh QR riêng cho giao dịch hủy.
- Admin kiểm tra tại mục **Lớp học & Hủy khóa → Yêu cầu hủy khóa** (`/admin/course-cancellations`):
  - **Duyệt hủy (`approve`)**: Chuyển khóa sang `cancelled`, ghi log số tiền hoàn cho học viên (được đưa vào chi phí hoàn tiền trên Báo cáo hệ thống), và gửi thông báo cho học viên & gia sư.
  - **Từ chối (`reject`)**: Giữ nguyên trạng thái khóa học và gửi lý do từ chối cho người yêu cầu.
