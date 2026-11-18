from datetime import timedelta
from decimal import Decimal
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from apps.bookings.payments import (
    PayOSError,
    create_payos_payment_request,
    get_payment_request,
)
from apps.notifications.tasks import create_notification

from .models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassSession,
)

logger = logging.getLogger(__name__)


def compute_attended_sessions(enrollment: OnlineClassEnrollment, now=None) -> int:
    current_time = now or timezone.now()
    qs = OnlineClassSession.objects.filter(online_class=enrollment.online_class).exclude(
        status="cancelled"
    )
    if enrollment.joined_at:
        qs = qs.filter(scheduled_at__gte=enrollment.joined_at)
    elapsed = qs.filter(status="completed").count()
    scheduled_past = (
        qs.exclude(status="completed").filter(scheduled_at__lte=current_time).count()
    )
    return min(enrollment.sessions_paid_total, elapsed + scheduled_past)


def calculate_prorata_refund(
    enrollment: OnlineClassEnrollment, attended_sessions: int | None = None
):
    paid_sessions = int(enrollment.sessions_paid_total or 0)
    if paid_sessions <= 0 or enrollment.total_paid_amount <= 0:
        return 0, 0, Decimal("0.00")

    if attended_sessions is None:
        attended = compute_attended_sessions(enrollment)
    else:
        attended = max(0, min(int(attended_sessions), paid_sessions))

    remaining = max(0, paid_sessions - attended)
    if remaining <= 0:
        return attended, 0, Decimal("0.00")

    refund = (
        Decimal(enrollment.total_paid_amount)
        * Decimal(remaining)
        / Decimal(paid_sessions)
    ).quantize(Decimal("0.01"))
    return attended, remaining, refund


def _next_due_date_after_payment(
    online_class: OnlineClass, enrollment: OnlineClassEnrollment, billing_cycle: str
):
    if billing_cycle == "full_course":
        return None

    today = timezone.localdate()
    base = max(
        today,
        enrollment.next_payment_due_date or online_class.start_date or today,
    )

    # per_session
    upcoming = (
        online_class.sessions.filter(scheduled_at__date__gt=base)
        .exclude(status="cancelled")
        .order_by("scheduled_at")
        .first()
    )
    if upcoming:
        return timezone.localtime(upcoming.scheduled_at).date()
    return base + timedelta(days=7)


def _generate_order_code(payment_id: int) -> int:
    return int(
        f"{payment_id}{timezone.now():%H%M%S}{get_random_string(3, '0123456789')}"
    )


def create_enrollment_and_payment(
    *,
    student,
    online_class: OnlineClass,
    billing_cycle: str,
    return_url_base: str,
):
    allowed = [
        c
        for c in (online_class.allowed_billing_cycles or ["per_session", "full_course"])
        if c in ("per_session", "full_course")
    ]
    if billing_cycle not in allowed:
        raise ValueError("Lớp học này không hỗ trợ hình thức thanh toán đã chọn.")

    amount, sessions_covered = online_class.get_cycle_price_and_sessions(billing_cycle)
    if amount <= 0:
        raise ValueError("Học phí cho hình thức thanh toán này chưa được thiết lập.")

    with transaction.atomic():
        locked_class = OnlineClass.objects.select_for_update().get(pk=online_class.pk)
        if locked_class.status not in ("open", "ongoing"):
            raise ValueError("Lớp học hiện không mở đăng ký.")

        existing = (
            OnlineClassEnrollment.objects.select_for_update()
            .filter(online_class=locked_class, student=student)
            .order_by("-created_at")
            .first()
        )
        if existing:
            if existing.status == "active":
                raise ValueError("Bạn đã tham gia lớp học này.")
            if existing.status in ("kicked_by_tutor", "kicked_unpaid"):
                raise ValueError("Bạn đã bị mời khỏi lớp học này.")

        active_count = OnlineClassEnrollment.objects.filter(
            online_class=locked_class, status="active"
        ).count()
        if active_count >= locked_class.max_students:
            raise ValueError("Lớp học đã đạt giới hạn số lượng học viên.")

        if existing and existing.status == "pending_payment":
            enrollment = existing
            enrollment.billing_cycle = billing_cycle
            enrollment.save(update_fields=["billing_cycle", "updated_at"])
        else:
            enrollment = OnlineClassEnrollment.objects.create(
                online_class=locked_class,
                student=student,
                billing_cycle=billing_cycle,
                status="pending_payment",
            )

        pending_payment = (
            OnlineClassPayment.objects.filter(
                enrollment=enrollment, status="pending", billing_cycle=billing_cycle
            )
            .exclude(payment_checkout_url="")
            .first()
        )
        if pending_payment:
            return enrollment, pending_payment, pending_payment.payment_checkout_url

        payment = OnlineClassPayment.objects.create(
            enrollment=enrollment,
            student=student,
            online_class=locked_class,
            billing_cycle=billing_cycle,
            sessions_covered=sessions_covered,
            amount=amount,
            status="pending",
        )
        payment.payos_order_code = _generate_order_code(payment.id)
        payment.save(update_fields=["payos_order_code"])

    return _attach_payos_checkout(
        enrollment=enrollment,
        payment=payment,
        return_url_base=return_url_base,
    )


