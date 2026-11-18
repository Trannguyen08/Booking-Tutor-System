from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
import re
import secrets
import string

from apps.tutors.models import Subject, TutorProfile as TeachingProfile, TutorSubject

from ..models import TutorAchievement, TutorProfile
from ..tasks import (
    send_tutor_registration_pending_email,
    send_tutor_registration_result_email,
)

User = get_user_model()
MAX_TUTOR_BIO_LENGTH = 1000
DEFAULT_TUTOR_HOURLY_RATE = 70000
CCCD_PATTERN = re.compile(r"^\d{12}$")
TEMP_PASSWORD_ALPHABET = string.ascii_letters + string.digits
CV_ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"}
CV_MAX_FILE_SIZE = 10 * 1024 * 1024


def validate_cv_file(cv_file):
    if not cv_file:
        return None
    name = getattr(cv_file, "name", "") or ""
    suffix = f".{name.rsplit('.', 1)[-1].lower()}" if "." in name else ""
    if suffix not in CV_ALLOWED_EXTENSIONS:
        raise ValueError(
            "CV phải có định dạng PDF, DOC, DOCX hoặc ảnh (JPG, PNG, WEBP)."
        )
    if getattr(cv_file, "size", 0) > CV_MAX_FILE_SIZE:
        raise ValueError("Dung lượng file CV không được vượt quá 10MB.")
    return cv_file


def _unique_username(email):
    username = email.split("@")[0]
    base_username = username
    counter = 1

    while User.objects.filter(username=username).exists():
        username = f"{base_username}{counter}"
        counter += 1

    return username


def register_tutor(data, files):
    email = data.get("email")
    bio = (data.get("bio") or "").strip()
    cccd_number = re.sub(r"\s+", "", data.get("cccd_number") or "")
    has_valid_cccd_number = bool(CCCD_PATTERN.fullmatch(cccd_number))
    try:
        experience_years = int(data.get("experience_years") or 0)
    except (TypeError, ValueError):
        raise ValueError("So nam kinh nghiem phai la so tu 0 den 30.")
    if experience_years < 0 or experience_years > 30:
        raise ValueError("So nam kinh nghiem phai nam trong khoang 0 den 30.")

    required_fields = [
        "full_name",
        "phone",
        "email",
        "university",
        "qualification",
        "address",
        "subjects_text",
        "teaching_region",
    ]
    missing_fields = [field for field in required_fields if not data.get(field)]
    missing_files = [
        field for field in ["avatar"] if not files.get(field)
    ]
    teaching_levels = (
        data.getlist("teaching_levels")
        if hasattr(data, "getlist")
        else data.get("teaching_levels", [])
    )
    if not teaching_levels:
        missing_fields.append("teaching_levels")

    if len(bio) > MAX_TUTOR_BIO_LENGTH:
        raise ValueError(
            f"Mo ta ban than khong duoc vuot qua {MAX_TUTOR_BIO_LENGTH} ky tu."
        )

    if cccd_number and not has_valid_cccd_number:
        raise ValueError("So CCCD phai gom dung 12 chu so.")

    if missing_fields or missing_files:
        missing = ", ".join(missing_fields + missing_files)
        raise ValueError(f"Thieu thong tin bat buoc: {missing}.")

    if User.objects.filter(email=email).exists():
        raise ValueError("Email nay da duoc dang ky.")

    if cccd_number and TutorProfile.objects.filter(cccd_number=cccd_number).exists():
        raise ValueError("So CCCD nay da duoc su dung.")

    cv_file = validate_cv_file(files.get("cv_file") or files.get("cv"))

    with transaction.atomic():
        user = User.objects.create_user(
            username=_unique_username(email),
            email=email,
            password=None,
            phone=data.get("phone", ""),
            is_tutor=True,
            is_active=True,
            is_verified=False,
        )
        if files.get("avatar"):
            user.avatar = files.get("avatar")
            user.save(update_fields=["avatar"])

        profile = TutorProfile.objects.create(
            user=user,
            full_name=data.get("full_name"),
            birthday=data.get("birthday") or None,
            university=data.get("university"),
            qualification=data.get("qualification"),
            bio=bio,
            address=data.get("address"),
            subjects_text=data.get("subjects_text", ""),
            experience_years=experience_years,
            teaching_levels=teaching_levels,
            teaching_region=data.get("teaching_region", ""),
            cccd_number=cccd_number or None,
            id_front=files.get("id_front"),
            id_back=files.get("id_back"),
            cv_file=cv_file,
            status="PENDING",
        )

        achievement_files = (
            files.getlist("achievements")
            if hasattr(files, "getlist")
            else (files.get("achievements") or [])
        )
        for file in achievement_files:
            TutorAchievement.objects.create(tutor=profile, image=file)

    send_tutor_registration_pending_email.delay(user.email, profile.full_name)
    return profile


def generate_temporary_password(length=8):
    return "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(length))


def _subject_names(subjects_text):
    names = []
    for raw in subjects_text.replace(";", ",").replace("\n", ",").split(","):
        name = raw.strip()
        if name and name.lower() not in [item.lower() for item in names]:
            names.append(name)
    return names


def approve_tutor_registration(profile):
    temporary_password = generate_temporary_password()
    profile.status = "APPROVED"
    profile.user.is_verified = True
    profile.user.set_password(temporary_password)
    profile.user.save(update_fields=["is_verified", "password"])
    profile.save(update_fields=["status"])

    teaching_profile, _ = TeachingProfile.objects.get_or_create(
        user=profile.user,
        defaults={
            "full_name": profile.full_name,
            "title": profile.qualification,
            "bio": profile.bio,
            "location": profile.teaching_region or profile.address,
            "experience_years": profile.experience_years,
            "cv_file": profile.cv_file.name if profile.cv_file else "",
        },
    )
    teaching_profile.full_name = profile.full_name
    teaching_profile.title = profile.qualification
    teaching_profile.bio = profile.bio
    teaching_profile.location = profile.teaching_region or profile.address
    teaching_profile.experience_years = profile.experience_years
    update_fields = ["full_name", "title", "bio", "location", "experience_years"]
    if profile.cv_file and not teaching_profile.cv_file:
        teaching_profile.cv_file = profile.cv_file.name
        update_fields.append("cv_file")
    teaching_profile.save(update_fields=update_fields)

    level = ", ".join(profile.teaching_levels or []) or "Mọi trình độ"
    for name in _subject_names(profile.subjects_text):
        slug = slugify(name)
        subject, _ = Subject.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "category": "Gia sư đăng ký"},
        )
        TutorSubject.objects.get_or_create(
            tutor=teaching_profile,
            subject=subject,
            defaults={
                "level": level,
                "hourly_rate": DEFAULT_TUTOR_HOURLY_RATE,
                "is_active": True,
            },
        )

    send_tutor_registration_result_email.delay(
        profile.user.email, profile.full_name, True, "", temporary_password
    )
    from apps.notifications.tasks import create_notification

    create_notification(
        user_id=profile.user_id,
        title="Hồ sơ gia sư đã được duyệt",
        message="Chúc mừng! Hồ sơ gia sư của bạn đã được phê duyệt. Hãy hoàn thiện lịch dạy và học phí.",
        notification_type="success",
        link="/tutor/settings",
    )
    return profile


def reject_tutor_registration(profile, reason=""):
    profile.status = "REJECTED"
    profile.save(update_fields=["status"])
    send_tutor_registration_result_email.delay(
        profile.user.email,
        profile.full_name,
        False,
        reason,
    )
    return profile
