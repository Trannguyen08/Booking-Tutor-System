from decimal import Decimal

from rest_framework import status, permissions, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import ExtractMonth
from django.utils import timezone
from apps.users.models import TutorProfile as UserTutorProfile
from apps.tutors.models import TutorProfile as TeachingProfile
from apps.users.tasks import send_account_lock_email
from apps.users.services.tutor_registration import (
    approve_tutor_registration,
    reject_tutor_registration,
)
from apps.bookings.models import Booking
from apps.courses.models import (
    Course,
    CourseCancellationRequest,
    CourseCommission,
    CourseReview,
)
from apps.online_classes.models import (
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
)
from apps.tutors.models import TutorGuaranteeTransaction
from apps.tutors.services.guarantee import (
    accrue_course_commission,
    deduct_commission_debt_from_deposit,
    mark_payout_request_processed,
    pay_commission_debt,
    top_up_deposit,
)
from core.cache_utils import invalidate_cache_groups
from .models import TutorPayoutRequest
from .serializers import (
    AdminCourseCommissionSerializer,
    AdminCourseCancellationRequestSerializer,
    AdminCourseSerializer,
    AdminFinanceTutorSerializer,
    AdminGuaranteeTransactionSerializer,
    TutorPayoutRequestSerializer,
    AdminTutorRegistrationSerializer,
    AdminUserSerializer,
)

User = get_user_model()


class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_staff


def money_sum(queryset, field):
    return queryset.aggregate(total=Sum(field))["total"] or Decimal("0.00")


def selected_month(request):
    now = timezone.localdate()
    try:
        month = int(request.query_params.get("month") or now.month)
        year = int(request.query_params.get("year") or now.year)
    except (TypeError, ValueError):
        month, year = now.month, now.year
    month = min(max(month, 1), 12)
    year = min(max(year, 2000), now.year + 1)
    return month, year