def create_renewal_payment(
    *,
    student,
    enrollment: OnlineClassEnrollment,
    billing_cycle: str | None,
    return_url_base: str,
):
    if enrollment.student_id != student.id:
        raise ValueError("Không tìm thấy thông tin đăng ký lớp học.")
    if enrollment.status != "active":
        raise ValueError("Chỉ học viên đang học mới có thể đóng học phí kỳ tiếp theo.")

    cycle = billing_cycle or enrollment.billing_cycle
    if cycle == "full_course":
        raise ValueError("Bạn đã chọn thanh toán toàn khóa.")

    online_class = enrollment.online_class
    allowed = [
        c
        for c in (online_class.allowed_billing_cycles or ["per_session", "full_course"])
        if c in ("per_session", "full_course")
    ]
    if cycle not in allowed:
        raise ValueError("Lớp học không hỗ trợ hình thức thanh toán này.")

    amount, sessions_covered = online_class.get_cycle_price_and_sessions(cycle)
    if amount <= 0:
        raise ValueError("Học phí cho hình thức thanh toán này chưa hợp lệ.")

    pending_payment = (
        OnlineClassPayment.objects.filter(
            enrollment=enrollment, status="pending", billing_cycle=cycle
        )
        .exclude(payment_checkout_url="")
        .first()
    )
    if pending_payment:
        return enrollment, pending_payment, pending_payment.payment_checkout_url

    payment = OnlineClassPayment.objects.create(
        enrollment=enrollment,
        student=student,
        online_class=online_class,
        billing_cycle=cycle,
        sessions_covered=sessions_covered,
        amount=amount,
        status="pending",
    )
    payment.payos_order_code = _generate_order_code(payment.id)
    payment.save(update_fields=["payos_order_code"])

    return _attach_payos_checkout(
        enrollment=enrollment,
        payment=payment,
        return_url_base=return_url_base,
    )


def _attach_payos_checkout(*, enrollment, payment, return_url_base: str):
    return_url = (
        f"{return_url_base}/payment/success?onlineClassId={enrollment.online_class_id}"
        f"&paymentId={payment.id}"
    )
    cancel_url = (
        f"{return_url_base}/online-classes/{enrollment.online_class_id}?payment=cancelled"
    )
    payos_data = create_payos_payment_request(
        order_code=payment.payos_order_code,
        amount_vnd=payment.amount,
        description=f"Lop OL {enrollment.online_class_id} P{payment.id}",
        buyer_name=payment.student.get_full_name()
        or payment.student.username
        or payment.student.email,
        buyer_email=payment.student.email,
        item_name=f"Hoc phi {enrollment.online_class.title[:60]}",
        return_url=return_url,
        cancel_url=cancel_url,
    )
    payment.payos_payment_link_id = str(payos_data.get("paymentLinkId") or "")
    payment.payment_checkout_url = payos_data.get("checkoutUrl") or ""
    payment.save(
        update_fields=["payos_payment_link_id", "payment_checkout_url", "updated_at"]
    )
    return enrollment, payment, payment.payment_checkout_url


