import client, { publicClient } from './client';

export const aiApi = {
  learningRoadmap: (data: {
    goal: string;
    subject?: string;
    current_level?: string;
    weekly_hours?: number;
    budget_per_session?: number | null;
  }) => publicClient.post('/ai/learning-roadmap/', data).then(res => res.data),

  lessonAssistant: (data: {
    class_title?: string;
    subject?: string;
    level?: string;
    session_number?: number;
    session_title?: string;
    duration_minutes?: number;
    objective?: string;
  }) => client.post('/ai/lesson-assistant/', data).then(res => res.data),

  performanceInsights: (data: {
    scope: 'tutor' | 'admin_poor_tutor';
    tutor_name?: string;
    period_label?: string;
    subjects?: string[];
    gross_revenue: number;
    net_revenue: number;
    sessions_taught: number;
    rating_avg: number;
    total_reviews: number;
    open_cases_count?: number;
    rank?: number | null;
    total_tutors?: number | null;
  }) => client.post('/ai/performance-insights/', data).then(res => res.data),
};
