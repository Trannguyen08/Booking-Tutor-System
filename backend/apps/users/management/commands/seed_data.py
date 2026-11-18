from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.admin_portal.models import SystemSetting, TutorPayoutRequest, ViolationCase
from apps.bookings.models import Booking, TeachingSlot
from apps.chat.models import ChatRoom, Message
from apps.courses.models import (
    Course,
    CourseCancellationRequest,
    CourseCommission,
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
    OnlineClassSessionMaterial,
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

        # 1. Admin users
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

        admin_ops, ops_created = User.objects.get_or_create(
            email="admin2@tutormatch.vn",
            defaults={
                "username": "operator_tutormatch",
                "first_name": "Vận hành",
                "last_name": "TutorMatch",
                "phone": "0909000002",
                "is_staff": True,
                "is_superuser": False,
                "is_verified": True,
                "is_active": True,
            },
        )
        if ops_created or not admin_ops.has_usable_password():
            admin_ops.set_password("Admin@123")
            admin_ops.is_staff = True
            admin_ops.is_verified = True
            admin_ops.save()

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

        extra_students = [
            ("student3@tutormatch.vn", "khanhlinh_student", "Khánh Linh", "Nguyễn", "0901234563", True, True),
            ("student4@tutormatch.vn", "minhquan_student", "Minh Quân", "Phạm", "0901234564", True, True),
            ("student5@tutormatch.vn", "maichi_student", "Mai Chi", "Hoàng", "0901234565", False, True),
        ]
        student_map = {
            "student1": student1,
            "student2": student2,
        }
        for idx, (s_email, s_uname, s_fname, s_lname, s_phone, s_verified, s_active) in enumerate(extra_students, start=3):
            stu, s_created = User.objects.get_or_create(
                email=s_email,
                defaults={
                    "username": s_uname,
                    "first_name": s_fname,
                    "last_name": s_lname,
                    "phone": s_phone,
                    "is_verified": s_verified,
                    "is_active": s_active,
                },
            )
            if s_created or not stu.has_usable_password():
                stu.set_password("Student@123")
                stu.save()
            student_map[f"student{idx}"] = stu

        all_student_bank_specs = {
            "student1": ("Vietcombank", "1012345678", "LE BAO AN", "CN Thanh Xuan"),
            "student2": ("Techcombank", "19036888999001", "TRAN GIA HUY", "CN TP.HCM"),
            "student3": ("MB Bank", "0901234563", "NGUYEN KHANH LINH", "CN Da Nang"),
            "student4": ("ACB", "1688899922", "PHAM MINH QUAN", "CN Ha Noi"),
            "student5": ("TPBank", "03689911220", "HOANG HAI DANG", "CN Can Tho"),
        }
        for s_key, (b_name, b_acc, b_holder, b_branch) in all_student_bank_specs.items():
            s_obj = student_map[s_key]
            if not s_obj.bank_name or not s_obj.bank_account_number:
                s_obj.bank_name = b_name
                s_obj.bank_account_number = b_acc
                s_obj.bank_account_holder = b_holder
                s_obj.bank_branch = b_branch
                s_obj.save(update_fields=["bank_name", "bank_account_number", "bank_account_holder", "bank_branch"])
        student3 = student_map["student3"]
        student4 = student_map["student4"]

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
                "deposit_balance": Decimal("350000.00"),
                "commission_debt": Decimal("150000.00"),
            },
            {
                "email": "tutor5@tutormatch.vn",
                "username": "quocbao_ly_hoa",
                "full_name": "Đỗ Quốc Bảo",
                "phone": "0912345005",
                "university": "Đại học Cần Thơ",
                "qualification": "Thạc sĩ",
                "title": "Thạc sĩ Vật lý & Hóa học - Luyện thi khối A",
                "bio": "7 năm kinh nghiệm giảng dạy Vật lý và Hóa học THPT, chuyên luyện đề thi thử các trường chuyên và ôn thi THPTQG.",
                "experience_years": 7,
                "location": "Cần Thơ",
                "teaching_mode": "online",
                "teaching_levels": ["THCS", "THPT"],
                "cccd": "",
                "rating_avg": Decimal("4.70"),
                "total_reviews": 14,
                "subjects": [
                    ("vat-ly", "THPT", Decimal("175000")),
                    ("hoa-hoc", "THPT", Decimal("165000")),
                ],
                "educations": [
                    ("Thạc sĩ Vật lý Lý thuyết", "ĐH Cần Thơ", "2017 - 2019"),
                ],
                "certs": [
                    ("Chiến sĩ thi đua cơ sở", "Trường THPT Chuyên Lý Tự Trọng", "2023"),
                ],
                "faqs": [
                    ("Có dạy nhóm nhỏ cho học sinh tỉnh không?", "Có, thầy có các ca tối linh hoạt cho học sinh online toàn quốc."),
                ],
                "cv_filename": "cv_do_quoc_bao.pdf",
                "deposit_balance": Decimal("120000.00"),
                "commission_debt": Decimal("0.00"),
                "new_class_locked": True,
                "new_class_lock_reason": "low_deposit",
            },
            {
                "email": "tutor6@tutormatch.vn",
                "username": "ngoclinh_locked",
                "full_name": "Võ Ngọc Linh",
                "phone": "0912345006",
                "university": "Đại học Sư Phạm TP.HCM",
                "qualification": "Cử nhân",
                "title": "Gia sư Tiếng Anh & Ngữ văn THCS",
                "bio": "Chuyên bồi dưỡng ngữ pháp Tiếng Anh căn bản và tập làm văn THCS.",
                "experience_years": 3,
                "location": "TP Hồ Chí Minh",
                "teaching_mode": "both",
                "teaching_levels": ["Tiểu học", "THCS"],
                "cccd": "",
                "rating_avg": Decimal("4.30"),
                "total_reviews": 6,
                "subjects": [
                    ("tieng-anh", "THCS", Decimal("140000")),
                    ("ngu-van", "THCS", Decimal("135000")),
                ],
                "educations": [
                    ("Cử nhân Sư phạm Tiếng Anh", "ĐH Sư Phạm TP.HCM", "2019 - 2023"),
                ],
                "certs": [],
                "faqs": [],
                "cv_filename": "cv_vo_ngoc_linh.pdf",
                "is_active": False,
                "deposit_balance": Decimal("250000.00"),
            },
        ]

        teaching_profiles = []
        now = timezone.now()
        today = timezone.localdate()

        for spec in tutor_specs:
            desired_active = spec.get("is_active", True)
            user, created = User.objects.get_or_create(
                email=spec["email"],
                defaults={
                    "username": spec["username"],
                    "first_name": spec["full_name"].split()[-1],
                    "last_name": " ".join(spec["full_name"].split()[:-1]),
                    "phone": spec["phone"],
                    "is_tutor": True,
                    "is_verified": True,
                    "is_active": desired_active,
                },
            )
            if created or not user.has_usable_password():
                user.set_password("Tutor@123")
                user.is_tutor = True
                user.is_verified = True
                user.is_active = desired_active
                user.save()

            tutor_bank_specs = {
                "tutor1@tutormatch.vn": ("Vietcombank", "1029384756", "NGUYEN MINH KHOI", "CN Bách Khoa TP.HCM"),
                "tutor2@tutormatch.vn": ("Vietcombank", "001100445566", "TRAN THAO VY", "CN Hoàn Kiếm Hà Nội"),
                "tutor3@tutormatch.vn": ("MB Bank", "0912345003", "LE HOANG NAM", "CN Quận 5 TP.HCM"),
                "tutor4@tutormatch.vn": ("ACB", "8899776655", "PHAM THU HA", "CN Hải Châu Đà Nẵng"),
                "tutor5@tutormatch.vn": ("Techcombank", "190377665544", "DO QUOC BAO", "CN Ninh Kiều Cần Thơ"),
                "tutor6@tutormatch.vn": ("TPBank", "0333888999", "VO NGOC LINH", "CN Quận 3 TP.HCM"),
            }
            if spec["email"] in tutor_bank_specs and (not user.bank_name or not user.bank_account_number):
                tb_name, tb_acc, tb_holder, tb_branch = tutor_bank_specs[spec["email"]]
                user.bank_name = tb_name
                user.bank_account_number = tb_acc
                user.bank_account_holder = tb_holder
                user.bank_branch = tb_branch
                user.save(update_fields=["bank_name", "bank_account_number", "bank_account_holder", "bank_branch"])

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
                    "cccd_number": spec["cccd"] or None,
                    "status": "APPROVED",
                },
            )
            if not reg_profile.cv_file:
                pdf_bytes = _build_sample_pdf_bytes(
                    f"CV - {spec['full_name']}",
                    f"{spec['qualification']} - {spec['university']}",
                )
                reg_profile.cv_file.save(spec["cv_filename"], ContentFile(pdf_bytes), save=True)

            target_deposit = spec.get("deposit_balance", Decimal("500000.00"))
            target_debt = spec.get("commission_debt", Decimal("0.00"))
            target_locked = spec.get("new_class_locked", False)
            target_lock_reason = spec.get("new_class_lock_reason", "")

            teaching_profile, tp_created = TeachingProfile.objects.get_or_create(
                user=user,
                defaults={
                    "full_name": spec["full_name"],
                    "title": spec["title"],
                    "bio": spec["bio"],
                    "experience_years": spec["experience_years"],
                    "rating_avg": spec["rating_avg"],
                    "total_reviews": spec["total_reviews"],
                    "is_available": desired_active,
                    "guarantee_deposit_balance": target_deposit,
                    "commission_debt": target_debt,
                    "new_class_locked": target_locked,
                    "new_class_lock_reason": target_lock_reason,
                    "location": spec["location"],
                    "teaching_mode": spec["teaching_mode"],
                    "cv_file": reg_profile.cv_file.name,
                },
            )
            if not tp_created:
                tp_changed = []
                if not teaching_profile.cv_file and reg_profile.cv_file:
                    teaching_profile.cv_file = reg_profile.cv_file.name
                    tp_changed.append("cv_file")
                if target_debt > 0 and teaching_profile.commission_debt == 0:
                    teaching_profile.commission_debt = target_debt
                    tp_changed.append("commission_debt")
                if tp_changed:
                    teaching_profile.save(update_fields=tp_changed)

            if not TutorGuaranteeTransaction.objects.filter(tutor=teaching_profile).exists():
                TutorGuaranteeTransaction.objects.create(
                    tutor=teaching_profile,
                    transaction_type="deposit_topup",
                    amount=target_deposit,
                    balance_after=target_deposit,
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

        extra_registrations = [
            {
                "email": "pending.tutor2@tutormatch.vn",
                "username": "lananh_pending",
                "full_name": "Nguyễn Thị Lan Anh",
                "phone": "0912345098",
                "university": "Đại học Ngoại ngữ - ĐHQGHN",
                "qualification": "Cử nhân",
                "bio": "3 năm gia sư Tiếng Anh giao tiếp và IELTS 7.0 cho học sinh THPT tại Hà Nội.",
                "address": "Cầu Giấy, Hà Nội",
                "subjects_text": "Tiếng Anh, IELTS",
                "experience_years": 3,
                "teaching_levels": ["THCS", "THPT"],
                "teaching_region": "Hà Nội",
                "status": "PENDING",
                "cv_filename": "cv_nguyen_lan_anh.pdf",
            },
            {
                "email": "pending.tutor3@tutormatch.vn",
                "username": "ducmanh_pending",
                "full_name": "Trần Đức Mạnh",
                "phone": "0912345097",
                "university": "Đại học Công nghệ Thông tin",
                "qualification": "Sinh viên",
                "bio": "Nhận dạy kèm Toán và Python.",
                "address": "Thủ Đức, TP.HCM",
                "subjects_text": "Lập trình Python, Toán học",
                "experience_years": 0,
                "teaching_levels": ["THCS"],
                "teaching_region": "TP Hồ Chí Minh",
                "status": "PENDING",
                "cv_filename": "cv_tran_duc_manh.pdf",
            },
            {
                "email": "rejected.tutor@tutormatch.vn",
                "username": "vantung_rejected",
                "full_name": "Bùi Văn Tùng",
                "phone": "0912345096",
                "university": "Đại học Mở TP.HCM",
                "qualification": "Sinh viên",
                "bio": "Đăng ký dạy nhiều môn THPT.",
                "address": "Quận 3, TP.HCM",
                "subjects_text": "Toán học, Vật lý, Hóa học",
                "experience_years": 1,
                "teaching_levels": ["THPT"],
                "teaching_region": "TP Hồ Chí Minh",
                "status": "REJECTED",
                "cv_filename": "cv_bui_van_tung.pdf",
            },
        ]
        for reg_spec in extra_registrations:
            ru, ru_created = User.objects.get_or_create(
                email=reg_spec["email"],
                defaults={
                    "username": reg_spec["username"],
                    "first_name": reg_spec["full_name"].split()[-1],
                    "last_name": " ".join(reg_spec["full_name"].split()[:-1]),
                    "phone": reg_spec["phone"],
                    "is_tutor": True,
                    "is_verified": False,
                    "is_active": True,
                },
            )
            if ru_created:
                ru.set_unusable_password()
                ru.save()
            rp, _ = RegistrationProfile.objects.get_or_create(
                user=ru,
                defaults={
                    "full_name": reg_spec["full_name"],
                    "birthday": date(2001, 4, 12),
                    "university": reg_spec["university"],
                    "qualification": reg_spec["qualification"],
                    "bio": reg_spec["bio"],
                    "address": reg_spec["address"],
                    "subjects_text": reg_spec["subjects_text"],
                    "experience_years": reg_spec["experience_years"],
                    "teaching_levels": reg_spec["teaching_levels"],
                    "teaching_region": reg_spec["teaching_region"],
                    "cccd_number": None,
                    "status": reg_spec["status"],
                },
            )
            if not rp.cv_file:
                rp.cv_file.save(
                    reg_spec["cv_filename"],
                    ContentFile(_build_sample_pdf_bytes(f"CV - {reg_spec['full_name']}", reg_spec["university"])),
                    save=True,
                )

        # 6. Sample Bookings, Courses, Sessions, Reviews, Commissions, Payouts, Cancellations & Chat
        tutor1 = teaching_profiles[0]
        tutor2 = teaching_profiles[1]
        tutor3 = teaching_profiles[2]
        tutor4 = teaching_profiles[3]
        math_subj = subjects["toan-hoc"]
        ielts_subj = subjects["ielts"]
        python_subj = subjects["lap-trinh-python"]
        lit_subj = subjects["ngu-van"]
        phys_subj = subjects["vat-ly"]

        if not Booking.objects.filter(student=student1, tutor=tutor1).exists():
            booking1 = Booking.objects.create(
                student=student1,
                tutor=tutor1,
                subject=math_subj,
                start_time=now - timedelta(days=10),
                end_time=now - timedelta(days=10) + timedelta(hours=1),
                study_start_date=today - timedelta(days=10),
                study_end_date=today + timedelta(days=20),
                student_info={
                    "fullName": "Lê Bảo An",
                    "phone": "0901234561",
                    "email": "student1@tutormatch.vn",
                    "address": "258 Nguyễn Trãi, Quận Thanh Xuân, Hà Nội",
                    "currentLevel": "Lớp 12",
                    "goal": "Ôn thi đại học 8.5+",
                },
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
                student_info={
                    "fullName": "Trần Gia Huy",
                    "phone": "0901234562",
                    "email": "student2@tutormatch.vn",
                    "address": "112 Điện Biên Phủ, Quận Bình Thạnh, TP.HCM",
                    "currentLevel": "Sinh viên năm 3",
                    "goal": "IELTS 7.0",
                },
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

        # Additional Bookings / Courses / Commissions / Cancellations / Reviews / Payouts for Admin Dashboard & Operations
        extra_bookings = [
            {
                "order_code": 88000101,
                "student": student3,
                "tutor": tutor3,
                "subject": python_subj,
                "days_ago": 35,
                "status": "completed",
                "payment_status": "paid",
                "total": Decimal("1800000.00"),
                "deposit": Decimal("360000.00"),
                "notes": "Khóa Python thuật toán 1-1 tháng trước",
            },
            {
                "order_code": 88000102,
                "student": student4,
                "tutor": tutor4,
                "subject": lit_subj,
                "days_ago": 22,
                "status": "completed",
                "payment_status": "paid",
                "total": Decimal("1280000.00"),
                "deposit": Decimal("100000.00"),
                "notes": "Khóa Ngữ văn luyện thi (nợ hoa hồng)",
            },
            {
                "order_code": 88000103,
                "student": student3,
                "tutor": tutor1,
                "subject": phys_subj,
                "days_ago": 5,
                "status": "approved",
                "payment_status": "pending",
                "total": Decimal("1360000.00"),
                "deposit": Decimal("272000.00"),
                "notes": "Chờ học viên thanh toán cọc PayOS",
            },
            {
                "order_code": 88000104,
                "student": student4,
                "tutor": tutor2,
                "subject": ielts_subj,
                "days_ago": 2,
                "status": "pending",
                "payment_status": "unpaid",
                "total": Decimal("1760000.00"),
                "deposit": Decimal("352000.00"),
                "notes": "Booking mới chờ gia sư xác nhận",
            },
            {
                "order_code": 88000105,
                "student": student2,
                "tutor": tutor3,
                "subject": python_subj,
                "days_ago": 4,
                "status": "approved",
                "payment_status": "failed",
                "total": Decimal("900000.00"),
                "deposit": Decimal("180000.00"),
                "notes": "Giao dịch PayOS mẫu bị lỗi hết hạn",
            },
            {
                "order_code": 88000106,
                "student": student1,
                "tutor": tutor4,
                "subject": lit_subj,
                "days_ago": 60,
                "status": "cancelled",
                "payment_status": "cancelled",
                "total": Decimal("960000.00"),
                "deposit": Decimal("192000.00"),
                "notes": "Học viên hủy do trùng lịch học trên trường",
            },
        ]
        seeded_bookings = {}
        for bk in extra_bookings:
            target_dt = now - timedelta(days=bk["days_ago"])
            obj, bk_created = Booking.objects.get_or_create(
                payos_order_code=bk["order_code"],
                defaults={
                    "student": bk["student"],
                    "tutor": bk["tutor"],
                    "subject": bk["subject"],
                    "start_time": target_dt + timedelta(days=2),
                    "end_time": target_dt + timedelta(days=2, hours=1, minutes=30),
                    "study_start_date": (target_dt + timedelta(days=2)).date(),
                    "study_end_date": (target_dt + timedelta(days=30)).date(),
                    "student_info": {
                        "fullName": bk["student"].get_full_name() or bk["student"].username,
                        "phone": bk["student"].phone or "0901234500",
                        "email": bk["student"].email,
                        "address": (
                            "45 Trần Phú, Hải Châu, Đà Nẵng"
                            if bk["student"] == student3
                            else "88 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội"
                        ),
                        "currentLevel": "Sinh viên / Người đi làm" if bk["student"] == student3 else "Lớp 11 THPT",
                    },
                    "status": bk["status"],
                    "total_price": bk["total"],
                    "deposit_amount": bk["deposit"],
                    "payment_status": bk["payment_status"],
                    "paid_at": target_dt if bk["payment_status"] == "paid" else None,
                    "notes": bk["notes"],
                },
            )
            if bk_created:
                Booking.objects.filter(pk=obj.pk).update(created_at=target_dt)
            seeded_bookings[bk["order_code"]] = obj

        # Course 3 (Completed Python by tutor3, paid commission)
        course3, c3_created = Course.objects.get_or_create(
            title="Python & Cấu trúc dữ liệu cơ bản",
            defaults={
                "student": student3,
                "tutor": tutor3,
                "subject": python_subj,
                "booking": seeded_bookings[88000101],
                "description": "Lập trình Python từ con số 0 tới giải thuật căn bản.",
                "total_sessions": 8,
                "session_duration_minutes": 90,
                "schedule_time": "Thứ 3, 5 - 19:30",
                "start_date": today - timedelta(days=35),
                "end_date": today - timedelta(days=3),
                "hourly_rate": Decimal("150000.00"),
                "status": "completed",
            },
        )
        if c3_created:
            Course.objects.filter(pk=course3.pk).update(created_at=now - timedelta(days=35))
            CourseCommission.objects.get_or_create(
                course=course3,
                defaults={
                    "tutor": tutor3,
                    "gross_amount": Decimal("1800000.00"),
                    "commission_rate": Decimal("0.1500"),
                    "commission_amount": Decimal("270000.00"),
                    "deducted_amount": Decimal("270000.00"),
                    "status": "deducted",
                    "due_at": now - timedelta(days=2),
                    "settled_at": now - timedelta(days=3),
                },
            )
            CourseReview.objects.get_or_create(
                course=course3,
                defaults={
                    "student": student3,
                    "tutor": tutor3,
                    "rating": 4,
                    "comment": "Thầy hướng dẫn code dễ hiểu, có ví dụ thực tế hay.",
                    "moderation_status": CourseReview.ModerationStatus.APPROVED,
                    "moderation_score": 88,
                    "moderated_at": now - timedelta(days=2),
                },
            )

        python_topics = [
            "Biến, kiểu dữ liệu & vòng lặp",
            "Hàm, tham số & phạm vi biến",
            "List, Tuple & Dictionary nâng cao",
            "Xử lý chuỗi & File I/O",
            "Lập trình hướng đối tượng (OOP)",
            "Đệ quy & Độ phức tạp thuật toán",
            "Ngăn xếp, Hàng đợi & Sắp xếp",
            "Tổng kết dự án mini & Ôn tập",
        ]
        for idx in range(1, course3.total_sessions + 1):
            CourseSession.objects.get_or_create(
                course=course3,
                session_number=idx,
                defaults={
                    "title": f"Buổi {idx}: {python_topics[idx - 1]}",
                    "scheduled_date": today - timedelta(days=max(2, 34 - idx * 4)),
                    "scheduled_time": time(19, 30),
                    "tutor_notes": f"Đã hoàn thành nội dung {python_topics[idx - 1]} và giao bài tập thực hành.",
                    "student_completed": True,
                    "student_completed_at": now - timedelta(days=max(2, 34 - idx * 4)),
                },
            )

        # Course 4 (Completed Ngữ văn by tutor4, OVERDUE commission so Admin can test Deduct & Alerts)
        course4, c4_created = Course.objects.get_or_create(
            title="Ngữ văn THPT - Luyện viết Nghị luận",
            defaults={
                "student": student4,
                "tutor": tutor4,
                "subject": lit_subj,
                "booking": seeded_bookings[88000102],
                "description": "Rèn kỹ năng đọc hiểu và viết bài văn nghị luận xã hội đạt điểm 8.5+.",
                "total_sessions": 6,
                "session_duration_minutes": 90,
                "schedule_time": "Thứ 7, CN - 18:00",
                "start_date": today - timedelta(days=25),
                "end_date": today - timedelta(days=6),
                "hourly_rate": Decimal("160000.00"),
                "status": "completed",
            },
        )
        if c4_created:
            Course.objects.filter(pk=course4.pk).update(created_at=now - timedelta(days=22))
            CourseCommission.objects.get_or_create(
                course=course4,
                defaults={
                    "tutor": tutor4,
                    "gross_amount": Decimal("1440000.00"),
                    "commission_rate": Decimal("0.1500"),
                    "commission_amount": Decimal("150000.00"),
                    "paid_amount": Decimal("0.00"),
                    "deducted_amount": Decimal("0.00"),
                    "status": "due",
                    "due_at": now - timedelta(days=5),
                },
            )
            TutorGuaranteeTransaction.objects.create(
                tutor=tutor4,
                course=course4,
                transaction_type="commission_accrual",
                amount=Decimal("150000.00"),
                balance_after=tutor4.guarantee_deposit_balance,
                debt_after=Decimal("150000.00"),
                note="Phát sinh commission quá hạn khóa Ngữ văn THPT",
            )
            CourseReview.objects.get_or_create(
                course=course4,
                defaults={
                    "student": student4,
                    "tutor": tutor4,
                    "rating": 2,
                    "comment": "Buổi cuối bị dời lịch hơi gấp, mong gia sư sắp xếp ổn định hơn.",
                    "moderation_status": CourseReview.ModerationStatus.APPROVED,
                    "moderation_score": 76,
                    "moderated_at": now - timedelta(days=4),
                },
            )

        lit_topics = [
            "Đọc hiểu văn bản & Biện pháp tu từ",
            "Phân tích nhân vật & Chi tiết nghệ thuật",
            "Viết đoạn văn nghị luận xã hội 200 chữ",
            "Nghị luận văn học: Mở bài & Triển khai luận điểm",
            "So sánh liên hệ tác phẩm & Văn phong diễn đạt",
            "Luyện đề tổng hợp hoàn chỉnh & Chữa bài chi tiết",
        ]
        for idx in range(1, course4.total_sessions + 1):
            CourseSession.objects.get_or_create(
                course=course4,
                session_number=idx,
                defaults={
                    "title": f"Buổi {idx}: {lit_topics[idx - 1]}",
                    "scheduled_date": today - timedelta(days=max(6, 25 - idx * 3)),
                    "scheduled_time": time(18, 0),
                    "tutor_notes": f"Đã hoàn thành chuyên đề {lit_topics[idx - 1]} và chấm sửa bài viết mẫu.",
                    "student_completed": True,
                    "student_completed_at": now - timedelta(days=max(6, 25 - idx * 3)),
                },
            )

        # Course 5 (Paused course with pending cancellation request + low 1-star review sample on another cancelled course)
        course5, _ = Course.objects.get_or_create(
            title="Toán tư duy THCS - Ôn thi vào lớp 10",
            defaults={
                "student": student2,
                "tutor": tutor1,
                "subject": math_subj,
                "description": "Khóa luyện đề vào lớp 10 chuyên Toán.",
                "total_sessions": 8,
                "session_duration_minutes": 90,
                "schedule_time": "Thứ 4, 6 - 19:00",
                "start_date": today - timedelta(days=12),
                "end_date": today + timedelta(days=30),
                "hourly_rate": Decimal("180000.00"),
                "status": "paused",
            },
        )
        math9_topics = [
            "Rút gọn biểu thức chứa căn thức",
            "Phương trình bậc hai & Định lý Vi-et",
            "Giải bài toán bằng cách lập hệ phương trình",
            "Hệ thức lượng trong tam giác vuông",
            "Đường tròn & Tiếp tuyến",
            "Góc nội tiếp & Tứ giác nội tiếp",
            "Bất đẳng thức & Cực trị hình học",
            "Luyện đề thi thử vào lớp 10 chuyên",
        ]
        for idx in range(1, course5.total_sessions + 1):
            is_done = idx <= 2
            CourseSession.objects.get_or_create(
                course=course5,
                session_number=idx,
                defaults={
                    "title": f"Buổi {idx}: {math9_topics[idx - 1]}",
                    "scheduled_date": today - timedelta(days=14 - idx * 3) if is_done else today + timedelta(days=(idx - 2) * 3),
                    "scheduled_time": time(19, 0),
                    "tutor_notes": f"Chuẩn bị phiếu bài tập phần {math9_topics[idx - 1]}.",
                    "student_completed": is_done,
                    "student_completed_at": (now - timedelta(days=14 - idx * 3)) if is_done else None,
                },
            )
        if not CourseCancellationRequest.objects.filter(course=course5).exists():
            CourseCancellationRequest.objects.create(
                course=course5,
                requested_by=student2,
                requested_by_role="student",
                reason="Gia đình chuyển chỗ ở và thay đổi lịch học trên trường nên xin tạm dừng và hoàn cọc phần chưa học.",
                refund_required=True,
                refund_percent=75,
                refund_amount=Decimal("216000.00"),
                refund_note="Đã học 2/8 buổi, đề xuất hoàn 75% tiền cọc.",
                bank_account_name="TRAN GIA HUY",
                bank_account_number="19036888999001",
                bank_name="Techcombank",
                bank_branch="CN TP.HCM",
                status="pending",
            )

        course6, _ = Course.objects.get_or_create(
            title="Vật lý đại cương - Ôn cấp tốc",
            defaults={
                "student": student1,
                "tutor": teaching_profiles[4] if len(teaching_profiles) > 4 else tutor1,
                "subject": phys_subj,
                "description": "Khóa học đã hủy theo thỏa thuận hai bên.",
                "total_sessions": 4,
                "session_duration_minutes": 60,
                "schedule_time": "CN - 14:00",
                "start_date": today - timedelta(days=20),
                "end_date": today - timedelta(days=2),
                "hourly_rate": Decimal("175000.00"),
                "status": "cancelled",
            },
        )
        if not CourseCancellationRequest.objects.filter(course=course6).exists():
            CourseCancellationRequest.objects.create(
                course=course6,
                requested_by=course6.tutor.user,
                requested_by_role="tutor",
                reason="Gia sư bận công tác đột xuất, đã trao đổi thống nhất hủy khóa với học viên.",
                refund_required=True,
                refund_percent=100,
                refund_amount=Decimal("200000.00"),
                refund_note="Hoàn đủ 100% cọc do gia sư xin hủy trước khi khai giảng.",
                status="approved",
                admin_note="Admin đã đối soát hoàn tiền thành công.",
                processed_by=admin_user,
                processed_at=now - timedelta(days=5),
            )
            CourseReview.objects.get_or_create(
                course=course6,
                defaults={
                    "student": student1,
                    "tutor": course6.tutor,
                    "rating": 1,
                    "comment": "Lớp bị hủy cận ngày học làm lỡ kế hoạch ôn thi của em.",
                    "moderation_status": CourseReview.ModerationStatus.APPROVED,
                    "moderation_score": 65,
                    "moderated_at": now - timedelta(days=3),
                },
            )

        # Sample TutorPayoutRequests for Admin Finance screen
        if not TutorPayoutRequest.objects.exists():
            TutorPayoutRequest.objects.create(
                tutor=tutor3,
                course=course3,
                request_type="course_deposit_release",
                amount=Decimal("90000.00"),
                bank_info="MB Bank - 0912345003 - LE HOANG NAM",
                note="Đề nghị giải ngân phần cọc còn dư sau khi hoàn thành khóa Python.",
                status="pending",
                created_by=tutor3.user,
            )
            TutorPayoutRequest.objects.create(
                tutor=tutor2,
                request_type="course_deposit_release",
                amount=Decimal("120000.00"),
                bank_info="Vietcombank - 001100445566 - TRAN THAO VY",
                note="Rút tiền cọc khóa IELTS đã hoàn thành.",
                admin_note="Đã chuyển khoản thanh toán cho gia sư.",
                status="paid",
                created_by=tutor2.user,
                processed_by=admin_user,
                processed_at=now - timedelta(days=3),
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

        # 8. System settings (canonical hyphenated keys) & violation cases
        SystemSetting.objects.filter(
            key__in=["tutor_commission_rate", "tutor_min_deposit"]
        ).delete()
        canonical_settings = [
            ("tutor-guarantee-required-amount", "Cọc bảo chứng gia sư", "200000.00", "money", "Số tiền cọc tối thiểu để gia sư được nhận lớp mới."),
            ("tutor-commission-rate", "Tỷ lệ commission", "0.15", "percent", "Tỷ lệ nền tảng thu khi khóa học hoàn thành."),
            ("tutor-commission-due-days", "Số ngày đến hạn commission", "7", "number", "Số ngày gia sư cần thanh toán commission trước khi bị nhắc/quản lý."),
            ("booking-deposit-rate", "Tỷ lệ cọc booking", "0.20", "percent", "Tỷ lệ cọc gợi ý cho booking mới."),
            ("refund-policy-note", "Ghi chú chính sách hoàn tiền", "Admin đối soát và hoàn tiền thủ công khi booking/khóa học bị hủy hợp lệ.", "text", "Nội dung nội bộ hiển thị cho nhóm vận hành."),
        ]
        for s_key, s_label, s_val, s_type, s_desc in canonical_settings:
            SystemSetting.objects.get_or_create(
                key=s_key,
                defaults={
                    "label": s_label,
                    "value": s_val,
                    "value_type": s_type,
                    "description": s_desc,
                    "updated_by": admin_user,
                },
            )

        violation_specs = [
            {
                "title": "Hỗ trợ đổi lịch buổi học mẫu",
                "description": "Học viên đề nghị dời buổi học sang cuối tuần do trùng lịch thi học kỳ.",
                "reporter": student1,
                "target_user": tutor1.user,
                "severity": "low",
                "status": "resolved",
                "resolution_note": "Hai bên đã thống nhất đổi lịch thành công.",
                "resolved_at": now - timedelta(days=2),
            },
            {
                "title": "Gia sư vào muộn quá 20 phút không báo trước",
                "description": "Học viên phản ánh buổi học tối thứ 7 bắt đầu trễ và chưa nhận được lịch học bù.",
                "reporter": student4,
                "target_user": tutor4.user,
                "course": course4,
                "severity": "high",
                "status": "open",
            },
            {
                "title": "Khiếu nại đánh giá 1 sao sai sự thật",
                "description": "Gia sư đề nghị admin rà soát bình luận tiêu cực sau khi khóa học đã được thỏa thuận hủy.",
                "reporter": course6.tutor.user,
                "target_user": student1,
                "course": course6,
                "severity": "medium",
                "status": "investigating",
            },
            {
                "title": "Nghi vấn trao đổi giao dịch ngoài nền tảng",
                "description": "Hệ thống phát hiện gia sư đề nghị chuyển khoản trực tiếp ngoài PayOS.",
                "reporter": admin_user,
                "target_user": teaching_profiles[5].user if len(teaching_profiles) > 5 else tutor2.user,
                "severity": "critical",
                "status": "resolved",
                "resolution_note": "Đã tạm khóa tài khoản vi phạm chính sách nền tảng.",
                "resolved_at": now - timedelta(days=1),
            },
        ]
        for v_spec in violation_specs:
            ViolationCase.objects.get_or_create(
                title=v_spec["title"],
                defaults={
                    "description": v_spec["description"],
                    "reporter": v_spec["reporter"],
                    "target_user": v_spec["target_user"],
                    "course": v_spec.get("course"),
                    "severity": v_spec["severity"],
                    "status": v_spec["status"],
                    "resolution_note": v_spec.get("resolution_note", ""),
                    "created_by": v_spec["reporter"],
                    "resolved_by": admin_user if v_spec.get("resolved_at") else None,
                    "resolved_at": v_spec.get("resolved_at"),
                },
            )

        # 9. Sample Online Group Classes (multi-student, PayOS cycles, kick & refund, review)
        oc1, oc1_created = OnlineClass.objects.get_or_create(
            title="Lớp Toán 12 Live - Chinh phục 8.5+ THPTQG",
            defaults={
                "tutor": tutor1,
                "subject": math_subj,
                "description": "Lớp nhóm tối đa 15 học viên học tương tác trực tiếp, chữa đề trọng tâm mỗi tuần và hỗ trợ hỏi đáp bài tập.",
                "level": "THPT",
                "schedule_text": "Thứ 2, 4, 6 · 19:30 - 21:00",
                "meeting_link": "https://meet.google.com/tutormatch-toan12-live",
                "start_date": today - timedelta(days=7),
                "end_date": today + timedelta(days=35),
                "total_sessions": 16,
                "sessions_per_month": 8,
                "session_duration_minutes": 90,
                "max_students": 15,
                "price_per_session": Decimal("90000.00"),
                "price_per_month": Decimal("0.00"),
                "full_course_price": Decimal("1200000.00"),
                "allowed_billing_cycles": ["per_session", "full_course"],
                "payment_grace_days": 3,
                "status": "open",
            },
        )
        if not oc1.end_date:
            oc1.end_date = oc1.start_date + timedelta(days=42)
            oc1.save(update_fields=["end_date"])
        if oc1_created:
            OnlineClassSession.objects.create(
                online_class=oc1,
                session_number=1,
                title="Tổng ôn Hàm số & Cực trị",
                scheduled_at=now - timedelta(days=5),
                duration_minutes=90,
                status="completed",
                notes="Đã gửi phiếu bài tập chương 1.",
            )
            OnlineClassSession.objects.create(
                online_class=oc1,
                session_number=2,
                title="Ứng dụng Tích phân",
                scheduled_at=now - timedelta(days=2),
                duration_minutes=90,
                status="completed",
            )
            OnlineClassSession.objects.create(
                online_class=oc1,
                session_number=3,
                title="Hình học không gian Oxyz",
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

        oc1_s1 = oc1.sessions.filter(session_number=1).first()
        if oc1_s1 and not oc1_s1.materials.exists():
            OnlineClassSessionMaterial.objects.create(
                session=oc1_s1,
                uploaded_by=tutor1.user,
                material_type="note",
                title="Hướng dẫn làm bài tập Chương 1",
                content="Các em hoàn thành 20 câu trắc nghiệm Hàm số trước buổi học kế tiếp nhé.",
            )
            OnlineClassSessionMaterial.objects.create(
                session=oc1_s1,
                uploaded_by=tutor1.user,
                material_type="link",
                title="Đề luyện tập Cực trị & Tiệm cận",
                external_url="https://docs.google.com/document/d/tutormatch-toan12-ch1",
            )

        oc2, oc2_created = OnlineClass.objects.get_or_create(
            title="IELTS Writing & Speaking 6.5+ Nhóm nhỏ",
            defaults={
                "tutor": tutor2,
                "subject": ielts_subj,
                "description": "Lớp luyện kỹ năng Speaking và chữa bài Writing Task 1 & 2 theo nhóm tối đa 10 học viên.",
                "level": "Mọi trình độ",
                "schedule_text": "Thứ 3, 5 · 20:00 - 21:30",
                "meeting_link": "https://meet.google.com/tutormatch-ielts-group",
                "start_date": today + timedelta(days=3),
                "end_date": today + timedelta(days=45),
                "total_sessions": 12,
                "sessions_per_month": 8,
                "session_duration_minutes": 90,
                "max_students": 10,
                "price_per_session": Decimal("110000.00"),
                "price_per_month": Decimal("0.00"),
                "full_course_price": Decimal("1100000.00"),
                "allowed_billing_cycles": ["per_session", "full_course"],
                "payment_grace_days": 2,
                "status": "open",
            },
        )
        if oc2_created:
            OnlineClassSession.objects.create(
                online_class=oc2,
                session_number=1,
                title="Đánh giá trình độ & Tư duy Writing Task 2",
                scheduled_at=now + timedelta(days=3),
                duration_minutes=90,
                status="scheduled",
            )

        # Active enrollment on oc2 already overdue (> 2 grace days) so Admin worker button has live overdue case to process
        if not OnlineClassEnrollment.objects.filter(online_class=oc2, student=student3).exists():
            enr_overdue = OnlineClassEnrollment.objects.create(
                online_class=oc2,
                student=student3,
                billing_cycle="per_session",
                status="active",
                sessions_paid_total=1,
                sessions_attended=1,
                total_paid_amount=Decimal("110000.00"),
                joined_at=now - timedelta(days=10),
                next_payment_due_date=today - timedelta(days=5),
            )
            OnlineClassPayment.objects.create(
                enrollment=enr_overdue,
                student=student3,
                online_class=oc2,
                billing_cycle="per_session",
                sessions_covered=1,
                amount=Decimal("110000.00"),
                status="paid",
                payos_order_code=900001003,
                paid_at=now - timedelta(days=10),
            )

        oc3, oc3_created = OnlineClass.objects.get_or_create(
            title="Python Thực Chiến & Giải Thuật Cơ Bản (Nhóm 12 HV)",
            defaults={
                "tutor": tutor3,
                "subject": python_subj,
                "description": "Xây dựng nền tảng lập trình Python qua bài tập thực hành trực tiếp và mini project.",
                "level": "THPT - Đại học",
                "schedule_text": "Thứ 7, CN · 19:00 - 20:30",
                "meeting_link": "https://meet.google.com/tutormatch-python-group",
                "start_date": today - timedelta(days=4),
                "total_sessions": 10,
                "sessions_per_month": 8,
                "session_duration_minutes": 90,
                "max_students": 12,
                "price_per_session": Decimal("85000.00"),
                "price_per_month": Decimal("0.00"),
                "full_course_price": Decimal("750000.00"),
                "allowed_billing_cycles": ["per_session", "full_course"],
                "payment_grace_days": 3,
                "status": "open",
            },
        )
        if oc3_created:
            OnlineClassSession.objects.create(
                online_class=oc3,
                session_number=1,
                title="Cú pháp Python & Vòng lặp",
                scheduled_at=now - timedelta(days=3),
                duration_minutes=90,
                status="completed",
            )
            OnlineClassSession.objects.create(
                online_class=oc3,
                session_number=2,
                title="Hàm, List & Dictionary",
                scheduled_at=now + timedelta(days=4),
                duration_minutes=90,
                status="scheduled",
            )
            enr4 = OnlineClassEnrollment.objects.create(
                online_class=oc3,
                student=student4,
                billing_cycle="full_course",
                status="active",
                sessions_paid_total=10,
                sessions_attended=1,
                total_paid_amount=Decimal("750000.00"),
                joined_at=now - timedelta(days=4),
            )
            OnlineClassPayment.objects.create(
                enrollment=enr4,
                student=student4,
                online_class=oc3,
                billing_cycle="full_course",
                sessions_covered=10,
                amount=Decimal("750000.00"),
                status="paid",
                payos_order_code=900001004,
                paid_at=now - timedelta(days=4),
            )
            OnlineClassReview.objects.create(
                online_class=oc3,
                enrollment=enr4,
                student=student4,
                rating=5,
                comment="Học nhóm cùng các bạn rất hào hứng, thầy sửa bug trực tiếp ngay trên lớp.",
            )

        oc4, oc4_created = OnlineClass.objects.get_or_create(
            title="Ngữ Văn THPT - Phân Tích Tác Phẩm Trọng Tâm",
            defaults={
                "tutor": tutor4,
                "subject": lit_subj,
                "description": "Hệ thống sơ đồ tư duy tác phẩm và luyện đề nghị luận văn học chuẩn cấu trúc đề thi.",
                "level": "THPT",
                "schedule_text": "Thứ 2, 5 · 20:00 - 21:30",
                "meeting_link": "https://meet.google.com/tutormatch-nguvan-group",
                "start_date": today - timedelta(days=14),
                "total_sessions": 12,
                "sessions_per_month": 8,
                "session_duration_minutes": 90,
                "max_students": 20,
                "price_per_session": Decimal("80000.00"),
                "price_per_month": Decimal("0.00"),
                "full_course_price": Decimal("880000.00"),
                "allowed_billing_cycles": ["per_session", "full_course"],
                "payment_grace_days": 2,
                "status": "open",
            },
        )
        if oc4_created:
            enr5 = OnlineClassEnrollment.objects.create(
                online_class=oc4,
                student=student1,
                billing_cycle="per_session",
                status="kicked_unpaid",
                sessions_paid_total=1,
                sessions_attended=1,
                total_paid_amount=Decimal("80000.00"),
                joined_at=now - timedelta(days=14),
                next_payment_due_date=today - timedelta(days=5),
                kick_type="overdue_unpaid",
                kick_reason="Quá hạn đóng học phí (gia hạn 2 ngày). Không hoàn tiền theo quy định.",
                refund_amount=Decimal("0.00"),
                refund_sessions_remaining=0,
                refund_status="none",
                kicked_at=now - timedelta(days=2),
            )
            OnlineClassPayment.objects.create(
                enrollment=enr5,
                student=student1,
                online_class=oc4,
                billing_cycle="per_session",
                sessions_covered=1,
                amount=Decimal("80000.00"),
                status="paid",
                payos_order_code=900001005,
                paid_at=now - timedelta(days=14),
            )

        # Synchronize TutorProfile.rating_avg & total_reviews from actual reviews in DB
        for tp in TeachingProfile.objects.all():
            scores = list(
                CourseReview.objects.filter(
                    tutor=tp, moderation_status=CourseReview.ModerationStatus.APPROVED
                ).values_list("rating", flat=True)
            ) + list(
                OnlineClassReview.objects.filter(
                    online_class__tutor=tp, is_visible=True
                ).values_list("rating", flat=True)
            )
            tp.total_reviews = len(scores)
            tp.rating_avg = (
                Decimal(str(round(sum(scores) / len(scores), 2))) if scores else Decimal("0.00")
            )
            tp.save(update_fields=["rating_avg", "total_reviews"])

        self.stdout.write(
            self.style.SUCCESS(
                "Seed completed!\n"
                "  Admin 1: admin@tutormatch.vn / Admin@123 (Superuser)\n"
                "  Admin 2: admin2@tutormatch.vn / Admin@123 (Staff)\n"
                "  Tutors:  tutor1..tutor6@tutormatch.vn / Tutor@123\n"
                "  Students: student1..student5@tutormatch.vn / Student@123"
            )
        )
