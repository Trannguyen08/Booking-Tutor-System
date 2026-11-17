from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.admin_portal.models import SystemSetting, ViolationCase
from apps.ai_reviews.models import AIReview
from apps.bookings.models import Booking, TeachingSlot
from apps.chat.models import ChatRoom, Message
from apps.courses.models import (
    Course,
    CourseReview,
    CourseSession,
    SessionMaterial,
)
from apps.notifications.models import Notification
from apps.online_classes.models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
    OnlineClassSession,
)
from apps.tutors.models import (
    Subject,
    TutorCertification,
    TutorEducation,
    TutorFAQ,
    TutorGuaranteeTransaction,
    TutorProfile as TeachingProfile,
    TutorSubject,
)
from apps.users.models import TutorProfile as RegistrationProfile

User = get_user_model()


def _build_sample_pdf_bytes(title: str, subtitle: str) -> bytes:
    safe_title = title.encode("ascii", "ignore").decode("ascii") or "TutorMatch CV"
    safe_subtitle = subtitle.encode("ascii", "ignore").decode("ascii") or "Tutor Profile"
    stream = (
        f"BT /F1 18 Tf 50 750 Td ({safe_title}) Tj "
        f"/F1 12 Tf 0 -28 Td ({safe_subtitle}) Tj "
        "0 -24 Td (Education, Teaching Experience & Achievements) Tj ET"
    )
    objects = [
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
        f"4 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n",
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]
    pdf = "%PDF-1.4\n"
    offsets = []
    for obj in objects:
        offsets.append(len(pdf.encode("latin-1")))
        pdf += obj
    xref_pos = len(pdf.encode("latin-1"))
    pdf += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    for offset in offsets:
        pdf += f"{offset:010d} 00000 n \n"
    pdf += (
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    )
    return pdf.encode("latin-1")


