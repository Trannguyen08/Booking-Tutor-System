from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_learning_roadmap_heuristic(monkeypatch):
    monkeypatch.setattr("app.services.learning_assistant.get_llm_provider", lambda: None)
    res = client.post(
        "/learning-roadmap",
        json={
            "goal": "Mất gốc Toán 12 muốn thi THPTQG đạt 8 điểm",
            "weekly_hours": 4,
            "budget_per_session": 120000,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["detected_subject"] == "Toán học"
    assert data["detected_level"] == "THPT"
    assert len(data["milestones"]) == 3
    assert data["source"] == "heuristic"


def test_lesson_assistant_heuristic(monkeypatch):
    monkeypatch.setattr("app.services.learning_assistant.get_llm_provider", lambda: None)
    res = client.post(
        "/lesson-assistant",
        json={
            "class_title": "Toán 12 Live",
            "subject": "Toán học",
            "level": "THPT",
            "session_number": 2,
            "session_title": "Ứng dụng Tích phân",
            "duration_minutes": 90,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "Buổi 2" in data["student_note"]
    assert len(data["lesson_outline"]) == 3
    assert len(data["practice_questions"]) >= 2


def test_performance_insights_poor_tutor(monkeypatch):
    monkeypatch.setattr("app.services.learning_assistant.get_llm_provider", lambda: None)
    res = client.post(
        "/performance-insights",
        json={
            "scope": "admin_poor_tutor",
            "tutor_name": "Nguyễn Văn A",
            "period_label": "Tháng 11/2026",
            "gross_revenue": 0,
            "net_revenue": 0,
            "sessions_taught": 0,
            "rating_avg": 0,
            "total_reviews": 0,
            "open_cases_count": 2,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["risk_level"] == "high"
    assert data["admin_recommendation"] in ("warn", "remove")
    assert data["health_score"] < 45
