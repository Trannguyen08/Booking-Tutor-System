from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITransactionTestCase

from apps.notifications.models import Notification
from apps.notifications.tasks import send_notification

User = get_user_model()


class NotificationTests(APITransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="notif_user",
            email="notif@example.com",
            password="password123",
        )
        self.other = User.objects.create_user(
            username="other_user",
            email="other@example.com",
            password="password123",
        )

    def test_send_notification_task_and_mark_read(self):
        notif_id = send_notification(self.user.id, "Buổi học sắp bắt đầu", title="Nhắc lịch")
        self.assertIsNotNone(notif_id)
        send_notification(self.other.id, "Thông báo của người khác")

        self.client.force_authenticate(self.user)
        list_res = self.client.get(reverse("notification-list"))
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(list_res.data["unread_count"], 1)
        self.assertEqual(len(list_res.data["results"]), 1)
        self.assertEqual(list_res.data["results"][0]["message"], "Buổi học sắp bắt đầu")

        mark_res = self.client.post(reverse("notification-mark-read", kwargs={"pk": notif_id}))
        self.assertEqual(mark_res.status_code, status.HTTP_200_OK)
        self.assertTrue(Notification.objects.get(pk=notif_id).is_read)

        send_notification(self.user.id, "Tin mới")
        read_all_res = self.client.post(reverse("notification-mark-all-read"))
        self.assertEqual(read_all_res.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.filter(user=self.user, is_read=False).count(), 0)
