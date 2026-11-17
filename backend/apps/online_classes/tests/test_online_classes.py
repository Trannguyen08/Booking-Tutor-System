import tempfile
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITransactionTestCase

from apps.notifications.models import Notification
from apps.online_classes.models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
    OnlineClassSession,
)
from apps.online_classes.services import (
    kick_overdue_unpaid_enrollments,
    send_due_payment_reminders,
)
from apps.tutors.models import Subject, TutorProfile

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    },
    MEDIA_ROOT=tempfile.mkdtemp(),
)
class OnlineClassWorkflowTests(APITransactionTestCase):
    def setUp(self):
        self.tutor_user = User.objects.create_user(
            username="oc_tutor",
            email="oc.tutor@example.com",
            password="password123",
            is_tutor=True,
            is_verified=True,
        )
        self.tutor = TutorProfile.objects.create(
            user=self.tutor_user, full_name="Thầy Minh Online"
        )
        self.student1 = User.objects.create_user(
            username="oc_student1",
            email="oc.student1@example.com",
            password="password123",
        )
        self.student2 = User.objects.create_user(
            username="oc_student2",
            email="oc.student2@example.com",
            password="password123",
        )
        self.admin = User.objects.create_user(
            username="oc_admin",
            email="oc.admin@example.com",
            password="password123",
            is_staff=True,
        )
        self.subject = Subject.objects.create(
            name="Toán Online", slug="toan-online-test", category="STEM"
        )

    def _create_sample_class(self, max_students=2, grace_days=3):
        return OnlineClass.objects.create(
            tutor=self.tutor,
            subject=self.subject,
            title="Lớp Toán 12 Live",
            description="Luyện đề THPTQG",
            level="THPT",
            schedule_text="Thứ 2, 4 - 19:30",
            meeting_link="https://meet.google.com/test-room",
            start_date=timezone.localdate(),
            total_sessions=10,
            sessions_per_month=8,
            session_duration_minutes=90,
            max_students=max_students,
            price_per_session=Decimal("100000.00"),
            price_per_month=Decimal("0.00"),
            full_course_price=Decimal("1000000.00"),
            allowed_billing_cycles=["per_session", "full_course"],
            payment_grace_days=grace_days,
            status="open",
        )

    @patch("apps.online_classes.services.get_payment_request")
    @patch("apps.online_classes.services.create_payos_payment_request")
    def test_enroll_payos_capacity_limit_and_review(self, mock_create, mock_get):
        mock_create.return_value = {
            "paymentLinkId": "pl-1",
            "checkoutUrl": "https://pay.payos.vn/web/pl-1",
        }
        mock_get.return_value = {"status": "PAID"}

        cls = self._create_sample_class(max_students=1)

        self.client.force_authenticate(self.student1)
        # Monthly billing cycle should be rejected
        monthly_res = self.client.post(
            reverse("online-class-enroll", kwargs={"pk": cls.id}),
            {"billing_cycle": "monthly"},
            format="json",
        )
        self.assertEqual(monthly_res.status_code, status.HTTP_400_BAD_REQUEST)

        enroll_res = self.client.post(
            reverse("online-class-enroll", kwargs={"pk": cls.id}),
            {"billing_cycle": "per_session"},
            format="json",
        )
        self.assertEqual(enroll_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            enroll_res.data["checkout_url"], "https://pay.payos.vn/web/pl-1"
        )
        payment_id = enroll_res.data["payment"]["id"]

        verify_res = self.client.post(
            reverse("online-class-payment-verify"),
            {"paymentId": payment_id},
            format="json",
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertEqual(verify_res.data["enrollment"]["status"], "active")
        self.assertEqual(verify_res.data["enrollment"]["sessions_paid_total"], 1)

        # Second student hits max_students=1 limit
        self.client.force_authenticate(self.student2)
        full_res = self.client.post(
            reverse("online-class-enroll", kwargs={"pk": cls.id}),
            {"billing_cycle": "per_session"},
            format="json",
        )
        self.assertEqual(full_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Active student1 reviews the class
        self.client.force_authenticate(self.student1)
        rev_res = self.client.post(
            reverse("online-class-review", kwargs={"pk": cls.id}),
            {"rating": 5, "comment": "Lớp học rất hay và tương tác tốt!"},
            format="json",
        )
        self.assertEqual(rev_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(OnlineClassReview.objects.filter(online_class=cls).count(), 1)

    def test_tutor_kick_calculates_prorata_refund_and_admin_marks_refunded(self):
        cls = self._create_sample_class(max_students=10)
        now = timezone.now()
        # 2 completed sessions + 8 upcoming
        OnlineClassSession.objects.create(
            online_class=cls,
            session_number=1,
            title="Buổi 1",
            scheduled_at=now - timedelta(days=3),
            status="completed",
        )
        OnlineClassSession.objects.create(
            online_class=cls,
            session_number=2,
            title="Buổi 2",
            scheduled_at=now - timedelta(days=1),
            status="completed",
        )
        enrollment = OnlineClassEnrollment.objects.create(
            online_class=cls,
            student=self.student1,
            billing_cycle="full_course",
            status="active",
            sessions_paid_total=10,
            total_paid_amount=Decimal("1000000.00"),
            joined_at=now - timedelta(days=5),
        )

        self.client.force_authenticate(self.tutor_user)
        # Missing evidence should fail
        bad_kick = self.client.post(
            reverse("tutor-online-class-kick", kwargs={"enrollment_id": enrollment.id}),
            {"kick_reason": "Vi phạm nội quy"},
            format="multipart",
        )
        self.assertEqual(bad_kick.status_code, status.HTTP_400_BAD_REQUEST)

        kick_res = self.client.post(
            reverse("tutor-online-class-kick", kwargs={"enrollment_id": enrollment.id}),
            {
                "kick_reason": "Nghỉ không phép và làm ồn trong lớp",
                "kick_evidence_note": "Ảnh chụp log điểm danh & chat",
                "kick_evidence_file": SimpleUploadedFile(
                    "evidence.png", b"\x89PNG\r\n\x1a\nimg", content_type="image/png"
                ),
            },
            format="multipart",
        )
        self.assertEqual(kick_res.status_code, status.HTTP_200_OK)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.status, "kicked_by_tutor")
        self.assertEqual(enrollment.sessions_attended, 2)
        self.assertEqual(enrollment.refund_sessions_remaining, 8)
        self.assertEqual(enrollment.refund_amount, Decimal("800000.00"))
        self.assertEqual(enrollment.refund_status, "pending")

        # Admin views overview and processes refund
        self.client.force_authenticate(self.admin)
        overview_res = self.client.get(reverse("admin-online-classes-overview"))
        self.assertEqual(overview_res.status_code, status.HTTP_200_OK)
        self.assertEqual(overview_res.data["summary"]["pending_refunds"], 1)

        refund_res = self.client.post(
            reverse(
                "admin-online-class-refund-action",
                kwargs={"enrollment_id": enrollment.id},
            ),
            {"action": "mark_refunded", "admin_note": "Đã chuyển khoản hoàn tiền"},
            format="json",
        )
        self.assertEqual(refund_res.status_code, status.HTTP_200_OK)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.refund_status, "refunded")

    def test_2day_reminder_and_overdue_kick_no_refund_workers(self):
        cls = self._create_sample_class(grace_days=3)
        today = timezone.localdate()

        due_in_2_days = OnlineClassEnrollment.objects.create(
            online_class=cls,
            student=self.student1,
            billing_cycle="per_session",
            status="active",
            sessions_paid_total=1,
            total_paid_amount=Decimal("100000.00"),
            next_payment_due_date=today + timedelta(days=2),
        )
        overdue = OnlineClassEnrollment.objects.create(
            online_class=cls,
            student=self.student2,
            billing_cycle="per_session",
            status="active",
            sessions_paid_total=1,
            total_paid_amount=Decimal("100000.00"),
            next_payment_due_date=today - timedelta(days=4),  # grace=3 -> expired
        )

        mail.outbox.clear()
        reminders = send_due_payment_reminders(today=today)
        self.assertEqual(reminders, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.student1.email])
        self.assertTrue(
            Notification.objects.filter(
                user=self.student1, title__icontains="Nhắc nhở đóng học phí"
            ).exists()
        )
        # Idempotent on same due date
        self.assertEqual(send_due_payment_reminders(today=today), 0)

        kicked = kick_overdue_unpaid_enrollments(today=today)
        self.assertEqual(kicked, 1)
        overdue.refresh_from_db()
        self.assertEqual(overdue.status, "kicked_unpaid")
        self.assertEqual(overdue.kick_type, "overdue_unpaid")
        self.assertEqual(overdue.refund_amount, Decimal("0.00"))
        self.assertEqual(overdue.refund_status, "none")

        due_in_2_days.refresh_from_db()
        self.assertEqual(due_in_2_days.status, "active")
