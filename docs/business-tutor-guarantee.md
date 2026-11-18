# Module 1: Nghiệp vụ Gia sư, Phê duyệt hồ sơ & Ký quỹ bảo chứng

Tài liệu mô tả quy trình nghiệp vụ cốt lõi cho luồng đăng ký gia sư, kiểm duyệt bởi Admin và cơ chế tài khoản bảo chứng (`Guarantee Deposit`) giúp bảo vệ chất lượng lớp học trên nền tảng **TutorMatch**.

---

## 1. Các thực thể dữ liệu chính

| Model | App | Vai trò |
|---|---|---|
| `CustomUser` | `users` | Lưu thông tin tài khoản, cờ `is_tutor`, `is_verified`, `is_active` và thông tin tài khoản ngân hàng (`bank_name`, `bank_account_number`, `bank_account_holder`, `bank_branch`, `bank_qr_image`) |
| `RegistrationProfile` | `users` | Hồ sơ đăng ký ban đầu (`PENDING` / `APPROVED` / `REJECTED`), CV, trình độ, trường học, môn dự kiến |
| `TutorProfile` | `tutors` | Hồ sơ giảng dạy công khai sau khi duyệt, ví cọc bảo chứng (`guarantee_deposit_balance`), nợ hoa hồng (`commission_debt`), trạng thái khóa nhận lớp (`new_class_locked`, `new_class_lock_reason`) |
| `Subject` / `TutorSubject` | `tutors` | Danh mục môn học và đơn giá 1 giờ (`hourly_rate`), đối tượng dạy (`level`), bật/tắt (`is_active`) |
| `TutorGuaranteeTransaction` | `tutors` | Sổ cái mọi biến động tiền cọc & commission của gia sư |
| `TutorPayoutRequest` | `admin_portal` | Yêu cầu nhận phần cọc còn lại (`course_deposit_release`) hoặc rút cọc rời nền tảng (`platform_exit`) kèm `qr_image` / `qr_code_url` |

---

## 2. Quy trình Đăng ký & Phê duyệt gia sư

```
Ứng viên gửi hồ sơ (/api/auth/register/tutor/)
   │
   ▼ RegistrationProfile (status = PENDING)
Admin xem & xét duyệt (/admin/tutor-approvals)
   ├── Từ chối (reject) ──► Gửi email thông báo lý do
   └── Phê duyệt (approve)
          ├─ Kích hoạt is_tutor = True, is_active = True
          ├─ Tạo / đồng bộ TutorProfile (apps.tutors) & TutorSubject
          └─ Cấp mật khẩu tạm & gửi email thông báo
```

- Hồ sơ công khai (`/api/tutors/public/<id>/`) hiển thị **CV năng lực (`cv_url`)**, học vấn, chứng chỉ, môn dạy và lịch rảnh, đồng thời ẩn hoàn toàn thông tin nhạy cảm cá nhân (`cccd_number`).
- Gia sư cập nhật môn dạy, đơn giá theo giờ, ảnh đại diện, CV và thông tin ngân hàng + QR tại cổng gia sư (`/tutor/settings`).

---

## 3. Cơ chế Ký quỹ bảo chứng (Guarantee Deposit) & Khóa nhận lớp

Để chống tình trạng nhận lớp rồi bỏ dạy hoặc chậm thanh toán phí nền tảng, nền tảng áp dụng **cọc bảo chứng tối thiểu** (cấu hình qua `SystemSetting` khóa `tutor-guarantee-required-amount`, mặc định `200.000đ`):

1. **Điều kiện nhận lớp / hiển thị tìm kiếm (`TutorPublicListView`)**:
   - `is_available = True`
   - `new_class_locked = False`
   - `guarantee_deposit_balance >= required_deposit`
   - Có ít nhất 1 `TutorSubject` đang bật (`is_active = True`)
2. **Nạp cọc bảo chứng (`POST /api/tutors/guarantee/deposit/`)**:
   - Cộng trực tiếp vào `guarantee_deposit_balance`, ghi log `deposit_topup` vào `TutorGuaranteeTransaction` và tự động mở khóa `new_class_locked` nếu đạt ngưỡng và hết điều kiện khóa.
3. **Phát sinh & Thu hồi hoa hồng (`commission_debt`)**:
   - Khi khóa học 1-1 hoàn thành (`completed`), hệ thống gọi `accrue_course_commission(course)` tính hoa hồng theo tỷ lệ `tutor-commission-rate` (mặc định `15%`), ghi `CourseCommission` và cộng vào `commission_debt`.
   - Gia sư có thể tự thanh toán nợ (`POST /api/tutors/guarantee/commission/pay/`), hoặc Admin thực hiện thu hồi / **trừ trực tiếp từ cọc bảo chứng** (`deduct_commission_debt_from_deposit`) qua màn hình Tài chính (`/admin/finance`).
   - Nếu gia sư còn nợ quá hạn hoặc số dư cọc < mức tối thiểu (`low_deposit`), hệ thống tự động đặt `new_class_locked = True` để tạm chặn nhận lớp mới cho đến khi xử lý xong công nợ/nạp thêm cọc.

---

## 4. Yêu cầu chuyển tiền & Rút khỏi nền tảng

- Gia sư gửi yêu cầu tại `/tutor/dashboard` (`POST /api/tutors/payout-requests/` hỗ trợ `multipart/form-data` để upload ảnh `qr_image`):
  - **`course_deposit_release`**: Nhận phần tiền cọc/thu nhập còn lại của 1 khóa học `completed` (tự động đối trừ phần `commission` tương ứng trước khi trả).
  - **`platform_exit`**: Rút toàn bộ số dư cọc khả dụng thực tế sau khi trừ nợ: `amount = max(0, guarantee_deposit_balance - commission_debt)`.
- Nếu gia sư chưa nhập tay `bank_info` / `qr_image`, backend tự lấy mặc định từ hồ sơ `CustomUser` (`bank_name`, `bank_account_number`, `bank_account_holder`, `bank_branch`, `bank_qr_image`).
- Admin kiểm tra số tiền, thông tin ngân hàng & ảnh QR trên `/admin/finance` và bấm **Duyệt**, **Từ chối**, hoặc **Đã chuyển** (`paid`) để khấu trừ sổ cái `TutorGuaranteeTransaction` và gửi thông báo cho gia sư.
