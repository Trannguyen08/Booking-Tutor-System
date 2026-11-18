from typing import Literal
from pydantic import BaseModel, Field


class LearningRoadmapRequest(BaseModel):
    goal: str = Field(..., min_length=2, max_length=1000)
    subject: str = Field(default="", max_length=120)
    current_level: str = Field(default="", max_length=120)
    weekly_hours: int = Field(default=3, ge=1, le=40)
    budget_per_session: int | None = Field(default=None, ge=0)


class RoadmapMilestone(BaseModel):
    phase: str
    title: str
    focus_topics: list[str] = Field(default_factory=list)
    outcome: str


class LearningRoadmapResponse(BaseModel):
    summary: str
    detected_subject: str
    detected_level: str
    recommended_weeks: int
    estimated_sessions: int
    milestones: list[RoadmapMilestone] = Field(default_factory=list)
    study_tips: list[str] = Field(default_factory=list)
    suggested_keywords: list[str] = Field(default_factory=list)
    source: Literal["llm", "heuristic"] = "heuristic"


class LessonAssistantRequest(BaseModel):
    class_title: str = Field(default="", max_length=255)
    subject: str = Field(default="", max_length=120)
    level: str = Field(default="", max_length=120)
    session_number: int = Field(default=1, ge=1)
    session_title: str = Field(default="", max_length=255)
    duration_minutes: int = Field(default=90, ge=30, le=360)
    objective: str = Field(default="", max_length=500)


class PracticeQuestion(BaseModel):
    question: str
    hint: str


class LessonAssistantResponse(BaseModel):
    student_note: str
    lesson_outline: list[str] = Field(default_factory=list)
    practice_questions: list[PracticeQuestion] = Field(default_factory=list)
    homework_prompt: str
    source: Literal["llm", "heuristic"] = "heuristic"


class PerformanceInsightsRequest(BaseModel):
    scope: Literal["tutor", "admin_poor_tutor"] = "tutor"
    tutor_name: str = Field(default="", max_length=255)
    period_label: str = Field(default="", max_length=120)
    subjects: list[str] = Field(default_factory=list)
    gross_revenue: float = 0.0
    net_revenue: float = 0.0
    sessions_taught: int = 0
    rating_avg: float = 0.0
    total_reviews: int = 0
    open_cases_count: int = 0
    rank: int | None = None
    total_tutors: int | None = None


class PerformanceInsightsResponse(BaseModel):
    health_score: int = Field(ge=0, le=100)
    risk_level: Literal["low", "medium", "high"]
    headline: str
    strengths: list[str] = Field(default_factory=list)
    improvement_actions: list[str] = Field(default_factory=list)
    admin_recommendation: Literal["keep", "mentor", "warn", "remove"]
    outreach_message: str
    source: Literal["llm", "heuristic"] = "heuristic"
