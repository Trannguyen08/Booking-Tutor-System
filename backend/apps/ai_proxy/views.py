import logging

import requests
from django.conf import settings
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

ALLOWED_DOCUMENT_TYPES = {
    "portrait",
    "identity_card_front",
    "identity_card_back",
    "degree",
    "certificate",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024


class ImagePrecheckProxyView(APIView):
    """Forwards temporary image precheck uploads to the AI service."""

    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        image = request.FILES.get("image") or request.FILES.get("file")
        document_type = request.data.get("document_type")

        if not image:
            return Response(
                {"error": "Không tìm thấy file ảnh."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if document_type not in ALLOWED_DOCUMENT_TYPES:
            return Response(
                {"error": "document_type không hợp lệ."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if image.size > MAX_FILE_SIZE:
            return Response(
                {"error": "Dung lượng ảnh vượt quá 5MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suffix = (
            f".{image.name.rsplit('.', 1)[-1].lower()}" if "." in image.name else ""
        )
        if suffix not in ALLOWED_EXTENSIONS:
            return Response(
                {
                    "error": "Định dạng ảnh không hợp lệ. Chỉ hỗ trợ jpg, jpeg, png, webp."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        url = f"{settings.AI_SERVICE_URL.rstrip('/')}/ai/precheck-image/"
        try:
            response = requests.post(
                url,
                data={"document_type": document_type},
                files={"image": (image.name, image, image.content_type)},
                timeout=12,
            )
        except requests.RequestException as exc:
            logger.warning("AI image precheck failed: %s", exc)
            return Response(
                {
                    "is_valid": False,
                    "score": 50,
                    "can_submit": True,
                    "document_type": document_type,
                    "issues": ["Chưa thể kiểm tra tự động ảnh lúc này."],
                    "suggestions": [
                        "Bạn vẫn có thể gửi hồ sơ nếu ảnh rõ nét, đủ sáng và đúng loại giấy tờ."
                    ],
                },
                status=status.HTTP_200_OK,
            )

        try:
            payload = response.json()
        except ValueError:
            logger.warning(
                "AI image precheck returned non-JSON response: %s", response.text[:200]
            )
            return Response(
                {"error": "AI service trả về dữ liệu không hợp lệ."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(payload, status=response.status_code)


def _post_ai_json(endpoint: str, payload: dict, timeout: int = 12):
    url = f"{settings.AI_SERVICE_URL.rstrip('/')}/{endpoint.lstrip('/')}"
    response = requests.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    return response.json()


class AILearningRoadmapView(APIView):
    """Generates a personalized learning roadmap and matches DB tutors & open online classes."""

    permission_classes = [AllowAny]

    def post(self, request):
        goal = (request.data.get("goal") or "").strip()
        if len(goal) < 2:
            return Response(
                {"error": "Vui lòng nhập mục tiêu học tập."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        body = {
            "goal": goal,
            "subject": (request.data.get("subject") or "").strip(),
            "current_level": (request.data.get("current_level") or "").strip(),
            "weekly_hours": int(request.data.get("weekly_hours") or 3),
            "budget_per_session": (
                int(request.data["budget_per_session"])
                if request.data.get("budget_per_session") not in (None, "")
                else None
            ),
        }

        try:
            roadmap = _post_ai_json("/learning-roadmap", body)
        except requests.RequestException as exc:
            logger.warning("AI learning roadmap fallback: %s", exc)
            detected_subj = body["subject"] or "Môn học mục tiêu"
            roadmap = {
                "summary": f"Lộ trình 8 tuần cho mục tiêu: {goal}",
                "detected_subject": detected_subj,
                "detected_level": body["current_level"] or "Mọi trình độ",
                "recommended_weeks": 8,
                "estimated_sessions": 16,
                "milestones": [
                    {
                        "phase": "Giai đoạn 1 (Tuần 1 - 2)",
                        "title": f"Củng cố kiến thức nền tảng {detected_subj}",
                        "focus_topics": ["Kiểm tra đầu vào", "Hệ thống lý thuyết trọng tâm"],
                        "outcome": "Nắm vững kiến thức cốt lõi.",
                    },
                    {
                        "phase": "Giai đoạn 2 (Tuần 3 - 6)",
                        "title": "Luyện dạng bài chuyên sâu",
                        "focus_topics": ["Chữa bài tập áp dụng", "Sửa lỗi sai thường gặp"],
                        "outcome": "Làm chủ 75% câu hỏi trọng tâm.",
                    },
                    {
                        "phase": "Giai đoạn 3 (Tuần 7 - 8)",
                        "title": "Tổng ôn & luyện đề thực chiến",
                        "focus_topics": ["Thi thử bấm giờ", "Tối ưu điểm số"],
                        "outcome": "Sẵn sàng đạt mục tiêu đề ra.",
                    },
                ],
                "study_tips": [
                    f"Học đều khoảng {body['weekly_hours']} giờ/tuần và làm bài tập củng cố sau mỗi buổi."
                ],
                "suggested_keywords": [detected_subj],
                "source": "fallback",
            }

        # Match open online classes & tutors from live DB
        from django.db.models import Min, Q
        from apps.online_classes.models import OnlineClass
        from apps.tutors.models import TutorProfile

        detected_subject = roadmap.get("detected_subject") or body["subject"]
        budget = body.get("budget_per_session")

        oc_qs = OnlineClass.objects.filter(status="open").select_related("tutor", "subject")
        if detected_subject and "Tổng hợp" not in detected_subject:
            oc_qs = oc_qs.filter(
                Q(subject__name__icontains=detected_subject)
                | Q(title__icontains=detected_subject)
                | Q(description__icontains=detected_subject)
            )
        if budget:
            oc_qs = oc_qs.filter(price_per_session__lte=budget * 1.35)
        matched_classes = [
            {
                "id": oc.id,
                "title": oc.title,
                "subject_name": oc.subject.name if oc.subject else "",
                "tutor_name": oc.tutor.full_name,
                "level": oc.level,
                "price_per_session": float(oc.price_per_session),
                "full_course_price": float(oc.full_course_price),
                "schedule_text": oc.schedule_text,
            }
            for oc in oc_qs.order_by("-created_at")[:4]
        ]
        if not matched_classes:
            matched_classes = [
                {
                    "id": oc.id,
                    "title": oc.title,
                    "subject_name": oc.subject.name if oc.subject else "",
                    "tutor_name": oc.tutor.full_name,
                    "level": oc.level,
                    "price_per_session": float(oc.price_per_session),
                    "full_course_price": float(oc.full_course_price),
                    "schedule_text": oc.schedule_text,
                }
                for oc in OnlineClass.objects.filter(status="open").select_related("tutor", "subject").order_by("-created_at")[:3]
            ]

        tutor_qs = TutorProfile.objects.filter(user__is_active=True, new_class_locked=False).prefetch_related(
            "tutor_subjects__subject"
        )
        if detected_subject and "Tổng hợp" not in detected_subject:
            filtered_tutors = tutor_qs.filter(
                Q(tutor_subjects__is_active=True, tutor_subjects__subject__name__icontains=detected_subject)
                | Q(title__icontains=detected_subject)
                | Q(bio__icontains=detected_subject)
            )
            if filtered_tutors.exists():
                tutor_qs = filtered_tutors
        matched_tutors = []
        for t in (
            tutor_qs.annotate(
                min_rate=Min("tutor_subjects__hourly_rate", filter=Q(tutor_subjects__is_active=True))
            )
            .order_by("-rating_avg", "min_rate")
            .distinct()[:4]
        ):
            matched_tutors.append(
                {
                    "id": t.id,
                    "full_name": t.full_name,
                    "headline": t.title,
                    "rating_avg": float(t.rating_avg or 0),
                    "total_reviews": t.total_reviews,
                    "min_hourly_rate": float(t.min_rate or 0),
                    "subjects": [ts.subject.name for ts in t.tutor_subjects.filter(is_active=True)[:3]],
                }
            )

        return Response(
            {
                "roadmap": roadmap,
                "matched_online_classes": matched_classes,
                "matched_tutors": matched_tutors,
            }
        )


class AILessonAssistantView(APIView):
    """Generates session notes, lesson outline, and practice questions for tutors."""

    permission_classes = [AllowAny]

    def post(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({"error": "Yêu cầu đăng nhập."}, status=status.HTTP_401_UNAUTHORIZED)

        body = {
            "class_title": (request.data.get("class_title") or "").strip(),
            "subject": (request.data.get("subject") or "").strip(),
            "level": (request.data.get("level") or "").strip(),
            "session_number": int(request.data.get("session_number") or 1),
            "session_title": (request.data.get("session_title") or "").strip(),
            "duration_minutes": int(request.data.get("duration_minutes") or 90),
            "objective": (request.data.get("objective") or "").strip(),
        }
        try:
            data = _post_ai_json("/lesson-assistant", body)
        except requests.RequestException as exc:
            logger.warning("AI lesson assistant fallback: %s", exc)
            topic = body["session_title"] or f"Buổi {body['session_number']}"
            data = {
                "student_note": f"Chào các em, trước Buổi {body['session_number']} ({topic}), các em chuẩn bị vở và xem lại kiến thức cơ bản nhé!",
                "lesson_outline": [
                    f"Khởi động (15p): Ôn tập nhanh và giới thiệu chủ đề {topic}.",
                    f"Trọng tâm (50p): Hướng dẫn lý thuyết & ví dụ mẫu phần {topic}.",
                    "Thực hành (25p): Làm bài tập trực tiếp & tổng kết.",
                ],
                "practice_questions": [
                    {"question": f"Câu 1: Trình bày khái niệm cốt lõi của '{topic}'.", "hint": "Tóm tắt ngắn gọn 3 ý chính."},
                    {"question": f"Câu 2: Giải bài tập vận dụng phần '{topic}'.", "hint": "Kiểm tra điều kiện bài toán trước khi tính."},
                ],
                "homework_prompt": f"Hoàn thành phiếu bài tập {topic} trước buổi kế tiếp.",
                "source": "fallback",
            }
        return Response(data)


class AIPerformanceInsightsView(APIView):
    """Generates performance evaluation & risk/coaching insights for tutors or admins."""

    permission_classes = [AllowAny]

    def post(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({"error": "Yêu cầu đăng nhập."}, status=status.HTTP_401_UNAUTHORIZED)

        scope = request.data.get("scope") or "tutor"
        if scope == "admin_poor_tutor" and not request.user.is_staff:
            return Response({"error": "Chỉ Admin mới có quyền phân tích hạng mục này."}, status=status.HTTP_403_FORBIDDEN)

        body = {
            "scope": scope,
            "tutor_name": (request.data.get("tutor_name") or "").strip(),
            "period_label": (request.data.get("period_label") or "").strip(),
            "subjects": request.data.get("subjects") or [],
            "gross_revenue": float(request.data.get("gross_revenue") or 0),
            "net_revenue": float(request.data.get("net_revenue") or 0),
            "sessions_taught": int(request.data.get("sessions_taught") or 0),
            "rating_avg": float(request.data.get("rating_avg") or 0),
            "total_reviews": int(request.data.get("total_reviews") or 0),
            "open_cases_count": int(request.data.get("open_cases_count") or 0),
            "rank": request.data.get("rank"),
            "total_tutors": request.data.get("total_tutors"),
        }
        try:
            data = _post_ai_json("/performance-insights", body)
        except requests.RequestException as exc:
            logger.warning("AI performance insights fallback: %s", exc)
            gross = body["gross_revenue"]
            sess = body["sessions_taught"]
            low = gross < 500000 or sess < 2
            data = {
                "health_score": 40 if low else 78,
                "risk_level": "high" if low else "low",
                "headline": "Doanh thu thấp cần cải thiện" if low else "Hoạt động giảng dạy ổn định",
                "strengths": ["Đã tham gia hệ thống và sẵn sàng giảng dạy."],
                "improvement_actions": ["Bổ sung thêm khung giờ dạy buổi tối và tạo lớp nhóm online."],
                "admin_recommendation": "warn" if low else "keep",
                "outreach_message": f"Chào {body['tutor_name'] or 'Thầy/Cô'}, hệ thống mời trao đổi nhanh về kế hoạch giảng dạy trong kỳ tới.",
                "source": "fallback",
            }
        return Response(data)
