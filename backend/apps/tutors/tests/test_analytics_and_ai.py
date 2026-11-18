from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITransactionTestCase

from apps.bookings.models import Booking
from apps.courses.models import Course, CourseCommission, CourseReview, CourseSession
from apps.online_classes.models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassSession,
)
from apps.tutors.models import Subject, TutorProfile, TutorSubject
from apps.users.models import TutorProfile as UserTutorProfile

User = get_user_model()


class AnalyticsRankingsAndAITests(APITransactionTestCase):
    def setUp(self):
        self.now = timezone.now()
        self.today = timezone.localdate()

        self.subject = Subject.objects.create(name="Toán Analytics", slug="toan-analytics", category="STEM")

        self.tutor_user = User.objects.create_user(
            username="ana_tutor1",
            email="ana.tutor1@example.com",
            password="password123",
            first_name="Khôi",
            last_name="Nguyễn Minh",
            is_tutor=True,
            is_verified=True,
        )
        self.reg1 = UserTutorProfile.objects.create(
            user=self.tutor_user,
            full_name="Nguyễn Minh Khôi",
            status="APPROVED",
        )
        self.tutor1 = TutorProfile.objects.create(
            user=self.tutor_user,
            full_name="Nguyễn Minh Khôi",
            rating_avg=Decimal("4.90"),
            total_reviews=3,
        )
        TutorSubject.objects.create(
            tutor=self.tutor1, subject=self.subject, level="THPT", hourly_rate=Decimal("150000"), is_active=True
        )

        self.poor_user = User.objects.create_user(
            username="ana_tutor2",
            email="ana.tutor2@example.com",
            password="password123",
            first_name="Bình",
            last_name="Trần Văn",
            is_tutor=True,
            is_verified=True,
        )
        self.reg2 = UserTutorProfile.objects.create(
            user=self.poor_user,
            full_name="Trần Văn Bình",
            status="APPROVED",
        )
        self.tutor2 = TutorProfile.objects.create(
            user=self.poor_user,
            full_name="Trần Văn Bình",
            rating_avg=Decimal("3.20"),
            total_reviews=1,
        )

        self.student_a = User.objects.create_user(
            username="stu_an",
            email="an@example.com",
            password="password123",
            first_name="An",
            last_name="Lê",
        )
        self.student_z = User.objects.create_user(
            username="stu_bao",
            email="bao@example.com",
            password="password123",
            first_name="Bảo",
            last_name="Trần",
        )
        self.admin = User.objects.create_user(
            username="ana_admin",
            email="ana.admin@example.com",
            password="password123",
            is_staff=True,
        )

        # 1-1 Booking + Course + Commission + Completed Session + Review for tutor1
        self.booking = Booking.objects.create(
            student=self.student_a,
            tutor=self.tutor1,
            subject=self.subject,
            start_time=self.now - timedelta(days=1),
            end_time=self.now,
            total_price=Decimal("1000000"),
            status="confirmed",
            payment_status="paid",
            paid_at=self.now,
        )
        self.course = Course.objects.create(
            student=self.student_a,
            tutor=self.tutor1,
            subject=self.subject,
            booking=self.booking,
            title="Khóa Toán 1-1",
            hourly_rate=Decimal("150000"),
            total_sessions=8,
            start_date=self.today,
            status="active",
        )
        CourseCommission.objects.create(
            course=self.course,
            tutor=self.tutor1,
            gross_amount=Decimal("1000000"),
            commission_rate=Decimal("0.15"),
            commission_amount=Decimal("150000"),
            due_at=self.now + timedelta(days=7),
        )
        CourseSession.objects.create(
            course=self.course,
            session_number=1,
            title="Hàm số",
            scheduled_date=self.today,
            student_completed=True,
            student_completed_at=self.now,
        )
        CourseReview.objects.create(
            course=self.course,
            tutor=self.tutor1,
            student=self.student_a,
            rating=5,
            comment="Dạy rất dễ hiểu",
            moderation_status=CourseReview.ModerationStatus.APPROVED,
        )

        # Online Class + Duplicated prefix session + 2 enrollments + payments for tutor1
        self.oc = OnlineClass.objects.create(
            tutor=self.tutor1,
            subject=self.subject,
            title="Lớp Toán Nhóm Live",
            schedule_text="Thứ 2, 4 · 19:30 - 21:00",
            start_date=self.today,
            end_date=self.today + timedelta(days=30),
            total_sessions=10,
            max_students=10,
            price_per_session=Decimal("100000"),
            full_course_price=Decimal("900000"),
            allowed_billing_cycles=["per_session", "full_course"],
            payment_grace_days=3,
            status="open",
        )
        OnlineClassSession.objects.create(
            online_class=self.oc,
            session_number=1,
            title="Buổi 1: Tổng ôn Hàm số",
            scheduled_at=self.now,
            duration_minutes=90,
            status="completed",
        )
        enr1 = OnlineClassEnrollment.objects.create(
            online_class=self.oc,
            student=self.student_z,
            billing_cycle="per_session",
            status="kicked_by_tutor",
            sessions_paid_total=4,
            sessions_attended=1,
            total_paid_amount=Decimal("400000"),
            kick_type="tutor_kick",
            kick_reason="Vắng nhiều buổi",
            refund_amount=Decimal("300000"),
            refund_status="refunded",
        )
        OnlineClassPayment.objects.create(
            enrollment=enr1,
            student=self.student_z,
            online_class=self.oc,
            billing_cycle="per_session",
            sessions_covered=4,
            amount=Decimal("400000"),
            status="paid",
            payos_order_code=111222,
            paid_at=self.now,
        )
        enr2 = OnlineClassEnrollment.objects.create(
            online_class=self.oc,
            student=self.student_a,
            billing_cycle="full_course",
            status="active",
            sessions_paid_total=10,
            sessions_attended=1,
            total_paid_amount=Decimal("900000"),
        )
        OnlineClassPayment.objects.create(
            enrollment=enr2,
            student=self.student_a,
            online_class=self.oc,
            billing_cycle="full_course",
            sessions_covered=10,
            amount=Decimal("900000"),
            status="paid",
            payos_order_code=111333,
            paid_at=self.now,
        )

    def test_students_payments_endpoint_and_session_title_dedup(self):
        self.client.force_authenticate(user=self.tutor_user)
        detail_res = self.client.get(f"/api/online-classes/tutor/{self.oc.id}/")
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        # Serializer strips redundant "Buổi 1: " prefix
        self.assertEqual(detail_res.data["sessions"][0]["title"], "Tổng ôn Hàm số")

        sp_res = self.client.get(f"/api/online-classes/tutor/{self.oc.id}/students-payments/")
        self.assertEqual(sp_res.status_code, status.HTTP_200_OK)
        students = sp_res.data["students"]
        self.assertEqual(len(students), 2)
        # Sorted by student name ascending ("Lê An" before "Trần Bảo")
        self.assertIn("An", students[0]["student_name"])
        self.assertEqual(students[0]["status"], "active")
        self.assertEqual(students[0]["payments"][0]["paid_date"], self.today.isoformat())
        self.assertEqual(students[1]["status"], "kicked_by_tutor")
        self.assertEqual(students[1]["kick_reason"], "Vắng nhiều buổi")

    def test_tutor_analytics_all_modes_and_leaderboard(self):
        self.client.force_authenticate(user=self.tutor_user)
        for mode in ("week", "month", "quarter", "year"):
            res = self.client.get(
                f"/api/tutors/analytics/?mode={mode}&year={self.today.year}&month={self.today.month}&ranking_mode=quarter"
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            summary = res.data["summary"]
            self.assertEqual(summary["sessions_taught"], 2)
            self.assertEqual(summary["gross_revenue"], 2300000.0)
            # Net: 2,300,000 - 150,000 commission - 300,000 refund = 1,850,000
            self.assertEqual(summary["net_revenue"], 1850000.0)
            self.assertEqual(len(res.data["reviews"]), 1)
            self.assertEqual(res.data["leaderboard"]["my_rank"]["rank"], 1)

    def test_admin_tutor_rankings_and_remove_tutor(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(
            f"/api/admin/tutor-rankings/?mode=month&year={self.today.year}&month={self.today.month}"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        top = res.data["top_rankings"]
        poor = res.data["poor_rankings"]
        self.assertEqual(top[0]["tutor_id"], self.tutor1.id)
        self.assertEqual(poor[0]["tutor_id"], self.tutor2.id)
        self.assertEqual(poor[0]["gross_revenue"], 0.0)

        with patch("apps.admin_portal.views.send_account_lock_email.delay"):
            rem = self.client.post(
                f"/api/admin/tutors/{self.reg2.id}/action/",
                {"action": "remove", "reason": "Doanh thu 0đ trong nhiều tháng"},
                format="json",
            )
        self.assertEqual(rem.status_code, status.HTTP_200_OK)
        self.poor_user.refresh_from_db()
        self.tutor2.refresh_from_db()
        self.assertFalse(self.poor_user.is_active)
        self.assertTrue(self.tutor2.new_class_locked)

    def test_ai_proxy_endpoints_with_fallback_and_permissions(self):
        # Unauthenticated student/guest can generate learning roadmap & DB recommendations
        res = self.client.post(
            "/api/ai/learning-roadmap/",
            {"goal": "Ôn thi Toán 12 THPTQG đạt 8+", "weekly_hours": 4},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("roadmap", res.data)
        self.assertGreaterEqual(len(res.data["matched_online_classes"]), 1)
        self.assertGreaterEqual(len(res.data["matched_tutors"]), 1)

        # Tutor lesson assistant
        self.client.force_authenticate(user=self.tutor_user)
        lesson_res = self.client.post(
            "/api/ai/lesson-assistant/",
            {
                "class_title": "Lớp Toán Nhóm Live",
                "subject": "Toán Analytics",
                "session_number": 2,
                "session_title": "Tích phân",
            },
            format="json",
        )
        self.assertEqual(lesson_res.status_code, status.HTTP_200_OK)
        self.assertIn("student_note", lesson_res.data)

        # Non-staff cannot run admin_poor_tutor insights
        forbidden = self.client.post(
            "/api/ai/performance-insights/",
            {"scope": "admin_poor_tutor", "gross_revenue": 0},
            format="json",
        )
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Admin can run admin_poor_tutor insights
        self.client.force_authenticate(user=self.admin)
        admin_ai = self.client.post(
            "/api/ai/performance-insights/",
            {
                "scope": "admin_poor_tutor",
                "tutor_name": "Trần Văn Bình",
                "gross_revenue": 0,
                "sessions_taught": 0,
            },
            format="json",
        )
        self.assertEqual(admin_ai.status_code, status.HTTP_200_OK)
        self.assertIn("health_score", admin_ai.data)

    def test_bank_info_qr_payout_report_profit_and_pagination(self):
        import io
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile

        buf = io.BytesIO()
        Image.new("RGB", (8, 8), color=(73, 109, 137)).save(buf, format="PNG")
        tiny_png = buf.getvalue()

        # 1. Student saves bank details + QR image on profile
        self.client.force_authenticate(user=self.student_a)
        qr_stu = SimpleUploadedFile("stu_qr.png", tiny_png, content_type="image/png")
        me_res = self.client.patch(
            "/api/auth/me/",
            {
                "bank_name": "Vietcombank",
                "bank_account_number": "1012345678",
                "bank_account_holder": "HOC VIEN MOT",
                "bank_branch": "CN Ha Noi",
                "bank_qr_image": qr_stu,
            },
            format="multipart",
        )
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data["bank_name"], "Vietcombank")
        self.assertEqual(me_res.data["bank_account_number"], "1012345678")
        self.assertTrue(bool(me_res.data["bank_qr_url"]))

        # Verify Admin OnlineClass Overview carries student_bank_info
        self.client.force_authenticate(user=self.admin)
        oc_admin = self.client.get("/api/online-classes/admin/overview/")
        self.assertEqual(oc_admin.status_code, status.HTTP_200_OK)
        enrollments = oc_admin.data["enrollments"]
        self.assertTrue(any(e.get("student_bank_info", {}).get("bank_account_number") == "1012345678" for e in enrollments))

        # 2. Tutor saves bank details & submits platform_exit payout with QR file upload
        self.tutor1.guarantee_deposit_balance = Decimal("500000.00")
        self.tutor1.commission_debt = Decimal("120000.00")
        self.tutor1.save(update_fields=["guarantee_deposit_balance", "commission_debt"])

        self.client.force_authenticate(user=self.tutor_user)
        t_me = self.client.patch(
            "/api/auth/me/",
            {
                "bank_name": "MB Bank",
                "bank_account_number": "0909888777",
                "bank_account_holder": "NGUYEN VAN AN",
            },
            format="multipart",
        )
        self.assertEqual(t_me.status_code, status.HTTP_200_OK)

        qr_tutor = SimpleUploadedFile("tutor_qr.png", tiny_png, content_type="image/png")
        payout_res = self.client.post(
            "/api/tutors/payout-requests/",
            {
                "request_type": "platform_exit",
                "qr_image": qr_tutor,
                "note": "Rút cọc test",
            },
            format="multipart",
        )
        self.assertEqual(payout_res.status_code, status.HTTP_201_CREATED)
        # Net of debt: 500,000 - 120,000 = 380,000
        self.assertEqual(float(payout_res.data["amount"]), 380000.0)
        self.assertIn("0909888777", payout_res.data["tutor_bank_info"])
        self.assertTrue(bool(payout_res.data["qr_image_url"]))

        # 3. Admin Reports (Revenue & Profit + 12-month series + CSV) + Finance Pagination + Notifications
        self.client.force_authenticate(user=self.admin)
        rep = self.client.get(f"/api/admin/reports/?month={self.today.month}&year={self.today.year}")
        self.assertEqual(rep.status_code, status.HTTP_200_OK)
        self.assertIn("revenue_and_profit", rep.data)
        self.assertIn("monthly_series", rep.data)
        self.assertEqual(len(rep.data["monthly_series"]), 12)
        self.assertGreaterEqual(rep.data["revenue_and_profit"]["total_system_revenue"], 0.0)

        rep_csv = self.client.get(f"/api/admin/reports/?month={self.today.month}&year={self.today.year}&export=csv")
        self.assertEqual(rep_csv.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", rep_csv["Content-Type"])

        notif = self.client.get("/api/admin/notifications/")
        self.assertEqual(notif.status_code, status.HTTP_200_OK)
        self.assertNotIn("open_violations", notif.data)

        fin_paged = self.client.get("/api/admin/finance/?page=1&page_size=10")
        self.assertEqual(fin_paged.status_code, status.HTTP_200_OK)
        self.assertIn("tutors_pagination", fin_paged.data)
        self.assertEqual(fin_paged.data["tutors_pagination"]["page_size"], 10)

        oc_paged = self.client.get("/api/online-classes/public/?page=1&page_size=10")
        self.assertEqual(oc_paged.status_code, status.HTTP_200_OK)
        self.assertEqual(oc_paged.data["page_size"], 10)
        self.assertIn("results", oc_paged.data)

        tut_paged = self.client.get("/api/tutors/public/?page=1&page_size=10")
        self.assertEqual(tut_paged.status_code, status.HTTP_200_OK)
        self.assertEqual(tut_paged.data["page_size"], 10)
        self.assertIn("results", tut_paged.data)

        # 4. Admin student detail modal endpoint (/api/admin/users/<id>/)
        stu_detail = self.client.get(f"/api/admin/users/{self.student_a.id}/")
        self.assertEqual(stu_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(stu_detail.data["profile"]["id"], self.student_a.id)
        self.assertEqual(stu_detail.data["bank_info"]["bank_account_number"], "1012345678")
        self.assertGreaterEqual(stu_detail.data["summary"]["courses_count"], 1)
        self.assertGreaterEqual(stu_detail.data["summary"]["reviews_count"], 1)
        self.assertIn("online_classes", stu_detail.data)
