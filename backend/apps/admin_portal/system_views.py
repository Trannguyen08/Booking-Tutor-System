import csv
from decimal import Decimal

from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone

from apps.bookings.models import Booking
from apps.courses.models import (
    Course,
    CourseCancellationRequest,
    CourseCommission,
    CourseReview,
)
from apps.online_classes.models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
)
from apps.tutors.models import TutorGuaranteeTransaction, TutorProfile as TeachingProfile
from apps.users.models import TutorProfile as UserTutorProfile

from .models import SystemSetting, TutorPayoutRequest
from .serializers import AdminSystemSettingSerializer
from .views import IsAdminUser, money_sum, selected_month


def ensure_system_settings():
    defaults = [
        (
            "tutor-guarantee-required-amount",
            "Cọc bảo chứng gia sư",
            getattr(settings, "TUTOR_GUARANTEE_REQUIRED_AMOUNT", "200000.00"),
            "money",
            "Số tiền cọc tối thiểu để gia sư được nhận lớp mới.",
        ),
        (
            "tutor-commission-rate",
            "Tỷ lệ commission",
            str(getattr(settings, "TUTOR_COMMISSION_RATE", "0.15")),
            "percent",
            "Tỷ lệ nền tảng thu khi khóa học hoàn thành.",
        ),
        (
            "tutor-commission-due-days",
            "Số ngày đến hạn commission",
            str(getattr(settings, "TUTOR_COMMISSION_DUE_DAYS", 7)),
            "number",
            "Số ngày gia sư cần thanh toán commission trước khi bị nhắc/quản lý.",
        ),
        (
            "booking-deposit-rate",
            "Tỷ lệ cọc booking",
            "0.20",
            "percent",
            "Tỷ lệ cọc gợi ý cho booking mới.",
        ),
        (
            "refund-policy-note",
            "Ghi chú chính sách hoàn tiền",
            "Admin đối soát và hoàn tiền thủ công khi booking bị hủy hợp lệ.",
            "text",
            "Nội dung nội bộ hiển thị cho nhóm vận hành.",
        ),
    ]
    for key, label, value, value_type, description in defaults:
        SystemSetting.objects.get_or_create(
            key=key,
            defaults={
                "label": label,
                "value": value,
                "value_type": value_type,
                "description": description,
            },
        )


def _get_commission_rate() -> Decimal:
    setting = SystemSetting.objects.filter(key="tutor-commission-rate").first()
    if setting:
        try:
            rate = Decimal(str(setting.value))
            if Decimal("0") <= rate <= Decimal("1"):
                return rate
        except Exception:
            pass
    return Decimal(str(getattr(settings, "TUTOR_COMMISSION_RATE", "0.15")))


class AdminSystemSettingListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminSystemSettingSerializer

    def get_queryset(self):
        ensure_system_settings()
        return SystemSetting.objects.all()


class AdminSystemSettingUpdateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, key):
        ensure_system_settings()
        try:
            item = SystemSetting.objects.get(key=key)
        except SystemSetting.DoesNotExist:
            return Response({"error": "Setting not found"}, status=404)
        item.value = request.data.get("value", item.value)
        item.updated_by = request.user
        item.save(update_fields=["value", "updated_by", "updated_at"])
        return Response(AdminSystemSettingSerializer(item).data)