# Dashboard Stats
class AdminDashboardStatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        month, year = selected_month(request)
        courses_in_month = Course.objects.filter(
            created_at__year=year, created_at__month=month
        )
        bookings_in_month = Booking.objects.filter(
            created_at__year=year, created_at__month=month
        )
        commissions_in_month = CourseCommission.objects.filter(
            created_at__year=year, created_at__month=month
        )
        transactions_in_month = TutorGuaranteeTransaction.objects.filter(
            created_at__year=year, created_at__month=month
        )

        course_status = {
            item["status"]: item["count"]
            for item in Course.objects.values("status").annotate(count=Count("id"))
        }

        monthly_course_rows = (
            Course.objects.filter(created_at__year=year)
            .annotate(month_number=ExtractMonth("created_at"))
            .values("month_number")
            .annotate(
                courses=Count("id"),
                active=Count("id", filter=Q(status="active")),
                completed=Count("id", filter=Q(status="completed")),
            )
        )
        monthly_revenue_rows = (
            Booking.objects.filter(
                created_at__year=year,
                payment_status="paid",
            )
            .annotate(month_number=ExtractMonth("created_at"))
            .values("month_number")
            .annotate(revenue=Sum("total_price"), deposit=Sum("deposit_amount"))
        )
        monthly_commission_rows = (
            CourseCommission.objects.filter(created_at__year=year)
            .annotate(month_number=ExtractMonth("created_at"))
            .values("month_number")
            .annotate(commission=Sum("commission_amount"), paid=Sum("paid_amount"))
        )

        course_map = {row["month_number"]: row for row in monthly_course_rows}
        revenue_map = {row["month_number"]: row for row in monthly_revenue_rows}
        commission_map = {row["month_number"]: row for row in monthly_commission_rows}
        monthly_series = []
        for item_month in range(1, 13):
            course_row = course_map.get(item_month, {})
            revenue_row = revenue_map.get(item_month, {})
            commission_row = commission_map.get(item_month, {})
            monthly_series.append(
                {
                    "month": item_month,
                    "courses": course_row.get("courses", 0),
                    "active_courses": course_row.get("active", 0),
                    "completed_courses": course_row.get("completed", 0),
                    "revenue": revenue_row.get("revenue") or 0,
                    "deposit": revenue_row.get("deposit") or 0,
                    "commission": commission_row.get("commission") or 0,
                    "commission_paid": commission_row.get("paid") or 0,
                }
            )

        latest_courses = Course.objects.select_related(
            "student", "tutor", "subject"
        ).order_by("-created_at")[:5]
        latest_transactions = TutorGuaranteeTransaction.objects.select_related(
            "tutor", "course"
        ).order_by("-created_at")[:5]

        data = {
            "selected": {"month": month, "year": year},
            "total_users": User.objects.count(),
            "total_tutors": TeachingProfile.objects.count(),
            "total_students": User.objects.filter(
                is_tutor=False, is_staff=False
            ).count(),
            "pending_tutors": UserTutorProfile.objects.filter(status="PENDING").count(),
            "active_classes": Course.objects.filter(status="active").count(),
            "total_courses": Course.objects.count(),
            "completed_courses": Course.objects.filter(status="completed").count(),
            "monthly_courses": courses_in_month.count(),
            "monthly_completed_courses": courses_in_month.filter(
                status="completed"
            ).count(),
            "monthly_revenue": money_sum(
                bookings_in_month.filter(payment_status="paid"), "total_price"
            ),
            "monthly_deposit": money_sum(
                bookings_in_month.filter(payment_status="paid"), "deposit_amount"
            ),
            "monthly_commission": money_sum(commissions_in_month, "commission_amount"),
            "monthly_commission_paid": money_sum(commissions_in_month, "paid_amount"),
            "monthly_deposit_topup": money_sum(
                transactions_in_month.filter(transaction_type="deposit_topup"), "amount"
            ),
            "total_deposit_balance": money_sum(
                TeachingProfile.objects.all(), "guarantee_deposit_balance"
            ),
            "total_commission_debt": money_sum(
                TeachingProfile.objects.all(), "commission_debt"
            ),
            "locked_tutors": TeachingProfile.objects.filter(new_class_locked=True).count(),
            "course_status": course_status,
            "monthly_series": monthly_series,
            "focus_items": {
                "pending_tutors": UserTutorProfile.objects.filter(
                    status="PENDING"
                ).count(),
                "overdue_commissions": CourseCommission.objects.filter(
                    due_at__lt=timezone.now()
                )
                .exclude(status__in=["paid", "deducted", "waived"])
                .count(),
                "low_deposit_tutors": TeachingProfile.objects.filter(
                    new_class_lock_reason="low_deposit"
                ).count(),
                "new_courses_this_month": courses_in_month.count(),
            },
            "latest_courses": AdminCourseSerializer(latest_courses, many=True).data,
            "latest_transactions": AdminGuaranteeTransactionSerializer(
                latest_transactions, many=True
            ).data,
        }

        return Response(data)


class AdminCourseListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminCourseSerializer

    def get_queryset(self):
        queryset = Course.objects.select_related(
            "student", "tutor__user", "subject", "commission"
        ).prefetch_related("sessions__materials", "sessions__materials__uploaded_by")

        status_param = self.request.query_params.get("status")
        if status_param and status_param != "all":
            queryset = queryset.filter(status=status_param)

        month = self.request.query_params.get("month")
        year = self.request.query_params.get("year")
        if year:
            queryset = queryset.filter(created_at__year=year)
        if month:
            queryset = queryset.filter(created_at__month=month)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(student__email__icontains=search)
                | Q(student__username__icontains=search)
                | Q(tutor__full_name__icontains=search)
                | Q(subject__name__icontains=search)
            )

        return queryset.order_by("-created_at")


class AdminCourseActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        action = request.data.get("action")
        if action not in ["active", "paused", "completed", "cancelled"]:
            return Response(
                {"error": "Invalid course status action."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            course = Course.objects.get(pk=pk)
        except Course.DoesNotExist:
            return Response(
                {"error": "Course not found"}, status=status.HTTP_404_NOT_FOUND
            )

        course.status = action
        course.save(update_fields=["status", "updated_at"])
        if action == "completed":
            accrue_course_commission(course)
        return Response(AdminCourseSerializer(course).data)


class AdminCourseCancellationRequestListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminCourseCancellationRequestSerializer

    def get_queryset(self):
        queryset = CourseCancellationRequest.objects.select_related(
            "course__student",
            "course__tutor__user",
            "course__subject",
            "requested_by",
        )
        status_param = self.request.query_params.get("status")
        if status_param and status_param != "all":
            queryset = queryset.filter(status=status_param)
        role = self.request.query_params.get("role")
        if role and role != "all":
            queryset = queryset.filter(requested_by_role=role)
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(course__title__icontains=search)
                | Q(course__student__email__icontains=search)
                | Q(course__student__username__icontains=search)
                | Q(course__tutor__full_name__icontains=search)
                | Q(reason__icontains=search)
            )
        return queryset.order_by("-created_at")


class AdminCourseCancellationRequestActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            cancellation = CourseCancellationRequest.objects.select_related(
                "course__booking"
            ).get(pk=pk, status="pending")
        except CourseCancellationRequest.DoesNotExist:
            return Response(
                {"error": "Cancellation request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        action = request.data.get("action")
        if action not in ["approve", "reject"]:
            return Response(
                {"action": "Use approve or reject."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cancellation.status = "approved" if action == "approve" else "rejected"
        cancellation.admin_note = request.data.get("admin_note", "")
        cancellation.processed_by = request.user
        cancellation.processed_at = timezone.now()
        cancellation.save(
            update_fields=["status", "admin_note", "processed_by", "processed_at"]
        )

        if action == "approve":
            course = cancellation.course
            course.status = "cancelled"
            course.save(update_fields=["status", "updated_at"])
            booking = getattr(course, "booking", None)
            if booking:
                booking.status = "cancelled"
                booking.save(update_fields=["status"])

        from apps.notifications.tasks import create_notification

        stu_msg = (
            f"Yêu cầu hủy khóa '{cancellation.course.title}' đã được Admin chấp thuận."
            + (
                f" Số tiền hoàn dự kiến: {int(cancellation.refund_amount):,}đ."
                if action == "approve" and cancellation.refund_required
                else ""
            )
            if action == "approve"
            else f"Yêu cầu hủy khóa '{cancellation.course.title}' đã bị từ chối. {cancellation.admin_note}"
        )
        create_notification(
            user_id=cancellation.course.student_id,
            title="Cập nhật yêu cầu hủy khóa học",
            message=stu_msg,
            notification_type="info",
            link=f"/my-courses/{cancellation.course_id}",
        )
        create_notification(
            user_id=cancellation.course.tutor.user_id,
            title="Cập nhật yêu cầu hủy khóa học",
            message=f"Khóa học '{cancellation.course.title}' - trạng thái yêu cầu hủy: {'Đã duyệt hủy' if action == 'approve' else 'Từ chối'}.",
            notification_type="info",
            link=f"/tutor/courses/{cancellation.course_id}",
        )

        invalidate_cache_groups("courses", "bookings")
        return Response(
            AdminCourseCancellationRequestSerializer(
                cancellation, context={"request": request}
            ).data
        )


class AdminFinanceOverviewView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        month, year = selected_month(request)
        transactions = TutorGuaranteeTransaction.objects.filter(
            created_at__year=year, created_at__month=month
        )
        commissions = CourseCommission.objects.filter(
            created_at__year=year, created_at__month=month
        )
        tutors = (
            TeachingProfile.objects.select_related("user")
            .annotate(
                active_courses=Count(
                    "teaching_courses",
                    filter=Q(teaching_courses__status="active"),
                    distinct=True,
                ),
                due_commissions=Count(
                    "course_commissions",
                    filter=~Q(
                        course_commissions__status__in=[
                            "paid",
                            "deducted",
                            "waived",
                        ]
                    ),
                    distinct=True,
                ),
            )
            .order_by("-commission_debt", "full_name")
        )
        recent_transactions = TutorGuaranteeTransaction.objects.select_related(
            "tutor", "course"
        ).order_by("-created_at")[:50]
        due_commissions = CourseCommission.objects.select_related(
            "course", "tutor"
        ).exclude(status__in=["paid", "deducted", "waived"])[:50]
        payout_requests = TutorPayoutRequest.objects.select_related(
            "tutor__user", "course"
        ).order_by("-created_at")[:100]

        from core.pagination import paginate_items

        tutors_page = paginate_items(
            request,
            tutors,
            AdminFinanceTutorSerializer,
            default_page_size=10,
        )

        return Response(
            {
                "selected": {"month": month, "year": year},
                "summary": {
                    "total_deposit_balance": money_sum(
                        TeachingProfile.objects.all(), "guarantee_deposit_balance"
                    ),
                    "total_commission_debt": money_sum(
                        TeachingProfile.objects.all(), "commission_debt"
                    ),
                    "monthly_deposit_topup": money_sum(
                        transactions.filter(transaction_type="deposit_topup"), "amount"
                    ),
                    "monthly_commission_accrual": money_sum(
                        transactions.filter(transaction_type="commission_accrual"),
                        "amount",
                    ),
                    "monthly_commission_paid": money_sum(
                        transactions.filter(transaction_type="commission_payment"),
                        "amount",
                    ),
                    "monthly_deposit_deduction": money_sum(
                        transactions.filter(transaction_type="deposit_deduction"),
                        "amount",
                    ),
                    "monthly_commission_amount": money_sum(
                        commissions, "commission_amount"
                    ),
                    "locked_tutors": TeachingProfile.objects.filter(
                        new_class_locked=True
                    ).count(),
                },
                "tutors": AdminFinanceTutorSerializer(tutors, many=True).data
                if request.query_params.get("page") is None
                else tutors_page["results"],
                "tutors_pagination": tutors_page,
                "recent_transactions": AdminGuaranteeTransactionSerializer(
                    recent_transactions, many=True
                ).data,
                "due_commissions": AdminCourseCommissionSerializer(
                    due_commissions, many=True
                ).data,
                "payout_requests": TutorPayoutRequestSerializer(
                    payout_requests, many=True, context={"request": request}
                ).data,
            }
        )


class AdminFinanceTutorActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        action = request.data.get("action")
        amount = request.data.get("amount")
        note = request.data.get("note", "")
        try:
            TeachingProfile.objects.get(pk=pk)
        except TeachingProfile.DoesNotExist:
            return Response(
                {"error": "Tutor profile not found"}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            if action == "top_up_deposit":
                profile = top_up_deposit(pk, amount, note=note or "Admin deposit top-up")
            elif action == "pay_commission":
                profile = pay_commission_debt(
                    pk, amount, note=note or "Admin recorded commission payment"
                )
            elif action == "deduct_commission":
                profile = deduct_commission_debt_from_deposit(
                    pk, note=note or "Admin deducted commission from deposit"
                )
            else:
                return Response(
                    {"error": "Invalid finance action."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except (TypeError, ValueError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(AdminFinanceTutorSerializer(profile).data)


class AdminTutorPayoutRequestActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            payout = mark_payout_request_processed(
                pk,
                request.data.get("action"),
                admin_user=request.user,
                admin_note=request.data.get("admin_note", ""),
            )
        except TutorPayoutRequest.DoesNotExist:
            return Response(
                {"error": "Payout request not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from apps.notifications.tasks import create_notification

        status_text = {
            "approved": "đã được duyệt, Admin đang chuẩn bị chuyển khoản",
            "paid": "đã được chuyển khoản hoàn tất",
            "rejected": "đã bị từ chối",
        }.get(payout.status, payout.status)
        create_notification(
            user_id=payout.tutor.user_id,
            title="Cập nhật yêu cầu rút tiền / hoàn cọc",
            message=f"Yêu cầu {int(payout.amount):,}đ {status_text}."
            + (f" Ghi chú: {payout.admin_note}" if payout.admin_note else ""),
            notification_type="info",
            link="/tutor/dashboard",
        )
        return Response(TutorPayoutRequestSerializer(payout, context={"request": request}).data)



# Tutor Management
class AdminTutorListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminTutorRegistrationSerializer

    def get_queryset(self):
        queryset = (
            UserTutorProfile.objects.all()
            .select_related("user")
            .prefetch_related("achievements")
        )

        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param.upper())

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(full_name__icontains=search) | queryset.filter(
                user__email__icontains=search
            )

        return queryset.order_by("-created_at")


class AdminTutorActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        action = request.data.get("action")
        reason = request.data.get("reason", "Vi phạm quy định hệ thống")
        try:
            profile = UserTutorProfile.objects.get(pk=pk)
            if action == "approve":
                approve_tutor_registration(profile)
            elif action == "reject":
                reject_tutor_registration(profile, request.data.get("reason", ""))
            elif action == "lock":
                profile.user.is_active = False
                profile.user.save()
                # Send email notification
                send_account_lock_email.delay(profile.user.email, reason)
            elif action == "remove":
                profile.user.is_active = False
                profile.user.save()
                teaching = getattr(profile.user, "teaching_profile", None)
                if teaching:
                    teaching.new_class_locked = True
                    teaching.new_class_lock_reason = reason
                    teaching.save(update_fields=["new_class_locked", "new_class_lock_reason"])
                invalidate_cache_groups("tutors")
                send_account_lock_email.delay(profile.user.email, reason)
            elif action == "unlock":
                profile.user.is_active = True
                profile.user.save()
                teaching = getattr(profile.user, "teaching_profile", None)
                if teaching and teaching.new_class_locked:
                    teaching.new_class_locked = False
                    teaching.new_class_lock_reason = ""
                    teaching.save(update_fields=["new_class_locked", "new_class_lock_reason"])
                invalidate_cache_groups("tutors")
            else:
                return Response(
                    {"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST
                )

            profile.save()
            return Response({"message": f"Tutor {action}ed successfully"})
        except UserTutorProfile.DoesNotExist:
            return Response(
                {"error": "Tutor not found"}, status=status.HTTP_404_NOT_FOUND
            )


# User Management
class AdminUserListView(generics.ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = AdminUserSerializer

    def get_queryset(self):
        queryset = User.objects.all().order_by("-created_at")

        role = self.request.query_params.get("role")
        if role == "tutor":
            queryset = queryset.filter(is_tutor=True)
        elif role == "student":
            queryset = queryset.filter(is_tutor=False, is_staff=False)
        elif role == "admin":
            queryset = queryset.filter(is_staff=True)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(username__icontains=search) | queryset.filter(
                email__icontains=search
            )

        return queryset


class AdminUserDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"error": "Không tìm thấy người dùng."},
                status=status.HTTP_404_NOT_FOUND,
            )

        def _abs_url(file_field):
            if not file_field:
                return ""
            url = file_field.url
            return request.build_absolute_uri(url) if url.startswith("/") else url

        full_name = f"{user.last_name} {user.first_name}".strip() or user.username

        # Paid 1-1 bookings & courses
        paid_bookings = Booking.objects.filter(student=user, payment_status="paid")
        total_paid_1on1_deposit = money_sum(paid_bookings, "deposit_amount")
        total_paid_1on1_value = money_sum(paid_bookings, "total_price")

        courses_qs = (
            Course.objects.filter(student=user)
            .select_related("tutor__user", "subject")
            .annotate(
                completed_sessions_num=Count(
                    "sessions", filter=Q(sessions__student_completed=True)
                )
            )
            .order_by("-created_at")
        )
        courses_data = []
        for c in courses_qs:
            tutor_name = ""
            if c.tutor:
                reg = getattr(c.tutor.user, "tutor_profile", None)
                tutor_name = (
                    c.tutor.full_name
                    or (reg.full_name if reg else "")
                    or c.tutor.user.username
                )
            courses_data.append(
                {
                    "id": c.id,
                    "title": c.title,
                    "subject_name": c.subject.name if c.subject else "",
                    "tutor_name": tutor_name,
                    "status": c.status,
                    "completed_sessions": c.completed_sessions_num,
                    "total_sessions": c.total_sessions,
                    "hourly_rate": float(c.hourly_rate or 0),
                    "start_date": c.start_date,
                    "end_date": c.end_date,
                    "schedule_time": c.schedule_time,
                    "created_at": c.created_at,
                }
            )

        # Online class enrollments & paid amounts
        enrollments_qs = (
            OnlineClassEnrollment.objects.filter(student=user)
            .select_related("online_class__tutor__user", "online_class__subject")
            .order_by("-created_at")
        )
        online_paid_total = money_sum(
            OnlineClassPayment.objects.filter(enrollment__student=user, status="paid"),
            "amount",
        )
        enrollments_data = []
        for enr in enrollments_qs:
            oc = enr.online_class
            tutor_name = ""
            if oc and oc.tutor:
                tutor_name = oc.tutor.full_name or oc.tutor.user.username
            enrollments_data.append(
                {
                    "id": enr.id,
                    "online_class_id": oc.id if oc else None,
                    "class_title": oc.title if oc else "",
                    "subject_name": oc.subject.name if (oc and oc.subject) else "",
                    "tutor_name": tutor_name,
                    "billing_cycle": enr.billing_cycle,
                    "total_paid_amount": float(enr.total_paid_amount or 0),
                    "sessions_attended": enr.sessions_attended,
                    "sessions_paid_total": enr.sessions_paid_total,
                    "status": enr.status,
                    "enrolled_at": enr.joined_at or enr.created_at,
                }
            )

        # Reviews written by student (1-1 + online class)
        reviews_data = []
        for rev in (
            CourseReview.objects.filter(course__student=user)
            .select_related("course", "tutor__user")
            .order_by("-created_at")
        ):
            tutor_name = rev.tutor.full_name if rev.tutor else ""
            reviews_data.append(
                {
                    "uid": f"course-{rev.id}",
                    "source": "Khóa học 1-1",
                    "title": rev.course.title if rev.course else "",
                    "tutor_name": tutor_name,
                    "rating": rev.rating,
                    "comment": rev.comment,
                    "created_at": rev.created_at,
                }
            )
        for orev in (
            OnlineClassReview.objects.filter(student=user)
            .select_related("online_class__tutor__user")
            .order_by("-created_at")
        ):
            tutor_name = (
                (orev.online_class.tutor.full_name or orev.online_class.tutor.user.username)
                if (orev.online_class and orev.online_class.tutor)
                else ""
            )
            reviews_data.append(
                {
                    "uid": f"online-{orev.id}",
                    "source": "Lớp nhóm online",
                    "title": orev.online_class.title if orev.online_class else "",
                    "tutor_name": tutor_name,
                    "rating": orev.rating,
                    "comment": orev.comment,
                    "created_at": orev.created_at,
                }
            )
        reviews_data.sort(key=lambda r: r["created_at"], reverse=True)

        return Response(
            {
                "profile": {
                    "id": user.id,
                    "username": user.username,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "full_name": full_name,
                    "email": user.email,
                    "phone": user.phone,
                    "bio": user.bio,
                    "avatar_url": _abs_url(user.avatar),
                    "is_verified": user.is_verified,
                    "is_active": user.is_active,
                    "is_tutor": user.is_tutor,
                    "created_at": user.created_at,
                },
                "bank_info": {
                    "bank_name": user.bank_name,
                    "bank_account_number": user.bank_account_number,
                    "bank_account_holder": user.bank_account_holder,
                    "bank_branch": user.bank_branch,
                    "bank_qr_url": _abs_url(user.bank_qr_image),
                },
                "summary": {
                    "total_paid_1on1_deposit": float(total_paid_1on1_deposit),
                    "total_paid_1on1_value": float(total_paid_1on1_value),
                    "total_paid_online": float(online_paid_total),
                    "total_paid_overall": float(total_paid_1on1_deposit + online_paid_total),
                    "courses_count": len(courses_data),
                    "online_classes_count": len(enrollments_data),
                    "reviews_count": len(reviews_data),
                },
                "courses": courses_data,
                "online_classes": enrollments_data,
                "reviews": reviews_data,
            }
        )


class AdminUserActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        action = request.data.get("action")
        try:
            user = User.objects.get(pk=pk)
            if action == "lock":
                user.is_active = False
            elif action == "unlock":
                user.is_active = True
            elif action == "delete":
                user.delete()
                return Response({"message": "User deleted successfully"})
            else:
                return Response(
                    {"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST
                )

            user.save()
            return Response({"message": f"User {action}ed successfully"})
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )


class AdminTutorRankingsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        from apps.tutors.analytics import build_tutor_revenue_rankings

        payload = build_tutor_revenue_rankings(
            mode=request.query_params.get("mode", "month"),
            year=request.query_params.get("year"),
            month=request.query_params.get("month"),
            quarter=request.query_params.get("quarter"),
        )
        return Response(payload)
