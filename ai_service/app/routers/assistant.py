from fastapi import APIRouter

from app.schemas.assistant import (
    LearningRoadmapRequest,
    LearningRoadmapResponse,
    LessonAssistantRequest,
    LessonAssistantResponse,
    PerformanceInsightsRequest,
    PerformanceInsightsResponse,
)
from app.services.learning_assistant import LearningAssistantService

router = APIRouter(tags=["AI Assistant"])
_service = LearningAssistantService()


@router.post("/learning-roadmap", response_model=LearningRoadmapResponse)
async def create_learning_roadmap(payload: LearningRoadmapRequest) -> LearningRoadmapResponse:
    return _service.generate_roadmap(payload)


@router.post("/lesson-assistant", response_model=LessonAssistantResponse)
async def create_lesson_assistant(payload: LessonAssistantRequest) -> LessonAssistantResponse:
    return _service.generate_lesson_plan(payload)


@router.post("/performance-insights", response_model=PerformanceInsightsResponse)
async def create_performance_insights(
    payload: PerformanceInsightsRequest,
) -> PerformanceInsightsResponse:
    return _service.generate_performance_insights(payload)
