from django.conf import settings
from django.db import models


class OnlineClass(models.Model):
    BILLING_CYCLE_CHOICES = [
        ("per_session", "Theo buổi"),
        ("full_course", "Toàn khóa"),
    ]
    STATUS_CHOICES = [
        ("open", "Đang mở đăng ký"),
        ("ongoing", "Đang diễn ra"),
        ("completed", "Hoàn thành"),
        ("closed", "Đã đóng"),
        ("cancelled", "Đã hủy"),
    ]

    tutor = models.ForeignKey(
        "tutors.TutorProfile",
        on_delete=models.CASCADE,
        related_name="online_classes",
    )
    subject = models.ForeignKey(
        "tutors.Subject",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="online_classes",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    level = models.CharField(max_length=100, blank=True)
    schedule_text = models.CharField(max_length=255)
    meeting_link = models.URLField(max_length=1000, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    total_sessions = models.PositiveIntegerField(default=12)
    sessions_per_month = models.PositiveIntegerField(default=8)
    session_duration_minutes = models.PositiveIntegerField(default=90)
    max_students = models.PositiveIntegerField(default=20)

    price_per_session = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    price_per_month = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    full_course_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    allowed_billing_cycles = models.JSONField(default=list, blank=True)

    payment_grace_days = models.PositiveIntegerField(default=3)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.tutor.full_name})"

    def get_cycle_price_and_sessions(self, billing_cycle: str):
        if billing_cycle == "per_session":
            return self.price_per_session, 1
        if billing_cycle == "full_course":
            return self.full_course_price, max(1, self.total_sessions or 1)
        raise ValueError("Chu kỳ thanh toán không hợp lệ.")


class OnlineClassSession(models.Model):
    STATUS_CHOICES = [
        ("scheduled", "Sắp diễn ra"),
        ("completed", "Đã dạy"),
        ("cancelled", "Đã hủy"),
    ]

    online_class = models.ForeignKey(
        OnlineClass, on_delete=models.CASCADE, related_name="sessions"
    )
    session_number = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=90)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="scheduled")
    notes = models.TextField(blank=True)
    material_url = models.URLField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["session_number", "scheduled_at"]
        unique_together = [["online_class", "session_number"]]

    def __str__(self):
        return f"{self.online_class.title} - Buổi {self.session_number}"


class OnlineClassSessionMaterial(models.Model):
    MATERIAL_TYPES = [
        ("note", "Ghi chú"),
        ("image", "Hình ảnh"),
        ("file", "File tài liệu"),
        ("video", "Video"),
        ("link", "Đường dẫn"),
    ]

    session = models.ForeignKey(
        OnlineClassSession, on_delete=models.CASCADE, related_name="materials"
    )
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    material_type = models.CharField(
        max_length=20, choices=MATERIAL_TYPES, default="note"
    )
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    file = models.FileField(upload_to="online_classes/materials/", null=True, blank=True)
    external_url = models.URLField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.get_material_type_display()} - {self.title}"


class OnlineClassEnrollment(models.Model):
    BILLING_CYCLE_CHOICES = OnlineClass.BILLING_CYCLE_CHOICES
    STATUS_CHOICES = [
        ("pending_payment", "Chờ thanh toán"),
        ("active", "Đang học"),
        ("completed", "Hoàn thành"),
        ("kicked_by_tutor", "Bị gia sư mời rời lớp"),
        ("kicked_unpaid", "Bị xóa do quá hạn học phí"),
        ("cancelled", "Đã hủy"),
    ]
    REFUND_STATUS_CHOICES = [
        ("none", "Không hoàn tiền"),
        ("pending", "Chờ hoàn tiền"),
        ("refunded", "Đã hoàn tiền"),
        ("rejected", "Từ chối hoàn"),
    ]

    online_class = models.ForeignKey(
        OnlineClass, on_delete=models.CASCADE, related_name="enrollments"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="online_class_enrollments",
    )
    billing_cycle = models.CharField(
        max_length=20, choices=BILLING_CYCLE_CHOICES, default="per_session"
    )
    status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default="pending_payment"
    )
    sessions_paid_total = models.PositiveIntegerField(default=0)
    sessions_attended = models.PositiveIntegerField(default=0)
    total_paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    joined_at = models.DateTimeField(null=True, blank=True)
    next_payment_due_date = models.DateField(null=True, blank=True)
    last_reminder_sent_for_due_date = models.DateField(null=True, blank=True)

    kick_type = models.CharField(max_length=30, blank=True)
    kick_reason = models.TextField(blank=True)
    kick_evidence_file = models.FileField(
        upload_to="online_classes/kick_evidence/", null=True, blank=True
    )
    kick_evidence_note = models.TextField(blank=True)
    kicked_at = models.DateTimeField(null=True, blank=True)
    kicked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="kicked_online_enrollments",
    )

    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    refund_sessions_remaining = models.PositiveIntegerField(default=0)
    refund_status = models.CharField(
        max_length=20, choices=REFUND_STATUS_CHOICES, default="none"
    )
    refund_admin_note = models.TextField(blank=True)
    refund_processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="processed_online_refunds",
    )
    refund_processed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student.email} -> {self.online_class.title} ({self.status})"


class OnlineClassPayment(models.Model):
    STATUS_CHOICES = [
        ("pending", "Chờ thanh toán"),
        ("paid", "Đã thanh toán"),
        ("failed", "Thất bại"),
        ("cancelled", "Đã hủy"),
    ]

    enrollment = models.ForeignKey(
        OnlineClassEnrollment, on_delete=models.CASCADE, related_name="payments"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="online_class_payments",
    )
    online_class = models.ForeignKey(
        OnlineClass, on_delete=models.CASCADE, related_name="payments"
    )
    billing_cycle = models.CharField(max_length=20)
    sessions_covered = models.PositiveIntegerField(default=1)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending"
    )
    payos_order_code = models.BigIntegerField(null=True, blank=True, unique=True)
    payos_payment_link_id = models.CharField(max_length=100, blank=True)
    payment_checkout_url = models.URLField(max_length=1000, blank=True)
    period_start_date = models.DateField(null=True, blank=True)
    period_end_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Payment #{self.id} ({self.billing_cycle} - {self.amount})"


class OnlineClassReview(models.Model):
    online_class = models.ForeignKey(
        OnlineClass, on_delete=models.CASCADE, related_name="reviews"
    )
    enrollment = models.OneToOneField(
        OnlineClassEnrollment, on_delete=models.CASCADE, related_name="review"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="online_class_reviews",
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField()
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Review {self.rating}/5 for {self.online_class.title}"
