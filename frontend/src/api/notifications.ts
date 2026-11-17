import client from './client';

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  unread_count: number;
  results: NotificationItem[];
}

export const notificationsApi = {
  list: (): Promise<NotificationListResponse> =>
    client.get('/notifications/').then(res => res.data),
  markRead: (id: number) =>
    client.post(`/notifications/${id}/read/`).then(res => res.data),
  markAllRead: () =>
    client.post('/notifications/read-all/').then(res => res.data),
};
