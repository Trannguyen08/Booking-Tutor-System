from decimal import Decimal

from django.conf import settings
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.payments import PayOSError
from apps.notifications.tasks import create_notification
from apps.tutors.models import TutorProfile

from .models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
    OnlineClassSession,
    OnlineClassSessionMaterial,
)
from .serializers import (
    OnlineClassEnrollmentSerializer,
    OnlineClassPaymentSerializer,
    OnlineClassReviewSerializer,
    OnlineClassSerializer,
    OnlineClassSessionMaterialSerializer,
    OnlineClassSessionSerializer,
)
from .services import (
    compute_attended_sessions,
    create_enrollment_and_payment,
    create_renewal_payment,
    kick_overdue_unpaid_enrollments,
    kick_student_by_tutor,
    notify_active_students_session_update,
    send_due_payment_reminders,
    verify_online_class_payment,
)


def _frontend_base_url(request):
    origin = request.META.get("HTTP_ORIGIN")
    if origin:
        return origin.rstrip("/")
    return getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")


class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


# ─────────────────────────────────────────────────────────────────────────────
# Public / Student Views
# ─────────────────────────────────────────────────────────────────────────────
class PublicOnlineClassListView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = (
            OnlineClass.objects.filter(status__in=["open", "ongoing"])
            .select_related("tutor__user", "subject")
            .prefetch_related("enrollments", "reviews", "sessions")
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(tutor__full_name__icontains=search)
                | Q(subject__name__icontains=search)
            )
        subject = request.query_params.get("subject")
        if subject:
            if str(subject).isdigit():
                queryset = queryset.filter(subject_id=subject)
            else:
                queryset = queryset.filter(subject__name__icontains=subject)
        level = request.query_params.get("level")
        if level:
            queryset = queryset.filter(level__icontains=level)

        from core.pagination import paginate_if_requested

        return Response(
            paginate_if_requested(
                request,
                queryset,
                OnlineClassSerializer,
                serializer_context={"request": request},
            )
        )


class PublicOnlineClassDetailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        online_class = (
            OnlineClass.objects.select_related("tutor__user", "subject")
            .prefetch_related(
                "sessions__materials__uploaded_by",
                "reviews__student",
                "enrollments",
            )
            .filter(pk=pk)
            .first()
        )
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học online."},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = OnlineClassSerializer(online_class, context={"request": request}).data
        visible_reviews = online_class.reviews.filter(is_visible=True).select_related("student")
        data["reviews"] = OnlineClassReviewSerializer(visible_reviews, many=True).data

        my_enrollment = None
        if request.user and request.user.is_authenticated:
            enrollment = (
                OnlineClassEnrollment.objects.filter(
                    online_class=online_class, student=request.user
                )
                .prefetch_related("payments")
                .order_by("-created_at")
                .first()
            )
            if enrollment:
                my_enrollment = OnlineClassEnrollmentSerializer(
                    enrollment, context={"request": request}
                ).data
        data["my_enrollment"] = my_enrollment
        has_room_access = bool(
            (my_enrollment and my_enrollment.get("status") in ("active", "completed"))
            or (
                request.user.is_authenticated
                and (online_class.tutor.user_id == request.user.id or request.user.is_staff)
            )
        )
        if not has_room_access:
            data["meeting_link"] = ""
            for s in data.get("sessions") or []:
                s["notes"] = ""
                s["materials"] = []
                s["material_url"] = ""
        return Response(data)


class StudentOnlineClassEnrollView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        online_class = OnlineClass.objects.filter(pk=pk).first()
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học online."},
                status=status.HTTP_404_NOT_FOUND,
            )

        billing_cycle = request.data.get("billing_cycle") or "per_session"
        try:
            enrollment, payment, checkout_url = create_enrollment_and_payment(
                student=request.user,
                online_class=online_class,
                billing_cycle=billing_cycle,
                return_url_base=_frontend_base_url(request),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except PayOSError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                "checkout_url": checkout_url,
                "payment": OnlineClassPaymentSerializer(payment).data,
                "enrollment": OnlineClassEnrollmentSerializer(
                    enrollment, context={"request": request}
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class StudentOnlineClassPayNextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, enrollment_id):
        enrollment = (
            OnlineClassEnrollment.objects.select_related("online_class")
            .filter(pk=enrollment_id, student=request.user)
            .first()
        )
        if not enrollment:
            return Response(
                {"error": "Không tìm thấy thông tin đăng ký lớp."},
                status=status.HTTP_404_NOT_FOUND,
            )

        billing_cycle = request.data.get("billing_cycle")
        try:
            enrollment, payment, checkout_url = create_renewal_payment(
                student=request.user,
                enrollment=enrollment,
                billing_cycle=billing_cycle,
                return_url_base=_frontend_base_url(request),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except PayOSError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                "checkout_url": checkout_url,
                "payment": OnlineClassPaymentSerializer(payment).data,
                "enrollment": OnlineClassEnrollmentSerializer(
                    enrollment, context={"request": request}
                ).data,
            }
        )


class OnlineClassPaymentVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        order_code = request.data.get("orderCode") or request.query_params.get("orderCode")
        payment_id = request.data.get("paymentId") or request.query_params.get("paymentId")

        queryset = OnlineClassPayment.objects.select_related(
            "enrollment__online_class", "student"
        ).filter(student=request.user)

        if order_code:
            payment = queryset.filter(payos_order_code=order_code).first()
        elif payment_id:
            payment = queryset.filter(pk=payment_id).first()
        else:
            return Response(
                {"error": "orderCode hoặc paymentId là bắt buộc."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not payment:
            return Response(
                {"error": "Không tìm thấy giao dịch."}, status=status.HTTP_404_NOT_FOUND
            )

        try:
            payment = verify_online_class_payment(payment)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except PayOSError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        enrollment = OnlineClassEnrollment.objects.prefetch_related("payments").get(
            pk=payment.enrollment_id
        )
        return Response(
            {
                "payment": OnlineClassPaymentSerializer(payment).data,
                "enrollment": OnlineClassEnrollmentSerializer(
                    enrollment, context={"request": request}
                ).data,
            }
        )


class StudentMyOnlineClassesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        enrollments = (
            OnlineClassEnrollment.objects.filter(student=request.user)
            .select_related("online_class__tutor__user", "online_class__subject")
            .prefetch_related("payments", "online_class__sessions")
            .order_by("-created_at")
        )
        results = []
        for item in enrollments:
            serialized = OnlineClassEnrollmentSerializer(
                item, context={"request": request}
            ).data
            serialized["online_class_detail"] = OnlineClassSerializer(
                item.online_class, context={"request": request}
            ).data
            if item.status != "active":
                serialized["online_class_detail"]["meeting_link"] = ""
            results.append(serialized)

        from core.pagination import paginate_if_requested

        return Response(paginate_if_requested(request, results))


class StudentOnlineClassReviewCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        enrollment = (
            OnlineClassEnrollment.objects.select_related("online_class")
            .filter(
                online_class_id=pk,
                student=request.user,
                status__in=["active", "completed"],
            )
            .first()
        )
        if not enrollment:
            return Response(
                {"error": "Chỉ học viên đã tham gia lớp học mới có thể đánh giá."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if hasattr(enrollment, "review"):
            return Response(
                {"error": "Bạn đã đánh giá lớp học này rồi."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OnlineClassReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = serializer.save(
            online_class=enrollment.online_class,
            enrollment=enrollment,
            student=request.user,
        )
        return Response(OnlineClassReviewSerializer(review).data, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# Tutor Views
# ─────────────────────────────────────────────────────────────────────────────
class TutorOnlineClassListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_tutor_profile(self, user):
        return TutorProfile.objects.get(user=user)

    def get(self, request):
        try:
            tutor = self._get_tutor_profile(request.user)
        except TutorProfile.DoesNotExist:
            return Response(
                {"error": "Không tìm thấy hồ sơ gia sư."}, status=status.HTTP_404_NOT_FOUND
            )
        classes = (
            OnlineClass.objects.filter(tutor=tutor)
            .select_related("tutor__user", "subject")
            .prefetch_related(
                "sessions__materials__uploaded_by",
                "enrollments__student",
                "enrollments__payments",
                "reviews",
            )
        )
        return Response(OnlineClassSerializer(classes, many=True, context={"request": request}).data)

    def post(self, request):
        try:
            tutor = self._get_tutor_profile(request.user)
        except TutorProfile.DoesNotExist:
            return Response(
                {"error": "Không tìm thấy hồ sơ gia sư."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = OnlineClassSerializer(
            data=request.data, context={"request": request, "tutor": tutor}
        )
        serializer.is_valid(raise_exception=True)
        online_class = serializer.save(tutor=tutor)
        return Response(
            OnlineClassSerializer(online_class, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TutorOnlineClassDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        online_class = (
            OnlineClass.objects.select_related("tutor__user", "subject")
            .prefetch_related(
                "sessions__materials__uploaded_by",
                "enrollments__student",
                "enrollments__payments",
                "reviews__student",
            )
            .filter(pk=pk, tutor__user=request.user)
            .first()
        )
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học online."}, status=status.HTTP_404_NOT_FOUND
            )
        data = OnlineClassSerializer(online_class, context={"request": request}).data
        data["enrollments_count"] = online_class.enrollments.count()
        data["reviews"] = OnlineClassReviewSerializer(
            online_class.reviews.all(), many=True
        ).data
        return Response(data)


class TutorOnlineClassStudentsPaymentsView(APIView):
    """Dedicated endpoint returning student roster & tuition payment logs for an online class."""

    permission_classes = [permissions.IsAuthenticated]

    STATUS_LABELS = {
        "pending_payment": "Chờ thanh toán",
        "active": "Đang học",
        "completed": "Hoàn thành",
        "kicked_by_tutor": "Mời rời lớp",
        "kicked_unpaid": "Quá hạn học phí (rời lớp)",
        "cancelled": "Đã hủy",
    }

    def get(self, request, pk):
        online_class = OnlineClass.objects.filter(pk=pk, tutor__user=request.user).first()
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học online."}, status=status.HTTP_404_NOT_FOUND
            )

        enrollments = (
            online_class.enrollments.select_related("student")
            .prefetch_related("payments")
            .all()
        )
        rows = []
        for enr in enrollments:
            student_name = (
                enr.student.get_full_name() or enr.student.username or enr.student.email
            ).strip()
            paid_list = sorted(
                [p for p in enr.payments.all() if p.status == "paid"],
                key=lambda p: p.paid_at or p.created_at,
            )
            payments_payload = [
                {
                    "id": p.id,
                    "amount": str(p.amount),
                    "billing_cycle": p.billing_cycle,
                    "sessions_covered": p.sessions_covered,
                    "payos_order_code": p.payos_order_code,
                    "paid_date": (p.paid_at or p.created_at).date().isoformat(),
                }
                for p in paid_list
            ]
            paid_sum = sum((Decimal(p.amount) for p in paid_list), Decimal("0"))
            total_paid = paid_sum if paid_list else Decimal(enr.total_paid_amount or 0)
            rows.append(
                {
                    "id": enr.id,
                    "enrollment_id": enr.id,
                    "student_id": enr.student_id,
                    "student_name": student_name,
                    "student_email": enr.student.email,
                    "billing_cycle": enr.billing_cycle,
                    "sessions_paid_total": enr.sessions_paid_total,
                    "sessions_attended": compute_attended_sessions(enr),
                    "computed_attended_sessions": compute_attended_sessions(enr),
                    "payments": payments_payload,
                    "total_paid_amount": str(total_paid),
                    "status": enr.status,
                    "status_label": self.STATUS_LABELS.get(enr.status, enr.status),
                    "kick_type": enr.kick_type,
                    "kick_reason": enr.kick_reason or "",
                    "refund_amount": str(enr.refund_amount or Decimal("0")),
                    "refund_status": enr.refund_status,
                    "next_payment_due_date": (
                        enr.next_payment_due_date.isoformat()
                        if enr.next_payment_due_date
                        else None
                    ),
                }
            )

        rows.sort(key=lambda r: r["student_name"].lower())
        if request.query_params.get("page") is not None:
            from core.pagination import paginate_items

            paginated = paginate_items(request, rows, default_page_size=10)
            return Response(
                {
                    "class_id": online_class.id,
                    "class_title": online_class.title,
                    "total_students": len(rows),
                    "students": paginated["results"],
                    "pagination": paginated,
                }
            )
        return Response(
            {
                "class_id": online_class.id,
                "class_title": online_class.title,
                "total_students": len(rows),
                "students": rows,
            }
        )

    def patch(self, request, pk):
        online_class = OnlineClass.objects.filter(pk=pk, tutor__user=request.user).first()
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học online."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = OnlineClassSerializer(
            online_class,
            data=request.data,
            partial=True,
            context={"request": request, "tutor": online_class.tutor},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(OnlineClassSerializer(online_class, context={"request": request}).data)


class TutorOnlineClassSessionCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        online_class = OnlineClass.objects.filter(pk=pk, tutor__user=request.user).first()
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học online."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = OnlineClassSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = serializer.save(online_class=online_class)
        return Response(OnlineClassSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class TutorOnlineClassSessionUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, session_id):
        session = (
            OnlineClassSession.objects.select_related("online_class__tutor")
            .filter(pk=session_id, online_class__tutor__user=request.user)
            .first()
        )
        if not session:
            return Response(
                {"error": "Không tìm thấy buổi học."}, status=status.HTTP_404_NOT_FOUND
            )
        old_notes = session.notes
        serializer = OnlineClassSessionSerializer(
            session, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        notified = 0
        if "notes" in request.data and (session.notes or "").strip() and session.notes != old_notes:
            notified = notify_active_students_session_update(
                online_class=session.online_class,
                session=session,
                action_title="Lời nhắn mới từ gia sư",
                detail_text=session.notes.strip()[:240],
            )

        data = OnlineClassSessionSerializer(session, context={"request": request}).data
        data["notified_students"] = notified
        return Response(data)


class TutorOnlineClassSessionMaterialCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, session_id):
        session = (
            OnlineClassSession.objects.select_related("online_class__tutor")
            .filter(pk=session_id, online_class__tutor__user=request.user)
            .first()
        )
        if not session:
            return Response(
                {"error": "Không tìm thấy buổi học."}, status=status.HTTP_404_NOT_FOUND
            )

        material_type = (request.data.get("material_type") or "note").strip()
        if material_type not in dict(OnlineClassSessionMaterial.MATERIAL_TYPES):
            return Response(
                {"error": "Loại tài liệu không hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        title = (request.data.get("title") or "").strip()
        content = (request.data.get("content") or "").strip()
        external_url = (request.data.get("external_url") or "").strip()
        uploaded_file = request.FILES.get("file")

        if material_type == "link" and not external_url and content:
            external_url = content

        if not title:
            title = (
                getattr(uploaded_file, "name", "")
                or external_url
                or f"Tài liệu buổi {session.session_number}"
            )

        if material_type in ("file", "image", "video") and not uploaded_file and not external_url:
            return Response(
                {"error": "Vui lòng chọn file tải lên hoặc nhập đường dẫn."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if material_type == "note" and not content:
            return Response(
                {"error": "Vui lòng nhập nội dung ghi chú."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        material = OnlineClassSessionMaterial.objects.create(
            session=session,
            uploaded_by=request.user,
            material_type=material_type,
            title=title,
            content=content,
            file=uploaded_file,
            external_url=external_url,
        )

        notified = notify_active_students_session_update(
            online_class=session.online_class,
            session=session,
            action_title="Tài liệu buổi học mới",
            detail_text=f"{material.get_material_type_display()}: {material.title}",
        )
        return Response(
            {
                "material": OnlineClassSessionMaterialSerializer(
                    material, context={"request": request}
                ).data,
                "notified_students": notified,
            },
            status=status.HTTP_201_CREATED,
        )


class TutorOnlineClassSessionMaterialDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, material_id):
        material = (
            OnlineClassSessionMaterial.objects.select_related(
                "session__online_class__tutor"
            )
            .filter(
                pk=material_id,
                session__online_class__tutor__user=request.user,
            )
            .first()
        )
        if not material:
            return Response(
                {"error": "Không tìm thấy tài liệu."}, status=status.HTTP_404_NOT_FOUND
            )
        material.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TutorKickStudentView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, enrollment_id):
        reason = request.data.get("kick_reason") or request.data.get("reason") or ""
        evidence_note = request.data.get("kick_evidence_note") or request.data.get("evidence_note") or ""
        evidence_file = request.FILES.get("kick_evidence_file") or request.FILES.get("evidence_file")
        attended_raw = request.data.get("attended_sessions")
        attended_sessions = None
        if attended_raw not in (None, ""):
            try:
                attended_sessions = int(attended_raw)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Số buổi đã học không hợp lệ."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            enrollment = kick_student_by_tutor(
                enrollment_id=enrollment_id,
                tutor_user=request.user,
                reason=reason,
                evidence_file=evidence_file,
                evidence_note=evidence_note,
                attended_sessions=attended_sessions,
            )
        except OnlineClassEnrollment.DoesNotExist:
            return Response(
                {"error": "Không tìm thấy học viên trong lớp."}, status=status.HTTP_404_NOT_FOUND
            )
        except PermissionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(OnlineClassEnrollmentSerializer(enrollment, context={"request": request}).data)


# ─────────────────────────────────────────────────────────────────────────────
# Admin Views
# ─────────────────────────────────────────────────────────────────────────────
class AdminOnlineClassOverviewView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        classes = (
            OnlineClass.objects.select_related("tutor__user", "subject")
            .prefetch_related("sessions", "enrollments", "reviews")
            .order_by("-created_at")
        )
        enrollments = (
            OnlineClassEnrollment.objects.select_related(
                "online_class__tutor", "student"
            )
            .prefetch_related("payments")
            .order_by("-updated_at")
        )
        payments_qs = OnlineClassPayment.objects.select_related(
            "online_class", "student"
        ).order_by("-created_at")
        reviews = OnlineClassReview.objects.select_related(
            "online_class", "student"
        ).order_by("-created_at")

        refunds = enrollments.filter(kick_type__in=["tutor_kick", "overdue_unpaid"])

        summary = {
            "total_classes": classes.count(),
            "open_classes": classes.filter(status__in=["open", "ongoing"]).count(),
            "active_enrollments": enrollments.filter(status="active").count(),
            "pending_refunds": refunds.filter(refund_status="pending").count(),
            "total_paid_revenue": payments_qs.filter(status="paid").aggregate(
                total=Sum("amount")
            )["total"]
            or 0,
            "total_pending_refund_amount": refunds.filter(
                refund_status="pending"
            ).aggregate(total=Sum("refund_amount"))["total"]
            or 0,
        }

        return Response(
            {
                "summary": summary,
                "classes": OnlineClassSerializer(
                    classes, many=True, context={"request": request}
                ).data,
                "enrollments": OnlineClassEnrollmentSerializer(
                    enrollments[:150], many=True, context={"request": request}
                ).data,
                "kicks_and_refunds": OnlineClassEnrollmentSerializer(
                    refunds, many=True, context={"request": request}
                ).data,
                "payments": OnlineClassPaymentSerializer(
                    payments_qs[:100], many=True
                ).data,
                "reviews": OnlineClassReviewSerializer(reviews, many=True).data,
            }
        )


class AdminOnlineClassActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        new_status = request.data.get("status")
        if new_status not in ("open", "ongoing", "completed", "closed", "cancelled"):
            return Response(
                {"error": "Trạng thái không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST
            )
        online_class = OnlineClass.objects.filter(pk=pk).first()
        if not online_class:
            return Response(
                {"error": "Không tìm thấy lớp học."}, status=status.HTTP_404_NOT_FOUND
            )
        online_class.status = new_status
        online_class.save(update_fields=["status", "updated_at"])
        return Response(OnlineClassSerializer(online_class, context={"request": request}).data)


class AdminOnlineRefundActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, enrollment_id):
        action = request.data.get("action")
        admin_note = (request.data.get("admin_note") or "").strip()
        if action not in ("mark_refunded", "reject_refund"):
            return Response(
                {"error": "Thao tác không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST
            )
        enrollment = OnlineClassEnrollment.objects.select_related("online_class").filter(
            pk=enrollment_id
        ).first()
        if not enrollment:
            return Response(
                {"error": "Không tìm thấy hồ sơ hoàn tiền."}, status=status.HTTP_404_NOT_FOUND
            )
        if enrollment.refund_status != "pending":
            return Response(
                {"error": "Hồ sơ này không ở trạng thái chờ hoàn tiền."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        enrollment.refund_status = "refunded" if action == "mark_refunded" else "rejected"
        enrollment.refund_admin_note = admin_note
        enrollment.refund_processed_by = request.user
        enrollment.refund_processed_at = timezone.now()
        enrollment.save(
            update_fields=[
                "refund_status",
                "refund_admin_note",
                "refund_processed_by",
                "refund_processed_at",
                "updated_at",
            ]
        )

        create_notification(
            user_id=enrollment.student_id,
            title="Cập nhật hoàn tiền lớp học online",
            message=(
                f"Yêu cầu hoàn {int(enrollment.refund_amount):,}đ cho lớp '{enrollment.online_class.title}' "
                f"đã được chuyển sang trạng thái: {enrollment.get_refund_status_display()}."
            ),
            notification_type="info",
            link=f"/online-classes/{enrollment.online_class_id}",
        )
        return Response(
            OnlineClassEnrollmentSerializer(enrollment, context={"request": request}).data
        )


class AdminOnlineReviewActionView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, review_id):
        review = OnlineClassReview.objects.filter(pk=review_id).first()
        if not review:
            return Response(
                {"error": "Không tìm thấy đánh giá."}, status=status.HTTP_404_NOT_FOUND
            )
        action = request.data.get("action")
        if action not in ("hide", "show"):
            return Response(
                {"error": "Thao tác không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST
            )
        review.is_visible = action == "show"
        review.save(update_fields=["is_visible", "updated_at"])
        return Response(OnlineClassReviewSerializer(review).data)


class AdminRunBillingWorkersView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        reminders_sent = send_due_payment_reminders()
        overdue_kicked = kick_overdue_unpaid_enrollments()
        return Response(
            {
                "reminders_sent": reminders_sent,
                "overdue_kicked": overdue_kicked,
            }
        )