class Command(BaseCommand):
    help = "Seed idempotent sample data for TutorMatch local testing."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Seeding TutorMatch sample data...")

        # 1. Admin user
        admin_user, created = User.objects.get_or_create(
            email="admin@tutormatch.vn",
            defaults={
                "username": "admin_tutormatch",
                "first_name": "Quản trị",
                "last_name": "TutorMatch",
                "is_staff": True,
                "is_superuser": True,
                "is_verified": True,
                "is_active": True,
            },
        )
        if created or not admin_user.has_usable_password():
            admin_user.set_password("Admin@123")
            admin_user.is_staff = True
            admin_user.is_superuser = True
            admin_user.is_verified = True
            admin_user.save()

        # 2. Subjects
        subject_specs = [
            ("Toán học", "toan-hoc", "Khoa học tự nhiên"),
            ("Vật lý", "vat-ly", "Khoa học tự nhiên"),
            ("Hóa học", "hoa-hoc", "Khoa học tự nhiên"),
            ("Tiếng Anh", "tieng-anh", "Ngoại ngữ"),
            ("IELTS", "ielts", "Ngoại ngữ"),
            ("Ngữ văn", "ngu-van", "Khoa học xã hội"),
            ("Lập trình Python", "lap-trinh-python", "Công nghệ thông tin"),
        ]
        subjects = {}
        for name, slug, category in subject_specs:
            subj, _ = Subject.objects.get_or_create(
                slug=slug, defaults={"name": name, "category": category}
            )
            subjects[slug] = subj

        # 3. Students
        student1, s1_created = User.objects.get_or_create(
            email="student1@tutormatch.vn",
            defaults={
                "username": "baoan_student",
                "first_name": "Bảo An",
                "last_name": "Lê",
                "phone": "0901234561",
                "is_verified": True,
                "is_active": True,
            },
        )
        if s1_created or not student1.has_usable_password():
            student1.set_password("Student@123")
            student1.save()

        student2, s2_created = User.objects.get_or_create(
            email="student2@tutormatch.vn",
            defaults={
                "username": "giahuy_student",
                "first_name": "Gia Huy",
                "last_name": "Trần",
                "phone": "0901234562",
                "is_verified": True,
                "is_active": True,
            },
        )
        if s2_created or not student2.has_usable_password():
            student2.set_password("Student@123")
            student2.save()

        # 4. Approved tutors
        tutor_specs = [
            {
                "email": "tutor1@tutormatch.vn",
                "username": "minhkhoi_tutor",
                "full_name": "Nguyễn Minh Khôi",
                "phone": "0912345001",
                "university": "Đại học Bách Khoa TP.HCM",
                "qualification": "Thạc sĩ",
                "title": "Thạc sĩ Toán & Vật lý - Luyện thi THPTQG",
                "bio": "Hơn 5 năm kinh nghiệm luyện thi THPT Quốc gia và bồi dưỡng học sinh giỏi Toán - Lý tại TP.HCM. Phương pháp trực quan, bám sát năng lực từng học viên.",
                "experience_years": 5,
                "location": "TP Hồ Chí Minh",
                "teaching_mode": "both",
                "teaching_levels": ["THCS", "THPT", "Đại học"],
                "cccd": "079098001001",
                "rating_avg": Decimal("4.90"),
                "total_reviews": 18,
                "subjects": [
                    ("toan-hoc", "THPT", Decimal("180000")),
                    ("vat-ly", "THPT", Decimal("170000")),
                ],
                "educations": [
                    ("Thạc sĩ Toán Ứng dụng", "ĐH Bách Khoa TP.HCM", "2020 - 2022"),
                    ("Cử nhân Sư phạm Toán", "ĐH Sư Phạm TP.HCM", "2016 - 2020"),
                ],
                "certs": [
                    ("Giải Nhì Olympic Toán Sinh viên Toàn quốc", "Hội Toán học VN", "2019"),
                ],
                "faqs": [
                    ("Thầy có dạy kèm 1-1 mất gốc không?", "Có, thầy sẽ kiểm tra đầu vào buổi đầu tiên và thiết kế lộ trình riêng."),
                ],
                "cv_filename": "cv_nguyen_minh_khoi.pdf",
            },
            {
                "email": "tutor2@tutormatch.vn",
                "username": "thaovy_ielts",
                "full_name": "Trần Thảo Vy",
                "phone": "0912345002",
                "university": "Đại học Ngoại Thương",
                "qualification": "Cử nhân",
                "title": "IELTS 8.5 - Gia sư Tiếng Anh giao tiếp & Học thuật",
                "bio": "IELTS 8.5 (Speaking 8.5, Writing 8.0), 4 năm giảng dạy luyện thi IELTS mục tiêu 6.5 - 7.5+ cho học sinh cấp 3 và người đi làm.",
                "experience_years": 4,
                "location": "Hà Nội",
                "teaching_mode": "online",
                "teaching_levels": ["THCS", "THPT", "Người đi làm"],
                "cccd": "001199002002",
                "rating_avg": Decimal("4.85"),
                "total_reviews": 24,
                "subjects": [
                    ("ielts", "Mọi trình độ", Decimal("220000")),
                    ("tieng-anh", "THPT", Decimal("160000")),
                ],
                "educations": [
                    ("Cử nhân Kinh tế Đối ngoại", "ĐH Ngoại Thương", "2018 - 2022"),
                ],
                "certs": [
                    ("IELTS Academic 8.5", "British Council", "2023"),
                    ("TESOL Certificate", "Arizona State University", "2022"),
                ],
                "faqs": [
                    ("Lớp IELTS có chấm chữa Writing chi tiết không?", "Mỗi tuần học viên nộp 2 bài và được sửa chi tiết 1-1."),
                ],
                "cv_filename": "cv_tran_thao_vy.pdf",
            },
            {
                "email": "tutor3@tutormatch.vn",
                "username": "hoangnam_python",
                "full_name": "Lê Hoàng Nam",
                "phone": "0912345003",
                "university": "Đại học Khoa học Tự nhiên TP.HCM",
                "qualification": "Sinh viên",
                "title": "Gia sư Lập trình Python & Toán tư duy",
                "bio": "Sinh viên năm cuối ngành Khoa học Dữ liệu, hướng dẫn Python cơ bản đến nâng cao, thuật toán và Toán THCS/THPT.",
                "experience_years": 2,
                "location": "TP Hồ Chí Minh",
                "teaching_mode": "online",
                "teaching_levels": ["THCS", "THPT", "Đại học"],
                "cccd": "079203003003",
                "rating_avg": Decimal("4.75"),
                "total_reviews": 9,
                "subjects": [
                    ("lap-trinh-python", "Cơ bản - Nâng cao", Decimal("150000")),
                    ("toan-hoc", "THCS", Decimal("130000")),
                ],
                "educations": [
                    ("Cử nhân Khoa học Dữ liệu (Đang theo học)", "ĐH KHTN TP.HCM", "2022 - 2026"),
                ],
                "certs": [
                    ("Top 5 Hackathon Sinh viên", "ĐHQG TP.HCM", "2024"),
                ],
                "faqs": [
                    ("Chưa biết gì về code có học Python được không?", "Hoàn toàn được, lộ trình đi từ tư duy logic và bài tập thực hành nhỏ."),
                ],
                "cv_filename": "cv_le_hoang_nam.pdf",
            },
            {
                "email": "tutor4@tutormatch.vn",
                "username": "thuha_van_hoa",
                "full_name": "Phạm Thu Hà",
                "phone": "0912345004",
                "university": "Đại học Sư Phạm Hà Nội",
                "qualification": "Giáo viên",
                "title": "Giáo viên Ngữ văn & Hóa học - Tận tâm, dễ hiểu",
                "bio": "6 năm giảng dạy môn Ngữ văn và Hóa học THCS - THPT, giúp học sinh nắm chắc kiến thức nền tảng và kỹ năng làm bài thi.",
                "experience_years": 6,
                "location": "Đà Nẵng",
                "teaching_mode": "both",
                "teaching_levels": ["Tiểu học", "THCS", "THPT"],
                "cccd": "048195004004",
                "rating_avg": Decimal("4.95"),
                "total_reviews": 31,
                "subjects": [
                    ("ngu-van", "THPT", Decimal("160000")),
                    ("hoa-hoc", "THCS", Decimal("150000")),
                ],
                "educations": [
                    ("Cử nhân Sư phạm Ngữ văn", "ĐH Sư Phạm Hà Nội", "2014 - 2018"),
                ],
                "certs": [
                    ("Giáo viên dạy giỏi cấp Thành phố", "Sở GD&ĐT Đà Nẵng", "2023"),
                ],
                "faqs": [
                    ("Có kèm viết văn nghị luận xã hội không?", "Có, học viên được luyện dàn ý và sửa văn phong từng tuần."),
                ],
                "cv_filename": "cv_pham_thu_ha.pdf",
            },
        ]

        teaching_profiles = []
        now = timezone.now()
        today = timezone.localdate()

        for spec in tutor_specs:
            user, created = User.objects.get_or_create(
                email=spec["email"],
                defaults={
                    "username": spec["username"],
                    "first_name": spec["full_name"].split()[-1],
                    "last_name": " ".join(spec["full_name"].split()[:-1]),
                    "phone": spec["phone"],
                    "is_tutor": True,
                    "is_verified": True,
                    "is_active": True,
                },
            )
            if created or not user.has_usable_password():
                user.set_password("Tutor@123")
                user.is_tutor = True
                user.is_verified = True
                user.save()

            reg_profile, _ = RegistrationProfile.objects.get_or_create(
                user=user,
                defaults={
                    "full_name": spec["full_name"],
                    "birthday": date(1998, 5, 15),
                    "university": spec["university"],
                    "qualification": spec["qualification"],
                    "bio": spec["bio"],
                    "address": f"Quận Trung tâm, {spec['location']}",
                    "subjects_text": ", ".join(subjects[s].name for s, _, _ in spec["subjects"]),
                    "experience_years": spec["experience_years"],
                    "teaching_levels": spec["teaching_levels"],
                    "teaching_region": spec["location"],
                    "cccd_number": spec["cccd"],
                    "status": "APPROVED",
                },
            )
            if not reg_profile.cv_file:
                pdf_bytes = _build_sample_pdf_bytes(
                    f"CV - {spec['full_name']}",
                    f"{spec['qualification']} - {spec['university']}",
                )
                reg_profile.cv_file.save(spec["cv_filename"], ContentFile(pdf_bytes), save=True)

            teaching_profile, _ = TeachingProfile.objects.get_or_create(
                user=user,
                defaults={
                    "full_name": spec["full_name"],
                    "title": spec["title"],
                    "bio": spec["bio"],
                    "experience_years": spec["experience_years"],
                    "rating_avg": spec["rating_avg"],
                    "total_reviews": spec["total_reviews"],
                    "is_available": True,
                    "guarantee_deposit_balance": Decimal("500000.00"),
                    "location": spec["location"],
                    "teaching_mode": spec["teaching_mode"],
                    "cv_file": reg_profile.cv_file.name,
                },
            )
            if not teaching_profile.cv_file and reg_profile.cv_file:
                teaching_profile.cv_file = reg_profile.cv_file.name
                teaching_profile.save(update_fields=["cv_file"])

            if teaching_profile.guarantee_deposit_balance < Decimal("200000.00"):
                teaching_profile.guarantee_deposit_balance = Decimal("500000.00")
                teaching_profile.save(update_fields=["guarantee_deposit_balance"])

            if not TutorGuaranteeTransaction.objects.filter(tutor=teaching_profile).exists():
                TutorGuaranteeTransaction.objects.create(
                    tutor=teaching_profile,
                    transaction_type="deposit_topup",
                    amount=Decimal("500000.00"),
                    balance_after=Decimal("500000.00"),
                    debt_after=Decimal("0.00"),
                    note="Nạp tiền ký quỹ khởi tạo mẫu",
                )

            for slug, level, rate in spec["subjects"]:
                TutorSubject.objects.get_or_create(
                    tutor=teaching_profile,
                    subject=subjects[slug],
                    defaults={"level": level, "hourly_rate": rate, "is_active": True},
                )

            if not teaching_profile.educations.exists():
                for degree, school, years in spec["educations"]:
                    TutorEducation.objects.create(
                        tutor=teaching_profile, degree=degree, school=school, years=years
                    )

            if not teaching_profile.certifications.exists():
                for title, org, year in spec["certs"]:
                    TutorCertification.objects.create(
                        tutor=teaching_profile, title=title, organization=org, year=year
                    )

            if not teaching_profile.faqs.exists():
                for q, a in spec["faqs"]:
                    TutorFAQ.objects.create(tutor=teaching_profile, question=q, answer=a)

            # Create future teaching slots if none exist
            if not teaching_profile.teaching_slots.filter(status="available").exists():
                primary_subject = subjects[spec["subjects"][0][0]]
                primary_rate = spec["subjects"][0][2]
                for day_offset in range(1, 8):
                    slot_date = today + timedelta(days=day_offset)
                    for hour in (18, 20):
                        start_dt = timezone.make_aware(
                            datetime.combine(slot_date, time(hour, 0))
                        )
                        end_dt = start_dt + timedelta(hours=1, minutes=30)
                        TeachingSlot.objects.create(
                            tutor=teaching_profile,
                            subject=primary_subject,
                            start_time=start_dt,
                            end_time=end_dt,
                            price=(primary_rate * Decimal("1.5")).quantize(Decimal("1.00")),
                            meeting_link="https://meet.google.com/tutormatch-demo",
                            note="Lịch dạy mẫu có sẵn",
                            status="available",
                        )

            teaching_profiles.append(teaching_profile)

        # 5. Pending tutor registration for Admin approval screen
        pending_user, p_created = User.objects.get_or_create(
            email="pending.tutor@tutormatch.vn",
            defaults={
                "username": "quanghuy_pending",
                "first_name": "Quang Huy",
                "last_name": "Vũ",
                "phone": "0912345099",
                "is_tutor": True,
                "is_verified": False,
                "is_active": True,
            },
        )
        if p_created:
            pending_user.set_unusable_password()
            pending_user.save()

        pending_reg, _ = RegistrationProfile.objects.get_or_create(
            user=pending_user,
            defaults={
                "full_name": "Vũ Quang Huy",
                "birthday": date(2000, 9, 20),
                "university": "Đại học Bách Khoa Hà Nội",
                "qualification": "Cử nhân",
                "bio": "Chuyên dạy Toán - Tin học cho học sinh cấp 2, cấp 3, ôn thi chuyên và đánh giá tư duy.",
                "address": "Hai Bà Trưng, Hà Nội",
                "subjects_text": "Toán học, Lập trình Python",
                "experience_years": 3,
                "teaching_levels": ["THCS", "THPT"],
                "teaching_region": "Hà Nội",
                "cccd_number": "001200009099",
                "status": "PENDING",
            },
        )
        if not pending_reg.cv_file:
            pending_reg.cv_file.save(
                "cv_vu_quang_huy.pdf",
                ContentFile(_build_sample_pdf_bytes("CV - Vu Quang Huy", "HUST - Math & Python")),
                save=True,
            )
        if not pending_reg.ai_reviews.exists():
            AIReview.objects.create(
                tutor=pending_reg,
                status=AIReview.Status.COMPLETED,
                pass_score=86,
                risk_level=AIReview.RiskLevel.LOW,
                good_points=["Thông tin học vấn và môn dạy rõ ràng", "Có CV đính kèm đầy đủ"],
                bad_points=[],
                missing_fields=[],
                warning_flags=[],
                admin_suggestion="Hồ sơ đạt chuẩn, có thể phê duyệt.",
                reviewed_at=now,
            )

        # 6. Sample Bookings, Courses, Sessions, Reviews, Chat & Notifications
        tutor1 = teaching_profiles[0]
        tutor2 = teaching_profiles[1]
        math_subj = subjects["toan-hoc"]
        ielts_subj = subjects["ielts"]

        if not Booking.objects.filter(student=student1, tutor=tutor1).exists():
            booking1 = Booking.objects.create(
                student=student1,
                tutor=tutor1,
                subject=math_subj,
                start_time=now - timedelta(days=10),
                end_time=now - timedelta(days=10) + timedelta(hours=1),
                study_start_date=today - timedelta(days=10),
                study_end_date=today + timedelta(days=20),
                student_info={"fullName": "Lê Bảo An", "phone": "0901234561", "goal": "Ôn thi đại học 8.5+"},
                status="confirmed",
                total_price=Decimal("1440000.00"),
                deposit_amount=Decimal("288000.00"),
                payment_status="paid",
                paid_at=now - timedelta(days=10),
                notes="Khóa Toán 12 ôn thi THPT Quốc gia",
            )
            course1 = Course.objects.create(
                student=student1,
                tutor=tutor1,
                subject=math_subj,
                booking=booking1,
                title="Toán 12 - Luyện thi THPT Quốc gia",
                description="Ôn tập chuyên đề hàm số, tích phân và hình học Oxyz.",
                total_sessions=4,
                session_duration_minutes=90,
                schedule_time="Thứ 2, 5 - 19:00",
                start_date=today - timedelta(days=10),
                end_date=today + timedelta(days=20),
                hourly_rate=Decimal("180000.00"),
                status="active",
            )
            s1 = CourseSession.objects.create(
                course=course1,
                session_number=1,
                title="Buổi 1: Khảo sát hàm số & Cực trị",
                scheduled_date=today - timedelta(days=7),
                scheduled_time=time(19, 0),
                student_completed=True,
                student_completed_at=now - timedelta(days=7),
                tutor_notes="Học viên nắm tốt đạo hàm, cần luyện thêm bài toán tham số m.",
            )
            SessionMaterial.objects.create(
                session=s1,
                uploaded_by=tutor1.user,
                material_type="link",
                title="Bộ đề luyện tập Cực trị hàm số",
                content="https://docs.google.com/document/d/demo-tutormatch-math",
            )
            CourseSession.objects.create(
                course=course1,
                session_number=2,
                title="Buổi 2: Mũ & Logarit",
                scheduled_date=today,
                scheduled_time=time(19, 0),
                tutor_notes="Chuẩn bị phiếu bài tập phần bất phương trình logarit.",
            )
            chat_room, _ = ChatRoom.objects.get_or_create(booking=booking1)
            Message.objects.get_or_create(
                room=chat_room,
                sender=student1,
                content="Em chào thầy, tối nay mình học chuyên đề logarit ạ?",
            )
            Message.objects.get_or_create(
                room=chat_room,
                sender=tutor1.user,
                content="Chào An, đúng rồi nhé. Thầy đã gửi tài liệu buổi 2 lên khóa học rồi đó.",
            )

        if not Booking.objects.filter(student=student2, tutor=tutor2).exists():
            booking2 = Booking.objects.create(
                student=student2,
                tutor=tutor2,
                subject=ielts_subj,
                start_time=now - timedelta(days=40),
                end_time=now - timedelta(days=40) + timedelta(hours=1),
                study_start_date=today - timedelta(days=40),
                study_end_date=today - timedelta(days=5),
                student_info={"fullName": "Trần Gia Huy", "phone": "0901234562", "goal": "IELTS 7.0"},
                status="completed",
                total_price=Decimal("880000.00"),
                deposit_amount=Decimal("176000.00"),
                payment_status="paid",
                paid_at=now - timedelta(days=40),
                notes="Khóa IELTS Writing & Speaking cấp tốc",
            )
            course2 = Course.objects.create(
                student=student2,
                tutor=tutor2,
                subject=ielts_subj,
                booking=booking2,
                title="IELTS Writing & Speaking 7.0+",
                description="Luyện Task 1, Task 2 và phản xạ Speaking Part 2, 3.",
                total_sessions=2,
                session_duration_minutes=60,
                schedule_time="Thứ 3, 6 - 20:00",
                start_date=today - timedelta(days=40),
                end_date=today - timedelta(days=5),
                hourly_rate=Decimal("220000.00"),
                status="completed",
            )
            CourseSession.objects.create(
                course=course2,
                session_number=1,
                title="Buổi 1: Writing Task 2 Structure",
                scheduled_date=today - timedelta(days=35),
                scheduled_time=time(20, 0),
                student_completed=True,
                student_completed_at=now - timedelta(days=35),
            )
            CourseSession.objects.create(
                course=course2,
                session_number=2,
                title="Buổi 2: Mock Speaking Test",
                scheduled_date=today - timedelta(days=10),
                scheduled_time=time(20, 0),
                student_completed=True,
                student_completed_at=now - timedelta(days=10),
            )
            CourseReview.objects.create(
                course=course2,
                student=student2,
                tutor=tutor2,
                rating=5,
                comment="Cô dạy rất nhiệt tình, sửa bài Writing kỹ và dễ hiểu!",
                moderation_status=CourseReview.ModerationStatus.APPROVED,
                moderation_score=95,
                moderated_at=now - timedelta(days=4),
            )

        # 7. Notifications
        if not Notification.objects.filter(user=student1).exists():
            Notification.objects.create(
                user=student1,
                title="Lịch học hôm nay",
                message="Bạn có buổi học Toán 12 lúc 19:00 hôm nay với gia sư Nguyễn Minh Khôi.",
                notification_type="course",
                link="/my-courses",
            )
        if not Notification.objects.filter(user=tutor1.user).exists():
            Notification.objects.create(
                user=tutor1.user,
                title="Học viên mới đăng ký",
                message="Học viên Lê Bảo An đã xác nhận khóa Toán 12 - Luyện thi THPT Quốc gia.",
                notification_type="booking",
                link="/tutor/courses",
            )

        # 8. System settings & sample violation case
        SystemSetting.objects.get_or_create(
            key="tutor_commission_rate",
            defaults={
                "label": "Tỷ lệ hoa hồng nền tảng",
                "value": "0.15",
                "value_type": "percent",
                "description": "Hoa hồng platform trên mỗi khóa học hoàn thành.",
                "updated_by": admin_user,
            },
        )
        SystemSetting.objects.get_or_create(
            key="tutor_min_deposit",
            defaults={
                "label": "Số dư ký quỹ tối thiểu",
                "value": "200000",
                "value_type": "money",
                "description": "Mức cọc bảo chứng tối thiểu để gia sư mở nhận lớp mới.",
                "updated_by": admin_user,
            },
        )
        if not ViolationCase.objects.exists():
            ViolationCase.objects.create(
                title="Hỗ trợ đổi lịch buổi học mẫu",
                description="Học viên đề nghị dời buổi học sang cuối tuần do trùng lịch thi học kỳ.",
                reporter=student1,
                target_user=tutor1.user,
                severity="low",
                status="resolved",
                resolution_note="Hai bên đã thống nhất đổi lịch thành công.",
                created_by=student1,
                resolved_by=admin_user,
                resolved_at=now - timedelta(days=2),
            )

        # 9. Sample Online Group Classes (multi-student, PayOS cycles, kick & refund, review)
        if not OnlineClass.objects.exists():
            oc1 = OnlineClass.objects.create(
                tutor=tutor1,
                subject=math_subj,
                title="Lớp Toán 12 Live - Chinh phục 8.5+ THPTQG",
                description="Lớp nhóm tối đa 15 học viên học tương tác trực tiếp, chữa đề trọng tâm mỗi tuần và hỗ trợ hỏi đáp bài tập.",
                level="THPT",
                schedule_text="Thứ 2, 4, 6 · 19:30 - 21:00",
                meeting_link="https://meet.google.com/tutormatch-toan12-live",
                start_date=today - timedelta(days=7),
                total_sessions=16,
                sessions_per_month=8,
                session_duration_minutes=90,
                max_students=15,
                price_per_session=Decimal("90000.00"),
                price_per_month=Decimal("0.00"),
                full_course_price=Decimal("1200000.00"),
                allowed_billing_cycles=["per_session", "full_course"],
                payment_grace_days=3,
                status="open",
            )
            OnlineClassSession.objects.create(
                online_class=oc1,
                session_number=1,
                title="Buổi 1: Tổng ôn Hàm số & Cực trị",
                scheduled_at=now - timedelta(days=5),
                duration_minutes=90,
                status="completed",
                notes="Đã gửi phiếu bài tập chương 1.",
            )
            OnlineClassSession.objects.create(
                online_class=oc1,
                session_number=2,
                title="Buổi 2: Ứng dụng Tích phân",
                scheduled_at=now - timedelta(days=2),
                duration_minutes=90,
                status="completed",
            )
            OnlineClassSession.objects.create(
                online_class=oc1,
                session_number=3,
                title="Buổi 3: Hình học không gian Oxyz",
                scheduled_at=now + timedelta(days=2),
                duration_minutes=90,
                status="scheduled",
            )

            enr1 = OnlineClassEnrollment.objects.create(
                online_class=oc1,
                student=student1,
                billing_cycle="per_session",
                status="active",
                sessions_paid_total=2,
                sessions_attended=2,
                total_paid_amount=Decimal("180000.00"),
                joined_at=now - timedelta(days=7),
                next_payment_due_date=today + timedelta(days=2),
            )
            OnlineClassPayment.objects.create(
                enrollment=enr1,
                student=student1,
                online_class=oc1,
                billing_cycle="per_session",
                sessions_covered=2,
                amount=Decimal("180000.00"),
                status="paid",
                payos_order_code=900001001,
                paid_at=now - timedelta(days=7),
            )
            OnlineClassReview.objects.create(
                online_class=oc1,
                enrollment=enr1,
                student=student1,
                rating=5,
                comment="Lớp đông vui nhưng thầy vẫn kèm rất sát, bài tập chi tiết dễ hiểu!",
            )

            enr2 = OnlineClassEnrollment.objects.create(
                online_class=oc1,
                student=student2,
                billing_cycle="full_course",
                status="kicked_by_tutor",
                sessions_paid_total=16,
                sessions_attended=2,
                total_paid_amount=Decimal("1200000.00"),
                joined_at=now - timedelta(days=7),
                kick_type="tutor_kick",
                kick_reason="Vắng mặt không phép và gây mất trật tự nhiều lần.",
                kick_evidence_note="Biên bản nhắc nhở buổi 1 và log chat buổi 2.",
                kicked_at=now - timedelta(days=1),
                kicked_by=tutor1.user,
                refund_sessions_remaining=14,
                refund_amount=Decimal("1050000.00"),
                refund_status="pending",
            )
            OnlineClassPayment.objects.create(
                enrollment=enr2,
                student=student2,
                online_class=oc1,
                billing_cycle="full_course",
                sessions_covered=16,
                amount=Decimal("1200000.00"),
                status="paid",
                payos_order_code=900001002,
                paid_at=now - timedelta(days=7),
            )

            oc2 = OnlineClass.objects.create(
                tutor=tutor2,
                subject=ielts_subj,
                title="IELTS Writing & Speaking 6.5+ Nhóm nhỏ",
                description="Lớp luyện kỹ năng Speaking và chữa bài Writing Task 1 & 2 theo nhóm tối đa 10 học viên.",
                level="Mọi trình độ",
                schedule_text="Thứ 3, 5 · 20:00 - 21:30",
                meeting_link="https://meet.google.com/tutormatch-ielts-group",
                start_date=today + timedelta(days=3),
                total_sessions=12,
                sessions_per_month=8,
                session_duration_minutes=90,
                max_students=10,
                price_per_session=Decimal("110000.00"),
                price_per_month=Decimal("0.00"),
                full_course_price=Decimal("1100000.00"),
                allowed_billing_cycles=["per_session", "full_course"],
                payment_grace_days=2,
                status="open",
            )
            OnlineClassSession.objects.create(
                online_class=oc2,
                session_number=1,
                title="Buổi 1: Đánh giá trình độ & Tư duy Writing Task 2",
                scheduled_at=now + timedelta(days=3),
                duration_minutes=90,
                status="scheduled",
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Seed completed!\n"
                "  Admin:   admin@tutormatch.vn / Admin@123\n"
                "  Tutor 1: tutor1@tutormatch.vn / Tutor@123\n"
                "  Tutor 2: tutor2@tutormatch.vn / Tutor@123\n"
                "  Student: student1@tutormatch.vn / Student@123"
            )
        )
