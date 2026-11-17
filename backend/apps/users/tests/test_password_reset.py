from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.test import APITransactionTestCase

from apps.users.models import OTP

User = get_user_model()


class PasswordResetFlowTests(APITransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reset_user",
            email="reset@example.com",
            password="OldPassword123!",
            is_active=True,
            is_verified=True,
        )

    def test_forgot_and_reset_password_with_otp(self):
        with patch("apps.users.views.send_otp_email.delay") as mock_delay:
            res = self.client.post(
                reverse("auth-forgot-password"),
                {"email": self.user.email},
                format="json",
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            mock_delay.assert_called_once_with(self.user.email)

        OTP.objects.create(
            email=self.user.email,
            code="123456",
            expires_at=timezone.now() + timedelta(minutes=5),
        )

        reset_res = self.client.post(
            reverse("auth-reset-password"),
            {
                "email": self.user.email,
                "code": "123456",
                "new_password": "NewStrongPassword123!",
            },
            format="json",
        )
        self.assertEqual(reset_res.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStrongPassword123!"))
        self.assertTrue(OTP.objects.get(email=self.user.email, code="123456").is_used)