def mark_online_class_payment_paid(payment_id: int) -> OnlineClassPayment:
    with transaction.atomic():
        payment = OnlineClassPayment.objects.select_for_update().select_related(
            "enrollment__online_class", "student"
        ).get(pk=payment_id)
        if payment.status == "paid":
            return payment

        enrollment = OnlineClassEnrollment.objects.select_for_update().get(
            pk=payment.enrollment_id
        )
        online_class = OnlineClass.objects.select_for_update().get(
            pk=payment.online_class_id
        )

        if enrollment.status == "pending_payment":
            active_count = OnlineClassEnrollment.objects.filter(
                online_class=online_class, status="active"
            ).count()
            if active_count >= online_class.max_students:
                raise ValueError("Lớp học đã đủ số lượng học viên.")
            enrollment.status = "active"
            enrollment.joined_at = timezone.now()

        payment.status = "paid"
        payment.paid_at = timezone.now()
        payment.save(update_fields=["status", "paid_at", "updated_at"])

        enrollment.billing_cycle = payment.billing_cycle
        enrollment.total_paid_amount = Decimal(enrollment.total_paid_amount or 0) + Decimal(
            payment.amount
        )
        enrollment.sessions_paid_total = int(enrollment.sessions_paid_total or 0) + int(
            payment.sessions_covered
        )
        enrollment.next_payment_due_date = _next_due_date_after_payment(
            online_class, enrollment, payment.billing_cycle
        )
        enrollment.last_reminder_sent_for_due_date = None
        enrollment.save(
            update_fields=[
                "status",
                "joined_at",
                "billing_cycle",
                "total_paid_amount",
                "sessions_paid_total",
                "next_payment_due_date",
                "last_reminder_sent_for_due_date",
                "updated_at",
            ]
        )

    create_notification(
        user_id=payment.student_id,
        title="Thanh toán lớp học thành công",
        message=f"Bạn đã thanh toán {int(payment.amount):,}đ cho lớp '{payment.online_class.title}'.",
        notification_type="success",
        link=f"/online-classes/{payment.online_class_id}",
    )
    return payment


def verify_online_class_payment(payment: OnlineClassPayment) -> OnlineClassPayment:
    if payment.status == "paid":
        return payment
    if not payment.payos_order_code:
        raise ValueError("Giao dịch chưa có mã PayOS.")
    payos_data = get_payment_request(payment.payos_order_code)
    payos_status = (payos_data.get("status") or "").upper()
    if payos_status == "PAID":
        return mark_online_class_payment_paid(payment.id)
    if payos_status == "CANCELLED":
        payment.status = "cancelled"
        payment.save(update_fields=["status", "updated_at"])
    elif payos_status == "FAILED":
        payment.status = "failed"
        payment.save(update_fields=["status", "updated_at"])
    return payment


