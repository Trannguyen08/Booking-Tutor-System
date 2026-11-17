from datetime import timedelta
from decimal import Decimal

from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.bookings.models import Booking
from apps.chat.models import ChatRoom, Message
from apps.tutors.models import Subject, TutorProfile
from config.asgi import application

User = get_user_model()


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class ChatAPIAndWebSocketTests(APITransactionTestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            username="chat_student", email="chat.student@example.com", password="password123"
        )
        self.tutor_user = User.objects.create_user(
            username="chat_tutor",
            email="chat.tutor@example.com",
            password="password123",
            is_tutor=True,
        )
        self.outsider = User.objects.create_user(
            username="chat_outsider", email="chat.outsider@example.com", password="password123"
        )
        self.tutor = TutorProfile.objects.create(user=self.tutor_user, full_name="Chat Tutor")
        self.subject = Subject.objects.create(name="Toan Chat", slug="toan-chat", category="STEM")
        now = timezone.now()
        self.booking = Booking.objects.create(
            student=self.student,
            tutor=self.tutor,
            subject=self.subject,
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=1, hours=1),
            total_price=Decimal("100000.00"),
            status="confirmed",
        )
        self.room = ChatRoom.objects.create(booking=self.booking)

    def test_chat_rest_api_permissions_and_messages(self):
        self.client.force_authenticate(self.outsider)
        forbidden = self.client.get(reverse("chat-room-messages", kwargs={"room_id": self.room.id}))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.student)
        post_res = self.client.post(
            reverse("chat-room-messages", kwargs={"room_id": self.room.id}),
            {"content": "Em chào thầy"},
            format="json",
        )
        self.assertEqual(post_res.status_code, status.HTTP_201_CREATED)

        list_res = self.client.get(reverse("chat-room-list"))
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_res.data), 1)

    def test_websocket_requires_jwt_and_persists_messages(self):
        async def run_ws():
            unauth_comm = WebsocketCommunicator(application, f"/ws/chat/{self.room.id}/")
            connected, code = await unauth_comm.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4001)

            token = str(AccessToken.for_user(self.student))
            auth_comm = WebsocketCommunicator(
                application, f"/ws/chat/{self.room.id}/?token={token}"
            )
            connected, _ = await auth_comm.connect()
            self.assertTrue(connected)

            await auth_comm.send_json_to({"message": "Hello via WS"})
            received = await auth_comm.receive_json_from()
            self.assertEqual(received["message"], "Hello via WS")
            self.assertEqual(received["sender_id"], self.student.id)
            await auth_comm.disconnect()

        async_to_sync(run_ws)()
        self.assertTrue(Message.objects.filter(room=self.room, content="Hello via WS").exists())
