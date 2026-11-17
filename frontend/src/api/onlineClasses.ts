import client, { publicClient } from './client';

export const onlineClassesApi = {
  // Public & Student
  getPublicClasses: (params?: { search?: string; subject?: string; level?: string }) =>
    publicClient.get('/online-classes/public/', { params }).then(res => res.data),
  getPublicClassDetail: (id: number | string) =>
    client.get(`/online-classes/public/${id}/`).then(res => res.data)
      .catch(() => publicClient.get(`/online-classes/public/${id}/`).then(res => res.data)),
  enroll: (id: number | string, billing_cycle: 'per_session' | 'full_course') =>
    client.post(`/online-classes/public/${id}/enroll/`, { billing_cycle }).then(res => res.data),
  payNext: (enrollmentId: number, billing_cycle?: string) =>
    client.post(`/online-classes/enrollments/${enrollmentId}/pay-next/`, billing_cycle ? { billing_cycle } : {}).then(res => res.data),
  verifyPayment: (params: { orderCode?: string | null; paymentId?: string | null }) =>
    client.post('/online-classes/payments/verify/', params).then(res => res.data),
  getMyEnrollments: () =>
    client.get('/online-classes/my-enrollments/').then(res => res.data),
  createReview: (classId: number | string, data: { rating: number; comment: string }) =>
    client.post(`/online-classes/public/${classId}/review/`, data).then(res => res.data),

  // Tutor
  getTutorClasses: () =>
    client.get('/online-classes/tutor/').then(res => res.data),
  getTutorClassDetail: (id: number | string) =>
    client.get(`/online-classes/tutor/${id}/`).then(res => res.data),
  createTutorClass: (data: any) =>
    client.post('/online-classes/tutor/', data).then(res => res.data),
  updateTutorClass: (id: number | string, data: any) =>
    client.patch(`/online-classes/tutor/${id}/`, data).then(res => res.data),
  createSession: (classId: number | string, data: any) =>
    client.post(`/online-classes/tutor/${classId}/sessions/`, data).then(res => res.data),
  updateSession: (sessionId: number, data: any) =>
    client.patch(`/online-classes/tutor/sessions/${sessionId}/`, data).then(res => res.data),
  kickStudent: (enrollmentId: number, formData: FormData) =>
    client.post(`/online-classes/tutor/enrollments/${enrollmentId}/kick/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),

  // Admin
  getAdminOverview: () =>
    client.get('/online-classes/admin/overview/').then(res => res.data),
  adminClassAction: (classId: number, status: string) =>
    client.post(`/online-classes/admin/classes/${classId}/action/`, { status }).then(res => res.data),
  adminRefundAction: (enrollmentId: number, action: 'mark_refunded' | 'reject_refund', admin_note = '') =>
    client.post(`/online-classes/admin/refunds/${enrollmentId}/action/`, { action, admin_note }).then(res => res.data),
  adminReviewAction: (reviewId: number, action: 'hide' | 'show') =>
    client.post(`/online-classes/admin/reviews/${reviewId}/action/`, { action }).then(res => res.data),
  adminRunBillingWorkers: () =>
    client.post('/online-classes/admin/run-billing-workers/').then(res => res.data),
};