def kick_student_by_tutor(
    *,
    enrollment_id: int,
    tutor_user,
    reason: str,
    evidence_file=None,
    evidence_note: str = "",
    attended_sessions: int | None = None,
) -> OnlineClassEnrollment:
    clean_reason = (reason or "").strip()
    clean_note = (evidence_note or "").strip()
    if not clean_reason:
        raise ValueError("Vui lòng nhập lý do mời học viên rời lớp.")
    if not evidence_file and not clean_note:
        raise ValueError("Vui lòng đính kèm minh chứng (file/ảnh hoặc mô tả minh chứng).")

    with transaction.atomic():
        enrollment = (
            OnlineClassEnrollment.objects.select_for_update()
            .select_related("online_class__tutor", "student")
            .get(pk=enrollment_id)
        )
        if enrollment.online_class.tutor.user_id != tutor_user.id:
            raise PermissionError("Bạn không có quyền thao tác với lớp học này.")
        if enrollment.status != "active":
            raise ValueError("Chỉ có thể mời học viên đang hoạt động rời lớp.")

        attended, remaining, refund_amount = calculate_prorata_refund(
            enrollment, attended_sessions=attended_sessions
        )
        enrollment.sessions_attended = attended
        enrollment.refund_sessions_remaining = remaining
        enrollment.refund_amount = refund_amount
        enrollment.refund_status = "pending" if refund_amount > 0 else "none"
        enrollment.status = "kicked_by_tutor"
        enrollment.kick_type = "tutor_kick"
        enrollment.kick_reason = clean_reason
        enrollment.kick_evidence_note = clean_note
        if evidence_file:
            enrollment.kick_evidence_file = evidence_file
        enrollment.kicked_at = timezone.now()
        enrollment.kicked_by = tutor_user
        enrollment.save()

    create_notification(
        user_id=enrollment.student_id,
        title="Thông báo rời lớp học online",
        message=(
            f"Gia sư đã mời bạn rời lớp '{enrollment.online_class.title}'. "
            f"Lý do: {clean_reason}. "
            + (
                f"Số buổi chưa học: {remaining}, tiền hoàn dự kiến: {int(refund_amount):,}đ."
                if refund_amount > 0
                else "Không phát sinh số buổi dư cần hoàn tiền."
            )
        ),
        notification_type="warning",
        link=f"/online-classes/{enrollment.online_class_id}",
    )
    try:
        send_mail(
            subject=f"TutorMatch - Thông báo rời lớp {enrollment.online_class.title}",
            message=(
                f"Chào {enrollment.student.username},\n\n"
                f"Gia sư đã mời bạn rời khỏi lớp '{enrollment.online_class.title}'.\n"
                f"Lý do: {clean_reason}\n"
                f"Số buổi đã học: {attended}/{enrollment.sessions_paid_total}\n"
                f"Số buổi chưa học: {remaining}\n"
                f"Số tiền hoàn lại tương ứng: {int(refund_amount):,}đ\n\n"
                "Trân trọng,\nĐội ngũ TutorMatch."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[enrollment.student.email],
            fail_silently=True,
        )
    except Exception as exc:
        logger.warning("Failed to send kick email: %s", exc)
    return enrollment


def notify_active_students_session_update(
    *,
    online_class: OnlineClass,
    session: OnlineClassSession,
    action_title: str,
    detail_text: str = "",
) -> int:
    """Send email + in-app notification to every active student in an online class."""
    active_enrollments = (
        OnlineClassEnrollment.objects.select_related("student")
        .filter(online_class=online_class, status="active")
    )
    notified = 0
    for enrollment in active_enrollments:
        student = enrollment.student
        try:
            send_mail(
                subject=f"TutorMatch - {action_title} ({online_class.title})",
                message=(
                    f"Chào {student.get_full_name() or student.username},\n\n"
                    f"Gia sư {online_class.tutor.full_name} vừa cập nhật nội dung cho "
                    f"Buổi {session.session_number} ({session.title}) trong lớp '{online_class.title}'.\n"
                    + (f"\nChi tiết: {detail_text}\n" if detail_text else "")
                    + "\nVui lòng đăng nhập TutorMatch và vào trang lớp học để xem tài liệu và lời nhắn mới nhất.\n\n"
                    "Trân trọng,\nĐội ngũ TutorMatch."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[student.email],
                fail_silently=True,
            )
        except Exception as exc:
            logger.warning("Failed sending session material email to %s: %s", student.email, exc)

        create_notification(
            user_id=student.id,
            title=f"{action_title} - Buổi {session.session_number}",
            message=(
                f"Lớp '{online_class.title}': {detail_text}"
                if detail_text
                else f"Gia sư vừa cập nhật tài liệu/lời nhắn cho Buổi {session.session_number} lớp '{online_class.title}'."
            ),
            notification_type="course",
            link=f"/online-classes/{online_class.id}",
        )
        notified += 1
    return notified


def send_due_payment_reminders(today=None) -> int:
    current_date = today or timezone.localdate()
    enrollments = OnlineClassEnrollment.objects.select_related(
        "online_class", "student"
    ).filter(
        status="active",
        next_payment_due_date__isnull=False,
        billing_cycle="per_session",
    )
    sent_count = 0
    for enrollment in enrollments:
        due_date = enrollment.next_payment_due_date
        days_left = (due_date - current_date).days
        if not (0 <= days_left <= 2):
            continue
        if enrollment.last_reminder_sent_for_due_date == due_date:
            continue

        grace_days = enrollment.online_class.payment_grace_days
        grace_deadline = due_date + timedelta(days=grace_days)
        subject = f"TutorMatch - Nhắc đóng học phí lớp {enrollment.online_class.title}"
        body = (
            f"Chào {enrollment.student.username},\n\n"
            f"Học phí kỳ tiếp theo của lớp '{enrollment.online_class.title}' sẽ đến hạn vào ngày {due_date:%d/%m/%Y} "
            f"(còn {days_left} ngày).\n"
            f"Thời gian gia hạn tối đa của lớp là {grace_days} ngày (hạn chót: {grace_deadline:%d/%m/%Y}). "
            "Nếu quá hạn gia hạn mà chưa hoàn tất học phí, hệ thống sẽ tự động xóa khỏi lớp và không hoàn tiền.\n\n"
            "Vui lòng truy cập lớp học để thanh toán qua PayOS.\n\nTrân trọng,\nTutorMatch."
        )
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[enrollment.student.email],
                fail_silently=False,
            )
        except Exception as exc:
            logger.warning("Failed sending payment reminder to %s: %s", enrollment.student.email, exc)

        create_notification(
            user_id=enrollment.student_id,
            title="Nhắc nhở đóng học phí",
            message=f"Học phí lớp '{enrollment.online_class.title}' đến hạn {due_date:%d/%m/%Y} (gia hạn tối đa {grace_days} ngày).",
            notification_type="warning",
            link=f"/online-classes/{enrollment.online_class_id}",
        )
        enrollment.last_reminder_sent_for_due_date = due_date
        enrollment.save(update_fields=["last_reminder_sent_for_due_date", "updated_at"])
        sent_count += 1

    return sent_count


def kick_overdue_unpaid_enrollments(today=None) -> int:
    current_date = today or timezone.localdate()
    enrollments = OnlineClassEnrollment.objects.select_related(
        "online_class", "student"
    ).filter(
        status="active",
        next_payment_due_date__isnull=False,
        billing_cycle="per_session",
    )
    kicked_count = 0
    for enrollment in enrollments:
        grace_days = int(enrollment.online_class.payment_grace_days or 0)
        deadline = enrollment.next_payment_due_date + timedelta(days=grace_days)
        if current_date <= deadline:
            continue

        with transaction.atomic():
            locked = OnlineClassEnrollment.objects.select_for_update().get(pk=enrollment.pk)
            if locked.status != "active":
                continue
            locked.status = "kicked_unpaid"
            locked.kick_type = "overdue_unpaid"
            locked.kick_reason = (
                f"Quá hạn đóng học phí (đến hạn {locked.next_payment_due_date:%d/%m/%Y}, "
                f"gia hạn {grace_days} ngày tới {deadline:%d/%m/%Y}). Không hoàn tiền theo quy định."
            )
            locked.refund_amount = Decimal("0.00")
            locked.refund_sessions_remaining = 0
            locked.refund_status = "none"
            locked.kicked_at = timezone.now()
            locked.save()

        create_notification(
            user_id=enrollment.student_id,
            title="Bị xóa khỏi lớp do quá hạn học phí",
            message=f"Bạn đã bị xóa khỏi lớp '{enrollment.online_class.title}' do quá thời gian gia hạn đóng học phí (không hoàn tiền).",
            notification_type="warning",
            link=f"/online-classes/{enrollment.online_class_id}",
        )
        try:
            send_mail(
                subject=f"TutorMatch - Xóa khỏi lớp {enrollment.online_class.title} do quá hạn học phí",
                message=(
                    f"Chào {enrollment.student.username},\n\n"
                    f"Do đã quá thời gian gia hạn ({grace_days} ngày sau ngày đến hạn {enrollment.next_payment_due_date:%d/%m/%Y}) "
                    f"mà chưa hoàn tất học phí, hệ thống đã xóa bạn khỏi lớp '{enrollment.online_class.title}'.\n"
                    "Trường hợp quá hạn học phí sẽ không được hoàn tiền theo quy định.\n\nTrân trọng,\nTutorMatch."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[enrollment.student.email],
                fail_silently=True,
            )
        except Exception as exc:
            logger.warning("Failed sending overdue kick email: %s", exc)
        kicked_count += 1

    return kicked_count
