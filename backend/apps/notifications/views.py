from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        queryset = Notification.objects.filter(user=request.user)[:30]
        unread_count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response(
            {
                "unread_count": unread_count,
                "results": NotificationSerializer(queryset, many=True).data,
            }
        )


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        updated = Notification.objects.filter(pk=pk, user=request.user).update(
            is_read=True
        )
        if not updated:
            return Response(
                {"error": "Không tìm thấy thông báo."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"status": "ok"})


class NotificationMarkAllReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(
            is_read=True
        )
        return Response({"status": "ok"})
