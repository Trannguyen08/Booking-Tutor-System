import calendar
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.admin_portal.models import ViolationCase
from apps.bookings.models import Booking
from apps.courses.models import Course, CourseCommission, CourseReview, CourseSession
from apps.online_classes.models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
    OnlineClassSession,
)
from apps.tutors.models import TutorProfile


def _safe_int(value, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def resolve_period(
    mode: str = "month",
    year=None,
    month=None,
    quarter=None,
    week_date: str | None = None,
):
    today = timezone.localdate()
    normalized_mode = (mode or "month").strip().lower()
    if normalized_mode not in {"week", "month", "quarter", "year"}:
        normalized_mode = "month"

    target_year = _safe_int(year, today.year, 2020, 2100)
    buckets = []

    if normalized_mode == "week":
        anchor = today
        if week_date:
            try:
                anchor = date.fromisoformat(str(week_date).strip()[:10])
            except ValueError:
                anchor = today
        start_date = anchor - timedelta(days=anchor.weekday())
        end_date = start_date + timedelta(days=6)
        weekday_labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        for i in range(7):
            day = start_date + timedelta(days=i)
            buckets.append(
                {
                    "label": f"{weekday_labels[i]} ({day.strftime('%d/%m')})",
                    "short_label": weekday_labels[i],
                    "start": day,
                    "end": day,
                }
            )
        label = f"Tuần {start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}"
        return {
            "mode": "week",
            "year": start_date.year,
            "month": start_date.month,
            "quarter": ((start_date.month - 1) // 3) + 1,
            "week_date": start_date.isoformat(),
            "start_date": start_date,
            "end_date": end_date,
            "label": label,
            "buckets": buckets,
        }

    if normalized_mode == "quarter":
        default_quarter = ((today.month - 1) // 3) + 1
        target_quarter = _safe_int(quarter, default_quarter, 1, 4)
        first_month = (target_quarter - 1) * 3 + 1
        start_date = date(target_year, first_month, 1)
        last_month = first_month + 2
        end_date = date(target_year, last_month, calendar.monthrange(target_year, last_month)[1])
        for offset in range(3):
            m = first_month + offset
            m_start = date(target_year, m, 1)
            m_end = date(target_year, m, calendar.monthrange(target_year, m)[1])
            buckets.append(
                {
                    "label": f"Tháng {m}/{target_year}",
                    "short_label": f"T{m}",
                    "start": m_start,
                    "end": m_end,
                }
            )
        return {
            "mode": "quarter",
            "year": target_year,
            "month": first_month,
            "quarter": target_quarter,
            "week_date": start_date.isoformat(),
            "start_date": start_date,
            "end_date": end_date,
            "label": f"Quý {target_quarter}/{target_year}",
            "buckets": buckets,
        }

    if normalized_mode == "year":
        start_date = date(target_year, 1, 1)
        end_date = date(target_year, 12, 31)
        for m in range(1, 13):
            m_start = date(target_year, m, 1)
            m_end = date(target_year, m, calendar.monthrange(target_year, m)[1])
            buckets.append(
                {
                    "label": f"Tháng {m}",
                    "short_label": f"T{m}",
                    "start": m_start,
                    "end": m_end,
                }
            )
        return {
            "mode": "year",
            "year": target_year,
            "month": today.month,
            "quarter": ((today.month - 1) // 3) + 1,
            "week_date": start_date.isoformat(),
            "start_date": start_date,
            "end_date": end_date,
            "label": f"Năm {target_year}",
            "buckets": buckets,
        }

    # Default: month
    target_month = _safe_int(month, today.month, 1, 12)
    last_day = calendar.monthrange(target_year, target_month)[1]
    start_date = date(target_year, target_month, 1)
    end_date = date(target_year, target_month, last_day)
    cursor = 1
    week_idx = 1
    while cursor <= last_day:
        chunk_end = min(last_day, cursor + 6)
        b_start = date(target_year, target_month, cursor)
        b_end = date(target_year, target_month, chunk_end)
        buckets.append(
            {
                "label": f"Tuần {week_idx} ({cursor:02d}-{chunk_end:02d}/{target_month:02d})",
                "short_label": f"Tuần {week_idx}",
                "start": b_start,
                "end": b_end,
            }
        )
        cursor = chunk_end + 1
        week_idx += 1

    return {
        "mode": "month",
        "year": target_year,
        "month": target_month,
        "quarter": ((target_month - 1) // 3) + 1,
        "week_date": start_date.isoformat(),
        "start_date": start_date,
        "end_date": end_date,
        "label": f"Tháng {target_month:02d}/{target_year}",
        "buckets": buckets,
    }


def _to_aware_range(start_date: date, end_date: date):
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
    return start_dt, end_dt


def _decimal(val) -> Decimal:
    return Decimal(str(val or 0))


def _serialize_period(period: dict) -> dict:
    return {
        "mode": period["mode"],
        "year": period["year"],
        "month": period["month"],
        "quarter": period["quarter"],
        "week_date": period["week_date"],
        "start_date": period["start_date"].isoformat(),
        "end_date": period["end_date"].isoformat(),
        "label": period["label"],
    }


def build_tutor_revenue_rankings(
    mode: str = "month",
    year=None,
    month=None,
    quarter=None,
):
    ranking_mode = (mode or "month").strip().lower()
    if ranking_mode not in {"month", "quarter", "year"}:
        ranking_mode = "month"
    period = resolve_period(ranking_mode, year=year, month=month, quarter=quarter)
    start_dt, end_dt = _to_aware_range(period["start_date"], period["end_date"])

    # Aggregate bookings revenue per tutor
    booking_map = {
        row["tutor_id"]: _decimal(row["total"])
        for row in Booking.objects.annotate(eff_dt=Coalesce("paid_at", "created_at"))
        .filter(payment_status="paid", eff_dt__range=(start_dt, end_dt))
        .values("tutor_id")
        .annotate(total=Sum("total_price"))
    }

    # Aggregate online class payments per tutor
    online_payment_map = {
        row["online_class__tutor_id"]: _decimal(row["total"])
        for row in OnlineClassPayment.objects.annotate(eff_dt=Coalesce("paid_at", "created_at"))
        .filter(status="paid", eff_dt__range=(start_dt, end_dt))
        .values("online_class__tutor_id")
        .annotate(total=Sum("amount"))
    }

    # Aggregate commissions per tutor
    commission_map = {
        row["tutor_id"]: _decimal(row["total"])
        for row in CourseCommission.objects.filter(created_at__range=(start_dt, end_dt))
        .values("tutor_id")
        .annotate(total=Sum("commission_amount"))
    }

    # Aggregate online refunds per tutor
    refund_map = {
        row["online_class__tutor_id"]: _decimal(row["total"])
        for row in OnlineClassEnrollment.objects.annotate(
            eff_dt=Coalesce("refund_processed_at", "kicked_at", "updated_at")
        )
        .filter(status__in=["kicked_by_tutor", "kicked_unpaid"], refund_amount__gt=0, eff_dt__range=(start_dt, end_dt))
        .values("online_class__tutor_id")
        .annotate(total=Sum("refund_amount"))
    }

    # Aggregate taught sessions per tutor (1-1 + online)
    course_sessions_map = {
        row["course__tutor_id"]: row["cnt"]
        for row in CourseSession.objects.annotate(
            eff_date=Coalesce(TruncDate("student_completed_at"), "scheduled_date")
        )
        .filter(student_completed=True, eff_date__range=(period["start_date"], period["end_date"]))
        .values("course__tutor_id")
        .annotate(cnt=Count("id"))
    }
    online_sessions_map = {
        row["online_class__tutor_id"]: row["cnt"]
        for row in OnlineClassSession.objects.filter(
            status="completed", scheduled_at__range=(start_dt, end_dt)
        )
        .values("online_class__tutor_id")
        .annotate(cnt=Count("id"))
    }

    # Open violation/support cases per tutor user
    open_cases_map = {
        row["target_user_id"]: row["cnt"]
        for row in ViolationCase.objects.filter(
            target_user__isnull=False, status__in=["open", "investigating"]
        )
        .values("target_user_id")
        .annotate(cnt=Count("id"))
    }
    completed_courses_map = {
        row["tutor_id"]: row["cnt"]
        for row in Course.objects.filter(status="completed")
        .values("tutor_id")
        .annotate(cnt=Count("id"))
    }

    # Aggregate real review ratings across approved 1-1 CourseReview & visible OnlineClassReview
    review_scores_map: dict[int, list[int]] = {}
    for row in CourseReview.objects.filter(
        moderation_status=CourseReview.ModerationStatus.APPROVED
    ).values("tutor_id", "rating"):
        review_scores_map.setdefault(row["tutor_id"], []).append(row["rating"])
    for row in OnlineClassReview.objects.filter(is_visible=True).values(
        "online_class__tutor_id", "rating"
    ):
        review_scores_map.setdefault(row["online_class__tutor_id"], []).append(row["rating"])

    tutors = (
        TutorProfile.objects.select_related("user", "user__tutor_profile")
        .prefetch_related("tutor_subjects__subject")
        .all()
    )

    entries = []
    for t in tutors:
        b_rev = booking_map.get(t.id, Decimal("0"))
        oc_rev = online_payment_map.get(t.id, Decimal("0"))
        gross = b_rev + oc_rev
        comm = commission_map.get(t.id, Decimal("0"))
        refund = refund_map.get(t.id, Decimal("0"))
        net = max(Decimal("0"), gross - comm - refund)
        c_sess = course_sessions_map.get(t.id, 0)
        o_sess = online_sessions_map.get(t.id, 0)
        sessions_taught = c_sess + o_sess
        reg = getattr(t.user, "tutor_profile", None)
        avatar_url = ""
        if getattr(t.user, "avatar", None):
            avatar_url = t.user.avatar.url
        subjects = [ts.subject.name for ts in t.tutor_subjects.filter(is_active=True)[:4]]

        scores = review_scores_map.get(t.id, [])
        actual_total_reviews = len(scores)
        actual_rating_avg = round(sum(scores) / actual_total_reviews, 2) if actual_total_reviews > 0 else 0.0

        if not t.user.is_active:
            flag = "locked"
        elif gross == 0 and sessions_taught == 0:
            flag = "critical"
        elif (actual_rating_avg > 0 and actual_rating_avg < 3.8) or gross < Decimal("300000"):
            flag = "warning"
        else:
            flag = "healthy"

        entries.append(
            {
                "tutor_id": t.id,
                "user_id": t.user_id,
                "user_tutor_profile_id": reg.id if reg else None,
                "full_name": t.full_name or t.user.get_full_name() or t.user.username,
                "email": t.user.email,
                "avatar_url": avatar_url,
                "subjects": subjects,
                "is_active": t.user.is_active,
                "new_class_locked": t.new_class_locked,
                "rating_avg": actual_rating_avg,
                "total_reviews": actual_total_reviews,
                "completed_courses": completed_courses_map.get(t.id, 0),
                "sessions_taught": sessions_taught,
                "course_sessions_taught": c_sess,
                "online_sessions_taught": o_sess,
                "booking_revenue": float(b_rev),
                "online_class_revenue": float(oc_rev),
                "gross_revenue": float(gross),
                "commission_amount": float(comm),
                "refund_amount": float(refund),
                "net_revenue": float(net),
                "open_cases_count": open_cases_map.get(t.user_id, 0),
                "performance_flag": flag,
            }
        )

    top_sorted = sorted(
        entries,
        key=lambda e: (-e["gross_revenue"], -e["net_revenue"], -e["sessions_taught"], -e["rating_avg"]),
    )
    top_rankings = []
    for idx, item in enumerate(top_sorted, start=1):
        row = dict(item)
        row["rank"] = idx
        top_rankings.append(row)

    poor_sorted = sorted(
        entries,
        key=lambda e: (e["gross_revenue"], e["sessions_taught"], e["rating_avg"], e["tutor_id"]),
    )
    poor_rankings = []
    for idx, item in enumerate(poor_sorted, start=1):
        row = dict(item)
        row["poor_rank"] = idx
        poor_rankings.append(row)

    total_platform_gross = sum(e["gross_revenue"] for e in entries)
    total_platform_net = sum(e["net_revenue"] for e in entries)

    return {
        "period": _serialize_period(period),
        "total_tutors": len(entries),
        "summary": {
            "total_platform_gross": total_platform_gross,
            "total_platform_net": total_platform_net,
            "active_earning_tutors": sum(1 for e in entries if e["gross_revenue"] > 0),
            "zero_revenue_tutors": sum(1 for e in entries if e["gross_revenue"] == 0),
        },
        "top_rankings": top_rankings,
        "poor_rankings": poor_rankings,
    }


def compute_tutor_period_analytics(
    tutor: TutorProfile,
    mode: str = "month",
    year=None,
    month=None,
    quarter=None,
    week_date: str | None = None,
    ranking_mode: str = "month",
    ranking_year=None,
    ranking_month=None,
    ranking_quarter=None,
):
    period = resolve_period(
        mode=mode, year=year, month=month, quarter=quarter, week_date=week_date
    )
    start_dt, end_dt = _to_aware_range(period["start_date"], period["end_date"])

    bookings_qs = Booking.objects.annotate(eff_dt=Coalesce("paid_at", "created_at")).filter(
        tutor=tutor, payment_status="paid", eff_dt__range=(start_dt, end_dt)
    )
    online_payments_qs = OnlineClassPayment.objects.annotate(
        eff_dt=Coalesce("paid_at", "created_at")
    ).filter(online_class__tutor=tutor, status="paid", eff_dt__range=(start_dt, end_dt))
    commissions_qs = (
        CourseCommission.objects.filter(tutor=tutor, created_at__range=(start_dt, end_dt))
        .select_related("course__student")
        .order_by("-created_at")
    )
    refunds_qs = (
        OnlineClassEnrollment.objects.annotate(
            eff_dt=Coalesce("refund_processed_at", "kicked_at", "updated_at")
        )
        .filter(
            online_class__tutor=tutor,
            status__in=["kicked_by_tutor", "kicked_unpaid"],
            refund_amount__gt=0,
            eff_dt__range=(start_dt, end_dt),
        )
        .select_related("online_class", "student")
        .order_by("-eff_dt")
    )

    course_sessions_qs = CourseSession.objects.annotate(
        eff_date=Coalesce(TruncDate("student_completed_at"), "scheduled_date")
    ).filter(
        course__tutor=tutor,
        student_completed=True,
        eff_date__range=(period["start_date"], period["end_date"]),
    )
    online_sessions_qs = OnlineClassSession.objects.filter(
        online_class__tutor=tutor,
        status="completed",
        scheduled_at__range=(start_dt, end_dt),
    )

    booking_list = list(bookings_qs.values("id", "total_price", "eff_dt"))
    online_pay_list = list(online_payments_qs.values("id", "amount", "eff_dt", "online_class_id"))
    commission_objs = list(commissions_qs)
    refund_objs = list(refunds_qs)
    commission_list = [
        {"id": c.id, "commission_amount": c.commission_amount, "created_at": c.created_at}
        for c in commission_objs
    ]
    refund_list = [
        {
            "id": r.id,
            "refund_amount": r.refund_amount,
            "eff_dt": r.refund_processed_at or r.kicked_at or r.updated_at,
        }
        for r in refund_objs
    ]

    deduction_items = []
    for c in commission_objs:
        stu_name = c.course.student.get_full_name() or c.course.student.username
        pct = float(c.commission_rate) * 100
        deduction_items.append(
            {
                "id": f"comm-{c.id}",
                "type": "commission",
                "type_label": "Hoa hồng nền tảng",
                "title": c.course.title,
                "student_name": stu_name,
                "detail": f"Phí hoa hồng {pct:.0f}% trên học phí {float(c.gross_amount):,.0f}đ",
                "amount": float(c.commission_amount),
                "status": c.status,
                "created_at": c.created_at.date().isoformat(),
            }
        )
    for r in refund_objs:
        stu_name = r.student.get_full_name() or r.student.username
        reason_text = r.kick_reason or (
            "Quá hạn đóng học phí" if r.kick_type == "overdue_unpaid" else "Gia sư mời rời lớp"
        )
        eff_dt = r.refund_processed_at or r.kicked_at or r.updated_at
        deduction_items.append(
            {
                "id": f"refund-{r.id}",
                "type": "refund",
                "type_label": "Hoàn tiền lớp online",
                "title": r.online_class.title,
                "student_name": stu_name,
                "detail": f"Hoàn {r.refund_sessions_remaining} buổi chưa học · Lý do: {reason_text}",
                "amount": float(r.refund_amount),
                "status": r.refund_status,
                "created_at": eff_dt.date().isoformat(),
            }
        )
    deduction_items.sort(key=lambda item: item["created_at"], reverse=True)
    c_sess_list = list(course_sessions_qs.values("id", "eff_date", "course_id"))
    o_sess_list = list(online_sessions_qs.values("id", "scheduled_at", "online_class_id"))

    booking_gross = sum((_decimal(b["total_price"]) for b in booking_list), Decimal("0"))
    online_gross = sum((_decimal(p["amount"]) for p in online_pay_list), Decimal("0"))
    gross_revenue = booking_gross + online_gross
    commission_total = sum((_decimal(c["commission_amount"]) for c in commission_list), Decimal("0"))
    refund_total = sum((_decimal(r["refund_amount"]) for r in refund_list), Decimal("0"))
    net_revenue = max(Decimal("0"), gross_revenue - commission_total - refund_total)

    # Chart buckets
    chart_series = []
    tz = timezone.get_current_timezone()
    for bucket in period["buckets"]:
        b_start, b_end = bucket["start"], bucket["end"]
        b_book = sum(
            (
                _decimal(b["total_price"])
                for b in booking_list
                if b_start <= timezone.localtime(b["eff_dt"], tz).date() <= b_end
            ),
            Decimal("0"),
        )
        b_online = sum(
            (
                _decimal(p["amount"])
                for p in online_pay_list
                if b_start <= timezone.localtime(p["eff_dt"], tz).date() <= b_end
            ),
            Decimal("0"),
        )
        b_gross = b_book + b_online
        b_comm = sum(
            (
                _decimal(c["commission_amount"])
                for c in commission_list
                if b_start <= timezone.localtime(c["created_at"], tz).date() <= b_end
            ),
            Decimal("0"),
        )
        b_ref = sum(
            (
                _decimal(r["refund_amount"])
                for r in refund_list
                if b_start <= timezone.localtime(r["eff_dt"], tz).date() <= b_end
            ),
            Decimal("0"),
        )
        b_net = max(Decimal("0"), b_gross - b_comm - b_ref)
        b_csess = sum(1 for s in c_sess_list if s["eff_date"] and b_start <= s["eff_date"] <= b_end)
        b_osess = sum(
            1
            for s in o_sess_list
            if b_start <= timezone.localtime(s["scheduled_at"], tz).date() <= b_end
        )
        chart_series.append(
            {
                "label": bucket["label"],
                "short_label": bucket["short_label"],
                "gross_revenue": float(b_gross),
                "net_revenue": float(b_net),
                "commission_amount": float(b_comm),
                "refund_amount": float(b_ref),
                "booking_revenue": float(b_book),
                "online_class_revenue": float(b_online),
                "sessions_taught": b_csess + b_osess,
            }
        )

    # Courses in period (created in period OR with sessions taught/booked in period)
    period_course_ids = {s["course_id"] for s in c_sess_list}
    courses_qs = (
        Course.objects.filter(tutor=tutor)
        .filter(Q(created_at__range=(start_dt, end_dt)) | Q(id__in=period_course_ids))
        .select_related("student", "subject", "booking", "commission")
        .distinct()
        .order_by("-created_at")
    )
    courses_data = []
    for c in courses_qs:
        sess_in_period = sum(1 for s in c_sess_list if s["course_id"] == c.id)
        comm_amt = float(c.commission.commission_amount) if hasattr(c, "commission") else 0.0
        booking_amt = float(c.booking.total_price) if c.booking else float(c.hourly_rate * c.total_sessions)
        courses_data.append(
            {
                "id": c.id,
                "title": c.title,
                "subject_name": c.subject.name if c.subject else "",
                "student_name": c.student.get_full_name() or c.student.username or c.student.email,
                "status": c.status,
                "total_sessions": c.total_sessions,
                "sessions_taught_in_period": sess_in_period,
                "total_amount": booking_amt,
                "commission_amount": comm_amt,
                "net_amount": max(0.0, booking_amt - comm_amt),
                "created_at": c.created_at.date().isoformat(),
            }
        )

    # Online classes in period
    period_oc_ids = {p["online_class_id"] for p in online_pay_list} | {
        s["online_class_id"] for s in o_sess_list
    }
    online_classes_qs = (
        OnlineClass.objects.filter(tutor=tutor)
        .filter(Q(created_at__range=(start_dt, end_dt)) | Q(id__in=period_oc_ids) | Q(status="open"))
        .select_related("subject")
        .distinct()
        .order_by("-created_at")
    )
    online_classes_data = []
    for oc in online_classes_qs:
        oc_rev = sum(
            (_decimal(p["amount"]) for p in online_pay_list if p["online_class_id"] == oc.id),
            Decimal("0"),
        )
        oc_sess = sum(1 for s in o_sess_list if s["online_class_id"] == oc.id)
        active_enr = oc.enrollments.filter(status="active").count()
        online_classes_data.append(
            {
                "id": oc.id,
                "title": oc.title,
                "subject_name": oc.subject.name if oc.subject else "",
                "status": oc.status,
                "active_students": active_enr,
                "max_students": oc.max_students,
                "total_sessions": oc.total_sessions,
                "sessions_taught_in_period": oc_sess,
                "revenue_in_period": float(oc_rev),
                "created_at": oc.created_at.date().isoformat(),
            }
        )

    # Reviews in period (CourseReview + OnlineClassReview)
    course_reviews = (
        CourseReview.objects.filter(
            tutor=tutor,
            moderation_status=CourseReview.ModerationStatus.APPROVED,
            created_at__range=(start_dt, end_dt),
        )
        .select_related("student", "course__subject")
        .order_by("-created_at")
    )
    online_reviews = (
        OnlineClassReview.objects.filter(
            online_class__tutor=tutor,
            is_visible=True,
            created_at__range=(start_dt, end_dt),
        )
        .select_related("student", "online_class__subject")
        .order_by("-created_at")
    )
    reviews_list = []
    rating_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in course_reviews:
        rating_counts[r.rating] = rating_counts.get(r.rating, 0) + 1
        reviews_list.append(
            {
                "id": f"course-{r.id}",
                "source": "Khóa học 1-1",
                "title": r.course.title,
                "subject_name": r.course.subject.name if r.course.subject else "",
                "student_name": r.student.get_full_name() or r.student.username,
                "rating": r.rating,
                "comment": r.comment,
                "created_at": r.created_at.date().isoformat(),
            }
        )
    for r in online_reviews:
        rating_counts[r.rating] = rating_counts.get(r.rating, 0) + 1
        reviews_list.append(
            {
                "id": f"online-{r.id}",
                "source": "Lớp nhóm online",
                "title": r.online_class.title,
                "subject_name": r.online_class.subject.name if r.online_class.subject else "",
                "student_name": r.student.get_full_name() or r.student.username,
                "rating": r.rating,
                "comment": r.comment,
                "created_at": r.created_at.date().isoformat(),
            }
        )
    reviews_list.sort(key=lambda item: item["created_at"], reverse=True)
    review_count = len(reviews_list)
    avg_rating = (
        round(sum(r["rating"] for r in reviews_list) / review_count, 2)
        if review_count > 0
        else 0.0
    )

    # Revenue Leaderboard (month/quarter/year selectable independently)
    rankings_payload = build_tutor_revenue_rankings(
        mode=ranking_mode,
        year=ranking_year,
        month=ranking_month,
        quarter=ranking_quarter,
    )
    my_entry = next(
        (item for item in rankings_payload["top_rankings"] if item["tutor_id"] == tutor.id),
        None,
    )
    overall_rating = my_entry["rating_avg"] if my_entry else avg_rating

    return {
        "period": _serialize_period(period),
        "summary": {
            "sessions_taught": len(c_sess_list) + len(o_sess_list),
            "course_sessions_taught": len(c_sess_list),
            "online_sessions_taught": len(o_sess_list),
            "gross_revenue": float(gross_revenue),
            "booking_revenue": float(booking_gross),
            "online_class_revenue": float(online_gross),
            "commission_deducted": float(commission_total),
            "refund_deducted": float(refund_total),
            "net_revenue": float(net_revenue),
            "courses_count": len(courses_data),
            "online_classes_count": len(online_classes_data),
            "reviews_count": review_count,
            "average_rating": avg_rating,
            "overall_rating_avg": overall_rating,
        },
        "deductions": deduction_items,
        "chart_series": chart_series,
        "courses": courses_data,
        "online_classes": online_classes_data,
        "reviews": reviews_list,
        "rating_breakdown": rating_counts,
        "leaderboard": {
            "period": rankings_payload["period"],
            "total_tutors": rankings_payload["total_tutors"],
            "my_rank": my_entry,
            "rankings": rankings_payload["top_rankings"][:15],
        },
    }
