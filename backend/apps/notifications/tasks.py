from celery import shared_task
from django.contrib.auth import get_user_model

from .models import Notification

User = get_user_model()


def create_notification(
    user_id,
    message,
    title="Thông báo",
    notification_type="info",
    link="",
):
    if not user_id or not message:
        return None
    if not User.objects.filter(pk=user_id).exists():
        return None
    return Notification.objects.create(
        user_id=user_id,
        title=title or "Thông báo",
        message=message,
        notification_type=notification_type,
        link=link or "",
    )


@shared_task
def send_notification(
    user_id,
    message,
    title="Thông báo",
    notification_type="info",
    link="",
):
    notification = create_notification(
        user_id=user_id,
        message=message,
        title=title,
        notification_type=notification_type,
        link=link,
    )
    return notification.id if notification else None
