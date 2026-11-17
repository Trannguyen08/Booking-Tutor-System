from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatRoom, Message
from .serializers import ChatMessageSerializer, ChatRoomSerializer


def _can_access_room(user, room):
    if user.is_staff or user.is_superuser:
        return True
    return user.id in (room.booking.student_id, room.booking.tutor.user_id)


class ChatRoomListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        queryset = ChatRoom.objects.select_related(
            "booking__student", "booking__tutor__user", "booking__subject"
        ).prefetch_related("messages__sender")
        if not (request.user.is_staff or request.user.is_superuser):
            queryset = queryset.filter(
                Q(booking__student=request.user) | Q(booking__tutor__user=request.user)
            )
        return Response(ChatRoomSerializer(queryset.order_by("-created_at"), many=True).data)


class ChatRoomMessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, room_id):
        room = (
            ChatRoom.objects.select_related("booking__student", "booking__tutor__user")
            .filter(pk=room_id)
            .first()
        )
        if not room:
            return Response(
                {"error": "Không tìm thấy phòng chat."}, status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_room(request.user, room):
            return Response(
                {"error": "Bạn không có quyền truy cập phòng chat này."},
                status=status.HTTP_403_FORBIDDEN,
            )
        room.messages.filter(is_read=False).exclude(sender=request.user).update(is_read=True)
        messages = room.messages.select_related("sender").order_by("created_at")
        return Response(ChatMessageSerializer(messages, many=True).data)

    def post(self, request, room_id):
        room = (
            ChatRoom.objects.select_related("booking__student", "booking__tutor__user")
            .filter(pk=room_id)
            .first()
        )
        if not room:
            return Response(
                {"error": "Không tìm thấy phòng chat."}, status=status.HTTP_404_NOT_FOUND
            )
        if not _can_access_room(request.user, room):
            return Response(
                {"error": "Bạn không có quyền gửi tin nhắn vào phòng này."},
                status=status.HTTP_403_FORBIDDEN,
            )
        content = (request.data.get("content") or request.data.get("message") or "").strip()
        if not content:
            return Response(
                {"error": "Nội dung tin nhắn không được để trống."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        msg = Message.objects.create(room=room, sender=request.user, content=content)
        return Response(ChatMessageSerializer(msg).data, status=status.HTTP_201_CREATED)
