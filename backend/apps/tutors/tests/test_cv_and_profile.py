import tempfile
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITransactionTestCase

from apps.tutors.models import Subject, TutorProfile as TeachingProfile, TutorSubject
from apps.users.models import TutorProfile as RegistrationProfile
from apps.users.services.tutor_registration import (
    approve_tutor_registration,
    register_tutor,
)

User = get_user_model()


def _fake_image(name: str) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"\x89PNG\r\n\x1a\nfakeimg", content_type="image/png")


def _fake_pdf(name: str = "cv_sample.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", content_type="application/pdf")


@override_settings(
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    },
    MEDIA_ROOT=tempfile.mkdtemp(),
    TUTOR_GUARANTEE_REQUIRED_AMOUNT="200000.00",
)
class TutorCVAndPublicPrivacyTests(APITransactionTestCase):
    def test_register_tutor_with_cv_and_public_detail_exposes_cv_not_cccd(self):
        with (
            patch("apps.users.services.tutor_registration.create_pending_review_for_tutor"),
            patch("apps.users.services.tutor_registration.send_tutor_registration_pending_email.delay"),
            patch("apps.users.services.tutor_registration.send_tutor_registration_result_email.delay"),
        ):
            reg = register_tutor(
                {
                    "full_name": "Nguyen Van A",
                    "phone": "0909998887",
                    "email": "tutor.cv@example.com",
                    "university": "DH Bach Khoa",
                    "qualification": "Cu nhan",
                    "bio": "Day Toan THPT",
                    "address": "123 Duong ABC",
                    "subjects_text": "Toan",
                    "experience_years": "2",
                    "teaching_region": "TP Ho Chi Minh",
                    "teaching_levels": ["THPT"],
                },
                {
                    "avatar": _fake_image("avatar.png"),
                    "cv_file": _fake_pdf("nguyen_van_a_cv.pdf"),
                },
            )
            self.assertTrue(bool(reg.cv_file))

            approve_tutor_registration(reg)

        teaching_profile = TeachingProfile.objects.get(user=reg.user)
        teaching_profile.guarantee_deposit_balance = Decimal("300000.00")
        teaching_profile.save(update_fields=["guarantee_deposit_balance"])

        res = self.client.get(reverse("tutor-public-detail", kwargs={"pk": teaching_profile.id}))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("cv_url", res.data)
        self.assertIn("cv_preview_url", res.data)
        self.assertTrue(res.data["cv_url"].endswith("nguyen_van_a_cv.pdf") or "nguyen_van_a_cv" in res.data["cv_url"])
        self.assertEqual(res.data["cv_filename"].split("/")[-1][:12], "nguyen_van_a")
        self.assertNotIn("cccd_number", res.data)
        self.assertNotIn("id_front_url", res.data)
        self.assertNotIn("id_back_url", res.data)

        cv_res = self.client.get(reverse("tutor-public-cv", kwargs={"pk": teaching_profile.id}))
        self.assertEqual(cv_res.status_code, status.HTTP_200_OK)
        self.assertNotEqual(cv_res.headers.get("X-Frame-Options"), "DENY")
        self.assertIn("inline", cv_res.headers.get("Content-Disposition", ""))
        cv_res.close()

    def test_register_tutor_rejects_invalid_cv_extension(self):
        with self.assertRaises(ValueError):
            register_tutor(
                {
                    "full_name": "Nguyen Van B",
                    "phone": "0909998886",
                    "email": "tutor.badcv@example.com",
                    "university": "DH KHTN",
                    "qualification": "Sinh vien",
                    "address": "456 Duong XYZ",
                    "subjects_text": "Ly",
                    "experience_years": "1",
                    "teaching_region": "Ha Noi",
                    "teaching_levels": ["THCS"],
                },
                {
                    "avatar": _fake_image("avatar.png"),
                    "id_front": _fake_image("front.png"),
                    "id_back": _fake_image("back.png"),
                    "cv_file": SimpleUploadedFile("malware.exe", b"MZ...", content_type="application/octet-stream"),
                },
            )

    def test_tutor_settings_can_upload_and_remove_cv(self):
        user = User.objects.create_user(
            username="tutor_cv_settings",
            email="tutor.settings.cv@example.com",
            password="password123",
            is_tutor=True,
            is_verified=True,
        )
        RegistrationProfile.objects.create(
            user=user,
            full_name="Tutor Settings",
            university="DH QG",
            qualification="Cu nhan",
            address="HCM",
            status="APPROVED",
        )
        profile = TeachingProfile.objects.create(user=user, full_name="Tutor Settings")
        subj = Subject.objects.create(name="Hoa", slug="hoa-cv-test", category="STEM")
        TutorSubject.objects.create(tutor=profile, subject=subj, level="THPT", hourly_rate=Decimal("100000"))

        self.client.force_authenticate(user)
        upload_res = self.client.patch(
            reverse("tutor-settings"),
            {"cv_file": _fake_pdf("updated_cv.pdf")},
            format="multipart",
        )
        self.assertEqual(upload_res.status_code, status.HTTP_200_OK)
        self.assertTrue(bool(upload_res.data["cv_url"]))

        remove_res = self.client.patch(
            reverse("tutor-settings"),
            {"remove_cv": True},
            format="json",
        )
        self.assertEqual(remove_res.status_code, status.HTTP_200_OK)
        self.assertEqual(remove_res.data["cv_url"], "")
