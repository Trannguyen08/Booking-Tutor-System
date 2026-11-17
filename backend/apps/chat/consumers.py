import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from .models import ChatRoom, Message

User = get_user_model()


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"chat_{self.room_id}"

        user = await self._authenticate_user()
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        has_access = await self._user_can_access_room(user, self.room_id)
        if not has_access:
            await self.close(code=4003)
            return

        self.user = user
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

    async def receive(self, text_data):
        try:
            payload = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"error": "Invalid JSON payload."}))
            return

        content = (payload.get("message") or "").strip()
        if not content:
            return

        saved = await self._save_message(self.room_id, self.user.id, content)
        if not saved:
            await self.send(text_data=json.dumps({"error": "Chat room not found."}))
            return

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "id": saved["id"],
                "room_id": int(self.room_id),
                "sender_id": saved["sender_id"],
                "sender_name": saved["sender_name"],
                "message": saved["content"],
                "created_at": saved["created_at"],
            },
        )

    async def chat_message(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "id": event.get("id"),
                    "room_id": event.get("room_id"),
                    "sender_id": event.get("sender_id"),
                    "sender_name": event.get("sender_name"),
                    "message": event["message"],
                    "created_at": event.get("created_at"),
                }
            )
        )

    async def _authenticate_user(self):
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        token = parse_qs(query_string).get("token", [None])[0]
        if token:
            try:
                access = AccessToken(token)
                user_id = access.get("user_id")
                if user_id:
                    return await self._get_user(user_id)
            except (TokenError, Exception):
                return None

        scope_user = self.scope.get("user")
        if scope_user and getattr(scope_user, "is_authenticated", False):
            return scope_user
        return None

    @database_sync_to_async
    def _get_user(self, user_id):
        return User.objects.filter(pk=user_id, is_active=True).first()

    @database_sync_to_async
    def _user_can_access_room(self, user, room_id):
        room = (
            ChatRoom.objects.select_related("booking__student", "booking__tutor__user")
            .filter(pk=room_id)
            .first()
        )
        if not room:
            return False
        if user.is_staff or user.is_superuser:
            return True
        return user.id in (room.booking.student_id, room.booking.tutor.user_id)

    @database_sync_to_async
    def _save_message(self, room_id, user_id, content):
        room = ChatRoom.objects.filter(pk=room_id).first()
        user = User.objects.filter(pk=user_id).first()
        if not room or not user:
            return None
        msg = Message.objects.create(room=room, sender=user, content=content)
        sender_name = user.get_full_name() or user.username or user.email
        return {
            "id": msg.id,
            "sender_id": user.id,
            "sender_name": sender_name,
            "content": msg.content,
            "created_at": msg.created_at.isoformat(),
        }
