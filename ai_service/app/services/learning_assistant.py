import math
import re

from app.schemas.assistant import (
    LearningRoadmapRequest,
    LearningRoadmapResponse,
    LessonAssistantRequest,
    LessonAssistantResponse,
    PerformanceInsightsRequest,
    PerformanceInsightsResponse,
    PracticeQuestion,
    RoadmapMilestone,
)
from app.core.llm_provider import get_llm_provider


class LearningAssistantService:
    """Provides AI roadmap matching, tutor lesson planning, and revenue/risk coaching."""

    SUBJECT_RULES = [
        ("IELTS", ("ielts", "academic writing", "speaking", "reading")),
        ("Toán học", ("toan", "toán", "giai tich", "hinh hoc", "thptqg", "dai so", "oxyz")),
        ("Vật lý", ("vat ly", "vật lý", "co hoc", "dien xoay chieu")),
        ("Hóa học", ("hoa hoc", "hóa học", "huu co", "vo co")),
        ("Tiếng Anh", ("tieng anh", "tiếng anh", "english", "giao tiep", "toeic")),
        ("Lập trình Python", ("python", "lap trinh", "lập trình", "code", "thuật toán", "algorithm")),
    ]

    LEVEL_RULES = [
        ("Tiểu học", ("tieu hoc", "tiểu học", "lop 1", "lop 2", "lop 3", "lop 4", "lop 5")),
        ("THCS", ("thcs", "cap 2", "cấp 2", "lop 6", "lop 7", "lop 8", "lop 9", "vào 10")),
        ("THPT", ("thpt", "cap 3", "cấp 3", "lop 10", "lop 11", "lop 12", "thptqg", "dai hoc")),
        ("Người đi làm", ("di lam", "đi làm", "van phong", "giao tiep cong so")),
    ]

    @staticmethod
    def _try_llm_parse(system_prompt: str, user_prompt: str, response_model):
        llm = get_llm_provider()
        if llm is None:
            return None
        api_key = getattr(llm, "api_key", "") or ""
        if not api_key or "your-key" in api_key:
            return None
        try:
            return llm.parse_structured(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_model=response_model,
            )
        except Exception:
            return None

    def generate_roadmap(self, payload: LearningRoadmapRequest) -> LearningRoadmapResponse:
        parsed = self._try_llm_parse(
            system_prompt=(
                "Bạn là cố vấn học tập thông minh của nền tảng gia sư TutorMatch tại Việt Nam. "
                "Hãy thiết kế lộ trình học tập thực tế, ngắn gọn bằng tiếng Việt từ mục tiêu học viên."
            ),
            user_prompt=(
                f"Mục tiêu: {payload.goal}\n"
                f"Môn học: {payload.subject or 'Chưa chỉ định'}\n"
                f"Trình độ: {payload.current_level or 'Chưa chỉ định'}\n"
                f"Thời lượng mỗi tuần: {payload.weekly_hours} giờ\n"
                f"Ngân sách/buổi: {payload.budget_per_session or 'Linh hoạt'} VND"
            ),
            response_model=LearningRoadmapResponse,
        )
        if parsed is not None:
            parsed.source = "llm"
            return parsed

        text_lower = f"{payload.subject} {payload.goal}".lower()
        detected_subject = payload.subject.strip()
        if not detected_subject:
            for name, kws in self.SUBJECT_RULES:
                if any(k in text_lower for k in kws):
                    detected_subject = name
                    break
            if not detected_subject:
                detected_subject = "Tổng hợp / Kỹ năng học tập"

        detected_level = payload.current_level.strip()
        if not detected_level:
            for lvl, kws in self.LEVEL_RULES:
                if any(k in text_lower for k in kws):
                    detected_level = lvl
                    break
            if not detected_level:
                detected_level = "Mọi trình độ"

        recommended_weeks = 12 if "mất gốc" in text_lower or "ielts" in text_lower else 8
        sessions_per_week = max(1, min(5, math.ceil(payload.weekly_hours / 1.5)))
        estimated_sessions = recommended_weeks * sessions_per_week

        milestones = [
            RoadmapMilestone(
                phase=f"Giai đoạn 1 (Tuần 1 - {max(2, recommended_weeks // 3)})",
                title=f"Kiểm tra đầu vào & củng cố nền tảng {detected_subject}",
                focus_topics=[
                    "Đánh giá lỗ hổng kiến thức trọng tâm",
                    "Hệ thống hóa công thức / khái niệm cốt lõi",
                    "Bài tập mức độ nhận biết - thông hiểu",
                ],
                outcome="Nắm chắc khung kiến thức cơ bản và hình thành thói quen học đều hàng tuần.",
            ),
            RoadmapMilestone(
                phase=f"Giai đoạn 2 (Tuần {max(3, recommended_weeks // 3 + 1)} - {max(5, (recommended_weeks * 2) // 3)})",
                title=f"Vận dụng chuyên sâu & xử lý dạng bài {detected_level}",
                focus_topics=[
                    "Luyện chuyên đề trọng tâm hay xuất hiện trong đề kiểm tra",
                    "Chữa lỗi sai cá nhân sau mỗi buổi học",
                    "Tăng tốc độ phản xạ và trình bày bài chuẩn",
                ],
                outcome="Tự tin giải quyết tốt 70-80% dạng bài trọng tâm.",
            ),
            RoadmapMilestone(
                phase=f"Giai đoạn 3 (Tuần {max(6, (recommended_weeks * 2) // 3 + 1)} - {recommended_weeks})",
                title="Tổng ôn, luyện đề thực chiến & tối ưu điểm số",
                focus_topics=[
                    "Thi thử / kiểm tra bấm giờ định kỳ hàng tuần",
                    "Bứt phá câu hỏi vận dụng cao phù hợp mục tiêu",
                    "Rà soát chiến lược phân bổ thời gian làm bài",
                ],
                outcome="Đạt mục tiêu đề ra và duy trì phong độ ổn định.",
            ),
        ]

        tips = [
            f"Duy trì đều {sessions_per_week} buổi/tuần (~{payload.weekly_hours} giờ) để tránh gián đoạn mạch kiến thức.",
            "Gửi trước bài tập khó cho gia sư 24 giờ trước buổi học để tối ưu thời gian chữa bài.",
        ]
        if payload.budget_per_session:
            tips.append(
                f"Với ngân sách ~{payload.budget_per_session:,}đ/buổi, lớp nhóm online 5-15 học viên hoặc gói toàn khóa sẽ tiết kiệm chi phí đáng kể."
            )

        words = [w for w in re.split(r"[\s,;]+", f"{detected_subject} {detected_level}".strip()) if len(w) >= 2]
        return LearningRoadmapResponse(
            summary=f"Lộ trình {recommended_weeks} tuần ({estimated_sessions} buổi) môn {detected_subject} ({detected_level}) theo mục tiêu: {payload.goal.strip()}.",
            detected_subject=detected_subject,
            detected_level=detected_level,
            recommended_weeks=recommended_weeks,
            estimated_sessions=estimated_sessions,
            milestones=milestones,
            study_tips=tips,
            suggested_keywords=words[:5],
            source="heuristic",
        )

    def generate_lesson_plan(self, payload: LessonAssistantRequest) -> LessonAssistantResponse:
        parsed = self._try_llm_parse(
            system_prompt=(
                "Bạn là trợ giảng AI giúp gia sư soạn lời nhắn chuẩn bị bài, khung bài giảng và câu hỏi luyện tập bằng tiếng Việt."
            ),
            user_prompt=(
                f"Lớp: {payload.class_title} | Môn: {payload.subject} | Trình độ: {payload.level}\n"
                f"Buổi {payload.session_number}: {payload.session_title} ({payload.duration_minutes} phút)\n"
                f"Mục tiêu thêm: {payload.objective or 'Giảng bám sát trọng tâm buổi học'}"
            ),
            response_model=LessonAssistantResponse,
        )
        if parsed is not None:
            parsed.source = "llm"
            return parsed

        topic = payload.session_title.strip() or f"Chủ đề buổi {payload.session_number}"
        subj = payload.subject.strip() or "môn học"
        warm_min = max(10, round(payload.duration_minutes * 0.15))
        core_min = max(30, round(payload.duration_minutes * 0.55))
        prac_min = max(15, payload.duration_minutes - warm_min - core_min)

        outline = [
            f"Khởi động ({warm_min} phút): Kiểm tra nhanh kiến thức liên quan buổi trước & mục tiêu '{topic}'.",
            f"Kiến thức trọng tâm ({core_min} phút): Trình bày phương pháp cốt lõi, ví dụ mẫu từng bước cho phần {topic} ({subj}).",
            f"Thực hành & giải đáp ({prac_min} phút): Học viên làm trực tiếp 2-3 bài tập áp dụng và chốt lỗi sai thường gặp.",
        ]
        questions = [
            PracticeQuestion(
                question=f"Câu 1 (Cơ bản): Nêu lại quy tắc/khái niệm trọng tâm nhất của phần '{topic}' và lấy 1 ví dụ minh họa.",
                hint="Nhắc học viên tóm tắt bằng 3 gạch đầu dòng ngắn gọn trước khi giải.",
            ),
            PracticeQuestion(
                question=f"Câu 2 (Vận dụng): Áp dụng kiến thức '{topic}' để giải bài toán tổng hợp và chỉ ra bẫy thường gặp.",
                hint="Kiểm tra kỹ điều kiện đầu vào và đơn vị/giả thiết của đề.",
            ),
        ]
        objective_line = f" Trọng tâm thêm: {payload.objective.strip()}." if payload.objective.strip() else ""
        student_note = (
            f"Chào các em, trước Buổi {payload.session_number} ({topic}), các em xem lại vở buổi trước 15 phút "
            f"và chuẩn bị giấy bút để thực hành trực tiếp trên lớp.{objective_line} Hẹn gặp các em đúng giờ nhé!"
        )
        homework_prompt = (
            f"Hoàn thành 2 bài luyện tập phần '{topic}' và ghi chú lại những chỗ còn vướng để đầu buổi sau thầy/cô giải đáp."
        )
        return LessonAssistantResponse(
            student_note=student_note,
            lesson_outline=outline,
            practice_questions=questions,
            homework_prompt=homework_prompt,
            source="heuristic",
        )

    def generate_performance_insights(
        self, payload: PerformanceInsightsRequest
    ) -> PerformanceInsightsResponse:
        parsed = self._try_llm_parse(
            system_prompt=(
                "Bạn là chuyên gia phân tích vận hành & chất lượng giảng dạy trên nền tảng TutorMatch. "
                "Trả về đánh giá ngắn gọn, khách quan bằng tiếng Việt và đề xuất hành động cụ thể."
            ),
            user_prompt=(
                f"Phạm vi: {payload.scope} | Gia sư: {payload.tutor_name} | Kỳ: {payload.period_label}\n"
                f"Môn: {', '.join(payload.subjects)}\n"
                f"Doanh thu gộp: {payload.gross_revenue:,.0f} VND | Thực nhận: {payload.net_revenue:,.0f} VND\n"
                f"Số buổi đã dạy: {payload.sessions_taught} | Rating: {payload.rating_avg}/5 ({payload.total_reviews} đánh giá)\n"
                f"Hồ sơ vi phạm đang mở: {payload.open_cases_count} | Hạng: {payload.rank}/{payload.total_tutors}"
            ),
            response_model=PerformanceInsightsResponse,
        )
        if parsed is not None:
            parsed.source = "llm"
            return parsed

        # Deterministic scoring (0-100)
        score = 35
        if payload.gross_revenue >= 3_000_000:
            score += 25
        elif payload.gross_revenue >= 1_000_000:
            score += 18
        elif payload.gross_revenue > 0:
            score += 10

        if payload.sessions_taught >= 10:
            score += 20
        elif payload.sessions_taught >= 3:
            score += 12
        elif payload.sessions_taught > 0:
            score += 6

        if payload.rating_avg >= 4.5:
            score += 20
        elif payload.rating_avg >= 4.0:
            score += 14
        elif payload.rating_avg > 0:
            score += 4

        score -= min(25, payload.open_cases_count * 10)
        health_score = max(5, min(100, score))

        strengths = []
        actions = []
        if payload.sessions_taught > 0:
            strengths.append(f"Đã duy trì {payload.sessions_taught} buổi dạy hoàn thành trong {payload.period_label or 'kỳ này'}.")
        if payload.rating_avg >= 4.5 and payload.total_reviews > 0:
            strengths.append(f"Chất lượng giảng dạy được đánh giá cao ({payload.rating_avg:.1f}/5 từ {payload.total_reviews} đánh giá).")
        if payload.gross_revenue >= 1_500_000:
            strengths.append(f"Doanh thu ổn định ({payload.gross_revenue:,.0f}đ) giúp giữ vị thế cạnh tranh tốt.")
        if not strengths:
            strengths.append("Hồ sơ đã kích hoạt và sẵn sàng mở thêm slot lịch dạy / lớp nhóm online.")

        if payload.gross_revenue == 0:
            actions.append("Chưa phát sinh doanh thu trong kỳ: nên mở thêm lớp nhóm online học phí linh hoạt theo buổi để thu hút học viên đầu tiên.")
        elif payload.gross_revenue < 1_000_000:
            actions.append("Tăng tỷ lệ chuyển đổi bằng cách bổ sung khung giờ tối/cuối tuần và gắn gói ưu đãi toàn khóa.")
        if payload.sessions_taught < 4:
            actions.append("Mở rộng số lượng slot rảnh cố định hàng tuần và cập nhật mô tả khóa học rõ kết quả đầu ra.")
        if payload.total_reviews < 3:
            actions.append("Nhắc học viên để lại đánh giá sau 2-3 buổi đầu để tăng độ uy tín hiển thị trên kết quả tìm kiếm.")
        if payload.open_cases_count > 0:
            actions.append(f"Xử lý dứt điểm {payload.open_cases_count} hồ sơ vi phạm/hỗ trợ đang mở để tránh ảnh hưởng uy tín.")
        if not actions:
            actions.append("Tiếp tục duy trì tiến độ lớp nhóm online hiện có và chuẩn hóa tài liệu từng buổi bằng trợ lý AI.")

        if health_score >= 70:
            risk_level = "low"
            admin_rec = "keep"
            headline = f"Hiệu suất tốt ({health_score}/100) trong {payload.period_label or 'kỳ đánh giá'}"
        elif health_score >= 45:
            risk_level = "medium"
            admin_rec = "mentor"
            headline = f"Cần tối ưu thêm doanh thu & tần suất dạy ({health_score}/100)"
        elif payload.gross_revenue == 0 and payload.sessions_taught == 0 and payload.open_cases_count > 0:
            risk_level = "high"
            admin_rec = "remove"
            headline = f"Nguy cơ cao: không phát sinh hoạt động & có cảnh báo ({health_score}/100)"
        else:
            risk_level = "high"
            admin_rec = "warn"
            headline = f"Doanh thu kém - cần Admin trao đổi hỗ trợ hoặc nhắc nhở ({health_score}/100)"

        outreach_message = (
            f"Chào {payload.tutor_name or 'Thầy/Cô'}, trong {payload.period_label or 'kỳ vừa qua'} hệ thống ghi nhận "
            f"{payload.sessions_taught} buổi dạy và doanh thu {payload.gross_revenue:,.0f}đ. "
            f"Admin mời Thầy/Cô trao đổi nhanh để hỗ trợ tối ưu lịch dạy, mở lớp online hoặc rà soát kế hoạch hoạt động trên nền tảng."
        )

        return PerformanceInsightsResponse(
            health_score=health_score,
            risk_level=risk_level,
            headline=headline,
            strengths=strengths,
            improvement_actions=actions,
            admin_recommendation=admin_rec,
            outreach_message=outreach_message,
            source="heuristic",
        )
