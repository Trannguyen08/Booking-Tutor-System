import re

from django.db.models import Avg
from rest_framework import serializers

from .models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
    OnlineClassSession,
    OnlineClassSessionMaterial,
)
from .services import compute_attended_sessions


class OnlineClassSessionMaterialSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OnlineClassSessionMaterial
        fields = [
            "id",
            "session",
            "material_type",
            "title",
            "content",
            "file_url",
            "external_url",
            "uploaded_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "session", "file_url", "uploaded_by_name", "created_at"]

    def get_file_url(self, obj):
        if not obj.file:
            return ""
        request = self.context.get("request")
        url = obj.file.url
        return request.build_absolute_uri(url) if request and url.startswith("/") else url

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username or obj.uploaded_by.email


class OnlineClassSessionSerializer(serializers.ModelSerializer):
    materials = OnlineClassSessionMaterialSerializer(many=True, read_only=True)

    class Meta:
        model = OnlineClassSession
        fields = [
            "id",
            "online_class",
            "session_number",
            "title",
            "scheduled_at",
            "duration_minutes",
            "status",
            "notes",
            "material_url",
            "materials",
            "created_at",
        ]
        read_only_fields = ["id", "online_class", "materials", "created_at"]

    @staticmethod
    def _clean_title(value: str) -> str:
        return re.sub(r"^(?:Buổi\s*\d+\s*[:.\-–]\s*)+", "", (value or "").strip(), flags=re.IGNORECASE).strip()

    def validate_title(self, value):
        return self._clean_title(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        cleaned = self._clean_title(data.get("title", ""))
        if cleaned:
            data["title"] = cleaned
        return data


class OnlineClassReviewSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    class_title = serializers.CharField(source="online_class.title", read_only=True)

    class Meta:
        model = OnlineClassReview
        fields = [
            "id",
            "online_class",
            "class_title",
            "student",
            "student_name",
            "rating",
            "comment",
            "is_visible",
            "created_at",
        ]
        read_only_fields = ["id", "online_class", "student", "student_name", "created_at"]

    def get_student_name(self, obj):
        return obj.student.get_full_name() or obj.student.username or obj.student.email

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Điểm đánh giá phải từ 1 đến 5 sao.")
        return value


class OnlineClassPaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(source="student.email", read_only=True)
    class_title = serializers.CharField(source="online_class.title", read_only=True)

    class Meta:
        model = OnlineClassPayment
        fields = [
            "id",
            "enrollment",
            "online_class",
            "class_title",
            "student",
            "student_name",
            "student_email",
            "billing_cycle",
            "sessions_covered",
            "amount",
            "status",
            "payos_order_code",
            "payment_checkout_url",
            "paid_at",
            "created_at",
        ]

    def get_student_name(self, obj):
        return obj.student.get_full_name() or obj.student.username or obj.student.email


class OnlineClassEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(source="student.email", read_only=True)
    student_phone = serializers.CharField(source="student.phone", read_only=True)
    class_title = serializers.CharField(source="online_class.title", read_only=True)
    tutor_id = serializers.IntegerField(source="online_class.tutor_id", read_only=True)
    tutor_name = serializers.CharField(source="online_class.tutor.full_name", read_only=True)
    evidence_url = serializers.SerializerMethodField()
    computed_attended_sessions = serializers.SerializerMethodField()
    payments = OnlineClassPaymentSerializer(many=True, read_only=True)
    has_reviewed = serializers.SerializerMethodField()
    student_bank_info = serializers.SerializerMethodField()

    class Meta:
        model = OnlineClassEnrollment
        fields = [
            "id",
            "online_class",
            "class_title",
            "tutor_id",
            "tutor_name",
            "student",
            "student_name",
            "student_email",
            "student_phone",
            "student_bank_info",
            "billing_cycle",
            "status",
            "sessions_paid_total",
            "sessions_attended",
            "computed_attended_sessions",
            "total_paid_amount",
            "joined_at",
            "next_payment_due_date",
            "kick_type",
            "kick_reason",
            "evidence_url",
            "kick_evidence_note",
            "kicked_at",
            "refund_amount",
            "refund_sessions_remaining",
            "refund_status",
            "refund_admin_note",
            "refund_processed_at",
            "has_reviewed",
            "payments",
            "created_at",
        ]

    def get_student_name(self, obj):
        return obj.student.get_full_name() or obj.student.username or obj.student.email

    def get_evidence_url(self, obj):
        if not obj.kick_evidence_file:
            return ""
        request = self.context.get("request")
        url = obj.kick_evidence_file.url
        return request.build_absolute_uri(url) if request and url.startswith("/") else url

    def get_computed_attended_sessions(self, obj):
        if obj.status in ("kicked_by_tutor", "kicked_unpaid", "completed"):
            return obj.sessions_attended
        return compute_attended_sessions(obj)

    def get_has_reviewed(self, obj):
        return hasattr(obj, "review")

    def get_student_bank_info(self, obj):
        stu = obj.student
        qr_field = getattr(stu, "bank_qr_image", None)
        qr_url = ""
        if qr_field:
            request = self.context.get("request")
            url = qr_field.url
            qr_url = request.build_absolute_uri(url) if request and url.startswith("/") else url
        return {
            "bank_name": getattr(stu, "bank_name", "") or "",
            "bank_account_number": getattr(stu, "bank_account_number", "") or "",
            "bank_account_holder": getattr(stu, "bank_account_holder", "") or "",
            "bank_branch": getattr(stu, "bank_branch", "") or "",
            "bank_qr_url": qr_url,
        }


class OnlineClassSerializer(serializers.ModelSerializer):
    tutor_id = serializers.IntegerField(source="tutor.id", read_only=True)
    tutor_name = serializers.CharField(source="tutor.full_name", read_only=True)
    tutor_avatar = serializers.SerializerMethodField()
    tutor_rating = serializers.DecimalField(
        source="tutor.rating_avg", max_digits=3, decimal_places=2, read_only=True
    )
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    active_students_count = serializers.SerializerMethodField()
    seats_remaining = serializers.SerializerMethodField()
    rating_avg = serializers.SerializerMethodField()
    total_reviews = serializers.SerializerMethodField()
    sessions = OnlineClassSessionSerializer(many=True, read_only=True)

    class Meta:
        model = OnlineClass
        fields = [
            "id",
            "tutor_id",
            "tutor_name",
            "tutor_avatar",
            "tutor_rating",
            "subject",
            "subject_name",
            "title",
            "description",
            "level",
            "schedule_text",
            "meeting_link",
            "start_date",
            "end_date",
            "total_sessions",
            "sessions_per_month",
            "session_duration_minutes",
            "max_students",
            "active_students_count",
            "seats_remaining",
            "price_per_session",
            "price_per_month",
            "full_course_price",
            "allowed_billing_cycles",
            "payment_grace_days",
            "status",
            "rating_avg",
            "total_reviews",
            "sessions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "tutor_id",
            "tutor_name",
            "tutor_avatar",
            "tutor_rating",
            "active_students_count",
            "seats_remaining",
            "rating_avg",
            "total_reviews",
            "created_at",
            "updated_at",
        ]

    def get_tutor_avatar(self, obj):
        avatar = getattr(obj.tutor.user, "avatar", None)
        if not avatar:
            return ""
        request = self.context.get("request")
        url = avatar.url
        return request.build_absolute_uri(url) if request and url.startswith("/") else url

    def get_active_students_count(self, obj):
        return obj.enrollments.filter(status="active").count()

    def get_seats_remaining(self, obj):
        return max(0, int(obj.max_students or 0) - self.get_active_students_count(obj))

    def get_rating_avg(self, obj):
        agg = obj.reviews.filter(is_visible=True).aggregate(avg=Avg("rating"))
        val = agg["avg"]
        return round(float(val), 2) if val is not None else 0.0

    def get_total_reviews(self, obj):
        return obj.reviews.filter(is_visible=True).count()

    def validate(self, attrs):
        cycles = attrs.get(
            "allowed_billing_cycles",
            getattr(self.instance, "allowed_billing_cycles", None),
        )
        valid_cycles = {"per_session", "full_course"}
        if not cycles:
            cycles = []
            if (attrs.get("price_per_session") or getattr(self.instance, "price_per_session", 0)) > 0:
                cycles.append("per_session")
            if (attrs.get("full_course_price") or getattr(self.instance, "full_course_price", 0)) > 0:
                cycles.append("full_course")
            attrs["allowed_billing_cycles"] = cycles

        if not cycles or not set(cycles).issubset(valid_cycles):
            raise serializers.ValidationError(
                {"allowed_billing_cycles": "Vui lòng chọn ít nhất 1 hình thức thanh toán hợp lệ (Theo buổi hoặc Toàn khóa)."}
            )

        for cycle in cycles:
            if cycle == "per_session":
                price = attrs.get("price_per_session", getattr(self.instance, "price_per_session", 0))
                if not price or price <= 0:
                    raise serializers.ValidationError({"price_per_session": "Giá theo buổi phải lớn hơn 0."})
            elif cycle == "full_course":
                price = attrs.get("full_course_price", getattr(self.instance, "full_course_price", 0))
                if not price or price <= 0:
                    raise serializers.ValidationError({"full_course_price": "Giá toàn khóa phải lớn hơn 0."})

        max_students = attrs.get("max_students", getattr(self.instance, "max_students", 1))
        if max_students < 1:
            raise serializers.ValidationError({"max_students": "Sĩ số tối đa phải từ 1 trở lên."})

        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "Ngày kết thúc phải lớn hơn hoặc bằng ngày khai giảng."}
            )

        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        tutor = self.context.get("tutor")
        if tutor is not None and subject is not None:
            if not tutor.tutor_subjects.filter(subject=subject, is_active=True).exists():
                raise serializers.ValidationError(
                    {"subject": "Bạn chỉ có thể tạo lớp cho môn học đã đăng ký dạy trong hồ sơ gia sư."}
                )
        return attrs