class AdminReportView(APIView):
    permission_classes = [IsAdminUser]

    def _month_metrics(self, year: int, month: int, commission_rate: Decimal):
        bookings_paid = Booking.objects.annotate(
            eff_dt=Coalesce("paid_at", "created_at")
        ).filter(payment_status="paid", eff_dt__year=year, eff_dt__month=month)
        booking_revenue = money_sum(bookings_paid, "total_price")

        online_paid = OnlineClassPayment.objects.annotate(
            eff_dt=Coalesce("paid_at", "created_at")
        ).filter(status="paid", eff_dt__year=year, eff_dt__month=month)
        online_class_revenue = money_sum(online_paid, "amount")

        commissions = CourseCommission.objects.filter(
            created_at__year=year, created_at__month=month
        )
        commission_accrued = money_sum(commissions, "commission_amount")
        commission_paid = money_sum(commissions, "paid_amount")
        commission_deducted = money_sum(commissions, "deducted_amount")
        commission_collected = commission_paid + commission_deducted

        course_refunds = money_sum(
            CourseCancellationRequest.objects.filter(
                status="approved",
                refund_required=True,
                processed_at__year=year,
                processed_at__month=month,
            ),
            "refund_amount",
        )
        online_refunds = money_sum(
            OnlineClassEnrollment.objects.annotate(
                eff_dt=Coalesce("refund_processed_at", "kicked_at", "updated_at")
            ).filter(
                refund_status="refunded",
                refund_amount__gt=0,
                eff_dt__year=year,
                eff_dt__month=month,
            ),
            "refund_amount",
        )
        total_refunds = course_refunds + online_refunds

        payouts_paid = money_sum(
            TutorPayoutRequest.objects.filter(
                status="paid",
                processed_at__year=year,
                processed_at__month=month,
            ),
            "amount",
        )

        total_system_revenue = booking_revenue + online_class_revenue
        online_platform_fee = (Decimal(str(online_class_revenue)) * commission_rate).quantize(
            Decimal("1.00")
        )
        system_profit = Decimal(str(commission_collected)) + online_platform_fee

        return {
            "month": month,
            "label": f"T{month}",
            "booking_revenue": float(booking_revenue),
            "online_class_revenue": float(online_class_revenue),
            "total_revenue": float(total_system_revenue),
            "commission_accrued": float(commission_accrued),
            "commission_collected": float(commission_collected),
            "online_platform_fee": float(online_platform_fee),
            "system_profit": float(system_profit),
            "refunds": float(total_refunds),
            "course_refunds": float(course_refunds),
            "online_refunds": float(online_refunds),
            "payouts_paid": float(payouts_paid),
        }

    def get(self, request):
        month, year = selected_month(request)
        commission_rate = _get_commission_rate()

        bookings = Booking.objects.filter(created_at__year=year, created_at__month=month)
        courses = Course.objects.filter(created_at__year=year, created_at__month=month)
        online_classes = OnlineClass.objects.filter(
            created_at__year=year, created_at__month=month
        )
        reviews = CourseReview.objects.filter(created_at__year=year, created_at__month=month)
        online_reviews = OnlineClassReview.objects.filter(
            created_at__year=year, created_at__month=month
        )
        transactions = TutorGuaranteeTransaction.objects.filter(
            created_at__year=year, created_at__month=month
        )

        m_data = self._month_metrics(year, month, commission_rate)
        deposit_collected = money_sum(
            bookings.filter(payment_status="paid"), "deposit_amount"
        )
        deposit_topups = money_sum(
            transactions.filter(transaction_type="deposit_topup"), "amount"
        )
        net_cashflow = max(
            0.0, m_data["total_revenue"] - m_data["refunds"] - m_data["payouts_paid"]
        )

        monthly_series = [
            self._month_metrics(year, m, commission_rate) for m in range(1, 13)
        ]

        data = {
            "selected": {"month": month, "year": year, "commission_rate": float(commission_rate)},
            "revenue_and_profit": {
                "total_system_revenue": m_data["total_revenue"],
                "booking_revenue": m_data["booking_revenue"],
                "online_class_revenue": m_data["online_class_revenue"],
                "commission_collected": m_data["commission_collected"],
                "online_platform_fee": m_data["online_platform_fee"],
                "system_profit": m_data["system_profit"],
                "total_refunds": m_data["refunds"],
                "course_refunds": m_data["course_refunds"],
                "online_refunds": m_data["online_refunds"],
                "tutor_payouts_paid": m_data["payouts_paid"],
                "net_cashflow": net_cashflow,
            },
            "bookings": {
                "total": bookings.count(),
                "paid": bookings.filter(payment_status="paid").count(),
                "cancelled": bookings.filter(status="cancelled").count(),
                "revenue": m_data["booking_revenue"],
                "deposit": float(deposit_collected),
            },
            "courses": {
                "total": courses.count(),
                "active": courses.filter(status="active").count(),
                "completed": courses.filter(status="completed").count(),
                "cancelled": courses.filter(status="cancelled").count(),
                "online_classes_total": online_classes.count(),
            },
            "finance": {
                "commission": m_data["commission_accrued"],
                "commission_paid": m_data["commission_collected"],
                "commission_debt": float(
                    money_sum(TeachingProfile.objects.all(), "commission_debt")
                ),
                "deposit_balance": float(
                    money_sum(TeachingProfile.objects.all(), "guarantee_deposit_balance")
                ),
                "deposit_topups": float(deposit_topups),
            },
            "quality": {
                "reviews": reviews.count() + online_reviews.count(),
                "low_reviews": reviews.filter(rating__lte=2).count()
                + online_reviews.filter(rating__lte=2).count(),
            },
            "monthly_series": monthly_series,
        }

        if (
            request.query_params.get("export") == "csv"
            or request.query_params.get("format") == "csv"
        ):
            response = HttpResponse(content_type="text/csv; charset=utf-8")
            response[
                "Content-Disposition"
            ] = f'attachment; filename="admin-report-{year}-{month:02d}.csv"'
            response.write("\ufeff")
            writer = csv.writer(response)
            writer.writerow(["Nhóm chỉ số", "Chỉ số", f"Giá trị (T{month}/{year})"])
            for section in ("revenue_and_profit", "bookings", "courses", "finance", "quality"):
                for key, value in data[section].items():
                    writer.writerow([section, key, value])
            return response

        return Response(data)


class AdminNotificationOverviewView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response(
            {
                "pending_tutors": UserTutorProfile.objects.filter(status="PENDING").count(),
                "pending_payments": Booking.objects.filter(payment_status="pending").count(),
                "failed_payments": Booking.objects.filter(payment_status="failed").count(),
                "overdue_commissions": CourseCommission.objects.filter(due_at__lt=timezone.now())
                .exclude(status__in=["paid", "deducted", "waived"])
                .count(),
                "low_reviews": CourseReview.objects.filter(rating__lte=2).count(),
            }
        )
