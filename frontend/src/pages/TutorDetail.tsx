import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  MapPin,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import { publicClient } from '../api/client';
import { bookingsApi } from '../api/bookings';
import { useToast } from '../components/ui/Toast';

const weekdays = [
  { value: 1, label: 'Thứ 2' },
  { value: 2, label: 'Thứ 3' },
  { value: 3, label: 'Thứ 4' },
  { value: 4, label: 'Thứ 5' },
  { value: 5, label: 'Thứ 6' },
  { value: 6, label: 'Thứ 7' },
  { value: 0, label: 'CN' },
];

const TEACHING_MODE_LABELS: Record<string, string> = {
  online: 'Trực tuyến (Online)',
  offline: 'Trực tiếp (Offline)',
  both: 'Online & Offline',
};

const formatTeachingMode = (mode?: string) =>
  (mode && TEACHING_MODE_LABELS[mode.toLowerCase()]) || mode || 'Online';

const money = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const scheduleKey = (slot: any) => {
  const date = new Date(slot.start_time);
  return `${date.getDay()}|${formatTime(slot.start_time)}|${formatTime(slot.end_time)}`;
};

const TutorDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tutor, setTutor] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCvModalOpen, setIsCvModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchTutorDetail = async () => {
      setLoading(true);
      try {
        const [profileRes, slotData, reviewRes] = await Promise.all([
          publicClient.get(`/tutors/public/${id}/`),
          bookingsApi.getPublicTutorSlots(id!),
          publicClient.get(`/tutors/public/${id}/reviews/`),
        ]);
        if (!mounted) return;
        setTutor(profileRes.data);
        setSlots(slotData);
        setReviews(reviewRes.data);
      } catch {
        if (mounted) {
          setTutor(null);
          showToast('Không tải được thông tin gia sư.', 'error');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (id) fetchTutorDetail();
    return () => {
      mounted = false;
    };
  }, [id, showToast]);

  const groupedSchedules = useMemo(() => {
    const options = new Map<string, { key: string; day: number; startTime: string; endTime: string }>();
    slots.forEach(slot => {
      const key = scheduleKey(slot);
      if (!options.has(key)) {
        const date = new Date(slot.start_time);
        options.set(key, {
          key,
          day: date.getDay(),
          startTime: formatTime(slot.start_time),
          endTime: formatTime(slot.end_time),
        });
      }
    });
    return weekdays
      .map(day => ({
        ...day,
        ranges: Array.from(options.values())
          .filter(item => item.day === day.value)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
      .filter(day => day.ranges.length > 0);
  }, [slots]);

  const minHourlyRate = useMemo(() => {
    const rates = (tutor?.tutor_subjects || [])
      .map((item: any) => Number(item.hourly_rate || 0))
      .filter((rate: number) => rate > 0);
    return rates.length > 0 ? Math.min(...rates) : 0;
  }, [tutor]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#5a5ce6]" />
      </div>
    );
  }

  if (!tutor) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Không tìm thấy gia sư</h2>
        <button onClick={() => navigate('/find-tutors')} className="font-bold text-[#5a5ce6] hover:underline">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const profileName = tutor.full_name || tutor.username || 'Gia sư';
  const avatarUrl =
    tutor.avatar_url ||
    tutor.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(profileName)}&background=eef2ff&color=4f46e5`;
  const cvPreviewUrl = tutor.cv_preview_url || tutor.cv_url || '';
  const cvDownloadUrl = tutor.cv_preview_url
    ? `${tutor.cv_preview_url}?download=1`
    : tutor.cv_url || '';
  const isImageCv = /\.(png|jpe?g|webp|gif)$/i.test(tutor.cv_filename || tutor.cv_url || '');
  const isPdfCv = /\.pdf$/i.test(tutor.cv_filename || tutor.cv_url || '');

  return (
    <div className="flex-1 bg-[#f8faff] py-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-5">
        {/* Compact Hero Header */}
        <section className="relative overflow-hidden rounded-2xl border border-indigo-100/80 bg-white p-5 sm:p-6 shadow-sm">
          <div className="absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r from-indigo-500 to-sky-500" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative shrink-0">
                <div className="h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-2xl border-2 border-indigo-50 shadow-md">
                  <img src={avatarUrl} alt={profileName} className="h-full w-full object-cover" />
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e1b4b]">{profileName}</h1>
                  {Number(tutor.rating_avg || 0) >= 4.8 && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#5a5ce6]">
                      Gia sư nổi bật
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm sm:text-base font-bold text-[#5a5ce6]">
                  {tutor.title || 'Gia sư TutorMatch'}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1 font-bold text-gray-900">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {Number(tutor.rating_avg || 0).toFixed(1)}
                    <span className="font-medium text-gray-400">({tutor.total_reviews || 0} đánh giá)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    {tutor.teaching_region || tutor.location || 'Toàn quốc'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Award className="h-3.5 w-3.5 text-gray-400" />
                    {tutor.experience_years || 0} năm kinh nghiệm
                  </span>
                  {tutor.teaching_mode && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                      {formatTeachingMode(tutor.teaching_mode)}
                    </span>
                  )}
                </div>

                {tutor.teaching_levels?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {tutor.teaching_levels.map((level: string) => (
                      <span key={level} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-[#5a5ce6]">
                        {level}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0 border-t lg:border-t-0 lg:border-l border-gray-100 pt-4 lg:pt-0 lg:pl-6">
              {minHourlyRate > 0 && (
                <div className="text-left lg:text-right">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Học phí từ</p>
                  <p className="text-xl font-black text-[#5a5ce6]">
                    {money(minHourlyRate)}đ<span className="text-xs font-semibold text-gray-400">/giờ</span>
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {cvPreviewUrl && (
                  <button
                    type="button"
                    onClick={() => setIsCvModalOpen(true)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-sm font-bold text-[#5a5ce6] hover:bg-indigo-100 transition"
                  >
                    <FileText className="h-4 w-4" />
                    Xem CV
                  </button>
                )}
                <button
                  onClick={() => navigate(`/tutor/${id}/book`)}
                  className="rounded-xl bg-[#5a5ce6] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-100 transition hover:bg-[#4b4de0]"
                >
                  Đặt lịch ngay
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column Main Content */}
        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* Left Column: About, Credentials, Reviews */}
          <div className="lg:col-span-7 space-y-5">
            <section className="rounded-2xl border border-indigo-50 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2.5 text-base font-extrabold text-[#1e1b4b]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-[#5a5ce6]">
                  <UserRound className="h-4 w-4" />
                </span>
                Về gia sư
              </h2>
              <p className="text-sm leading-6 text-gray-600">
                {tutor.bio || 'Gia sư chưa cập nhật mô tả bản thân.'}
              </p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {tutor.university && <InfoLine label="Trường" value={tutor.university} />}
                {tutor.qualification && <InfoLine label="Trình độ" value={tutor.qualification} />}
                {tutor.teaching_mode && (
                  <InfoLine label="Hình thức dạy" value={formatTeachingMode(tutor.teaching_mode)} />
                )}
                {tutor.subjects_text && <InfoLine label="Môn đăng ký" value={tutor.subjects_text} />}
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-50 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2.5 text-base font-extrabold text-[#1e1b4b]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <GraduationCap className="h-4 w-4" />
                </span>
                Học vấn & Chứng chỉ
              </h2>
              {tutor.educations?.length || tutor.certifications?.length || tutor.achievements?.length ? (
                <div className="space-y-3.5">
                  {tutor.educations?.map((edu: any) => (
                    <TimelineItem
                      key={`edu-${edu.id}`}
                      title={edu.degree}
                      subtitle={`${edu.school || ''}${edu.years ? ` · ${edu.years}` : ''}`}
                    />
                  ))}
                  {tutor.certifications?.map((cert: any) => (
                    <TimelineItem
                      key={`cert-${cert.id}`}
                      title={cert.title}
                      subtitle={`${cert.organization || ''}${cert.year ? ` · Cấp năm ${cert.year}` : ''}`}
                    />
                  ))}
                  {tutor.achievements?.length > 0 && (
                    <div className="grid gap-3 pt-1 sm:grid-cols-3">
                      {tutor.achievements.map((item: any) => (
                        <a
                          key={item.id}
                          href={item.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-xl border border-gray-100 bg-gray-50 hover:border-indigo-200 transition"
                        >
                          <img src={item.image_url} alt={item.description || 'Thành tích'} className="h-28 w-full object-cover" />
                          <p className="p-2 text-xs font-bold text-gray-700 truncate">
                            {item.description || 'Thành tích nổi bật'}
                          </p>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState text="Gia sư chưa cập nhật học vấn hoặc chứng chỉ." />
              )}
            </section>

            <section className="rounded-2xl border border-indigo-50 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2.5 text-base font-extrabold text-[#1e1b4b]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
                  <Star className="h-4 w-4" />
                </span>
                Đánh giá từ học viên ({reviews.length})
              </h2>
              {reviews.length === 0 ? (
                <EmptyState text="Chưa có đánh giá từ học viên." />
              ) : (
                <div className="divide-y divide-gray-100">
                  {reviews.map((review) => (
                    <div key={review.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">{review.student_name}</h4>
                          <p className="text-xs text-gray-400">
                            {review.subject_name || 'Khóa học đã hoàn thành'} ·{' '}
                            {new Date(review.created_at).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          {[1, 2, 3, 4, 5].map(i => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${
                                i <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-gray-600">{review.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sticky Column: Subjects, CV, Schedule */}
          <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
            <section className="rounded-2xl border border-indigo-50 bg-white p-5 shadow-sm">
              <h2 className="mb-3.5 flex items-center gap-2.5 text-base font-extrabold text-[#1e1b4b]">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <BookOpen className="h-4 w-4" />
                </span>
                Môn học & Học phí
              </h2>
              {tutor.tutor_subjects?.length ? (
                <div className="space-y-2.5">
                  {tutor.tutor_subjects.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-3"
                    >
                      <div>
                        <p className="text-sm font-extrabold text-gray-900">{item.subject_name}</p>
                        <p className="text-xs font-medium text-gray-500">{item.level || 'Mọi cấp độ'}</p>
                      </div>
                      <p className="text-sm font-extrabold text-[#5a5ce6] shrink-0">
                        {money(item.hourly_rate)}đ/giờ
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="Gia sư chưa cập nhật môn học." />
              )}
            </section>

            <section className="rounded-2xl border border-indigo-50 bg-white p-5 shadow-sm">
              <div className="mb-3.5 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2.5 text-base font-extrabold text-[#1e1b4b]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  Lịch rảnh có thể đặt
                </h2>
                {groupedSchedules.length > 0 && (
                  <button
                    onClick={() => navigate(`/tutor/${id}/book`)}
                    className="text-xs font-bold text-[#5a5ce6] hover:underline"
                  >
                    Chọn lịch →
                  </button>
                )}
              </div>
              {groupedSchedules.length === 0 ? (
                <EmptyState text="Gia sư hiện chưa mở khung giờ trống." />
              ) : (
                <div className="space-y-2.5">
                  {groupedSchedules.map(day => (
                    <div key={day.value} className="rounded-xl border border-gray-100 bg-gray-50/80 p-3">
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-gray-700">
                        {day.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {day.ranges.map(range => (
                          <button
                            key={range.key}
                            onClick={() => navigate(`/tutor/${id}/book`)}
                            className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-gray-700 ring-1 ring-gray-200 hover:text-[#5a5ce6] hover:ring-indigo-300 transition"
                          >
                            {range.startTime} - {range.endTime}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* CV Preview Modal */}
      {isCvModalOpen && cvPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <div className="min-w-0">
                <h3 className="truncate text-base font-extrabold text-gray-900">
                  CV của {profileName}
                </h3>
                <p className="truncate text-xs text-gray-400">{tutor.cv_filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={cvDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5ce6] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#4b4de0]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải CV
                </a>
                <button
                  type="button"
                  onClick={() => setIsCvModalOpen(false)}
                  className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 overflow-auto">
              {isImageCv ? (
                <div className="flex min-h-full items-center justify-center p-4">
                  <img src={cvPreviewUrl} alt={tutor.cv_filename || 'CV'} className="max-h-full max-w-full rounded-lg shadow" />
                </div>
              ) : isPdfCv ? (
                <iframe
                  src={cvPreviewUrl}
                  title={`CV ${profileName}`}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText className="h-10 w-10 text-indigo-400" />
                  <p className="text-sm font-bold text-gray-700">
                    Định dạng tài liệu không hỗ trợ xem trực tiếp trên trình duyệt.
                  </p>
                  <a
                    href={cvDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#5a5ce6] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#4b4de0]"
                  >
                    <Download className="h-4 w-4" />
                    Mở / Tải CV
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3.5 py-2.5">
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm font-bold text-gray-800">{value}</p>
  </div>
);

const TimelineItem = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex items-start gap-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-[#5a5ce6]">
      <GraduationCap className="h-4 w-4" />
    </div>
    <div>
      <h4 className="text-sm font-bold text-gray-900">{title}</h4>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-xs font-medium text-gray-400">
    {text}
  </div>
);

export default TutorDetail;
