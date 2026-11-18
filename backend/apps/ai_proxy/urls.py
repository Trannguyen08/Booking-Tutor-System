from django.urls import path

from .views import (
    AILearningRoadmapView,
    AILessonAssistantView,
    AIPerformanceInsightsView,
    ImagePrecheckProxyView,
)

urlpatterns = [
    path("precheck-image/", ImagePrecheckProxyView.as_view(), name="ai-precheck-image"),
    path("learning-roadmap/", AILearningRoadmapView.as_view(), name="ai-learning-roadmap"),
    path("lesson-assistant/", AILessonAssistantView.as_view(), name="ai-lesson-assistant"),
    path("performance-insights/", AIPerformanceInsightsView.as_view(), name="ai-performance-insights"),
]
