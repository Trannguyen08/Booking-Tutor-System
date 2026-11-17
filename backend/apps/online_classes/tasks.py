from celery import shared_task

from .services import kick_overdue_unpaid_enrollments, send_due_payment_reminders


@shared_task
def send_online_class_payment_reminders():
    return send_due_payment_reminders()


@shared_task
def process_overdue_online_class_enrollments():
    return kick_overdue_unpaid_enrollments()
