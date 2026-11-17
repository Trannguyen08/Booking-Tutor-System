from rest_framework import serializers

from .models import ChatRoom, Message


class ChatMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ["id", "room", "sender", "sender_name", "content", "is_read", "created_at"]
        read_only_fields = ["id", "room", "sender", "sender_name", "is_read", "created_at"]

    def get_sender_name(self, obj):
        return obj.sender.get_full_name() or obj.sender.username or obj.sender.email


class ChatRoomSerializer(serializers.ModelSerializer):
    booking_id = serializers.IntegerField(source="booking.id", read_only=True)
    subject_name = serializers.CharField(source="booking.subject.name", read_only=True)
    student_name = serializers.SerializerMethodField()
    tutor_name = serializers.CharField(source="booking.tutor.full_name", read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatRoom
        fields = [
            "id",
            "booking_id",
            "subject_name",
            "student_name",
            "tutor_name",
            "last_message",
            "created_at",
        ]

    def get_student_name(self, obj):
        student = obj.booking.student
        return student.get_full_name() or student.username or student.email

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        return ChatMessageSerializer(msg).data if msg else None
