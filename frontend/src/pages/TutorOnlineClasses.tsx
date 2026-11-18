import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  MessageSquare,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { onlineClassesApi } from '../api/onlineClasses';
import { aiApi } from '../api/ai';
import { Pagination, useClientPagination } from '../components/ui/Pagination';
import { tutorService } from '../services/tutorService';
import { useToast } from '../components/ui/Toast';
import { formatNumberInput, parseMoneyInput } from '../utils/format';

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const formatSessionTitle = (s: any) => {
  const raw = (s?.title || '').trim();
  const num = s?.session_number ?? '';
  if (!raw) return `Buổi ${num}`;
  const cleaned = raw.replace(/^(?:Buổi\s*\d+\s*[:.\-–]\s*)+/i, '').trim();
  return `Buổi ${num}: ${cleaned || raw}`;
};

const formatDateOnly = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : '---';

const BILLING_LABELS: Record<string, string> = {
  per_session: 'Theo buổi',
  full_course: 'Toàn khóa',
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Chờ thanh toán',
  active: 'Đang học',
  completed: 'Hoàn thành',
  kicked_by_tutor: 'Đã mời rời lớp',
  kicked_unpaid: 'Bị xóa (quá hạn học phí)',
  cancelled: 'Đã hủy',
};

const KICK_TYPE_LABELS: Record<string, string> = {
  tutor_kick: 'Gia sư mời rời lớp',
  overdue_unpaid: 'Quá hạn học phí',
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  none: 'Không hoàn tiền',
  pending: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
  rejected: 'Từ chối hoàn',
};

const WEEKDAY_OPTIONS = [
  { value: 'Thứ 2', short: 'T2' },
  { value: 'Thứ 3', short: 'T3' },
  { value: 'Thứ 4', short: 'T4' },
  { value: 'Thứ 5', short: 'T5' },
  { value: 'Thứ 6', short: 'T6' },
  { value: 'Thứ 7', short: 'T7' },
  { value: 'Chủ nhật', short: 'CN' },
];

const MATERIAL_TYPES = [
  { value: 'note', label: 'Ghi chú / dặn dò', icon: FileText },
  { value: 'file', label: 'File tài liệu', icon: Upload },
  { value: 'image', label: 'Hình ảnh', icon: ImageIcon },
  { value: 'video', label: 'Video bài giảng', icon: Video },
  { value: 'link', label: 'Đường dẫn', icon: Link2 },
];

const buildDefaultClassForm = () => {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + 30);
  return {
    title: '',
    subject: '',
    level: 'THPT',
    description: '',
    weekdays: ['Thứ 2', 'Thứ 4'] as string[],
    start_time: '19:30',
    end_time: '21:00',
    meeting_link: 'https://meet.google.com/',
    start_date: today.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    total_sessions: 12,
    session_duration_minutes: 90,
    max_students: 15,
    price_per_session: 80000,
    full_course_price: 900000,
    allowed_billing_cycles: ['per_session', 'full_course'] as string[],
    payment_grace_days: 3,
  };
};

const TutorOnlineClasses: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialClassIdParam = Number(searchParams.get('classId') || 0) || undefined;
  const { showToast } = useToast();
  const [classes, setClasses] = useState<any[]>([]);
  const [registeredSubjects, setRegisteredSubjects] = useState<any[]>([]);
  const [activeClass, setActiveClass] = useState<any>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionsPage, setSessionsPage] = useState(1);

  // Separate modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [materialModalSession, setMaterialModalSession] = useState<any>(null);

  const [classForm, setClassForm] = useState(buildDefaultClassForm);
  const [sessionForm, setSessionForm] = useState({
    session_number: 1,
    title: '',
    scheduled_at: '',
    duration_minutes: 90,
  });

  // Session room note & material state
  const [sessionNote, setSessionNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [matType, setMatType] = useState('note');
  const [matTitle, setMatTitle] = useState('');
  const [matContent, setMatContent] = useState('');
  const [matUrl, setMatUrl] = useState('');
  const [matFile, setMatFile] = useState<File | null>(null);
  const [uploadingMat, setUploadingMat] = useState(false);

  // AI Lesson Assistant state
  const [aiLessonDraft, setAiLessonDraft] = useState<any>(null);
  const [generatingAiLesson, setGeneratingAiLesson] = useState(false);

  const loadClasses = async (selectId?: number, keepSessionId?: number | null) => {
    const list = await onlineClassesApi.getTutorClasses().catch(() => []);
    setClasses(list);
    const targetId = selectId || activeClass?.id || list[0]?.id;
    if (targetId) {
      const detail = await onlineClassesApi.getTutorClassDetail(targetId).catch(() => null);
      setActiveClass(detail);
      if (detail) {
        const sessions = detail.sessions || [];
        setSessionForm(prev => ({
          ...prev,
          session_number: sessions.length + 1,
          duration_minutes: detail.session_duration_minutes || 90,
        }));
        const targetSess =
          sessions.find((s: any) => s.id === (keepSessionId ?? selectedSessionId)) ||
          sessions[0] ||
          null;
        setSelectedSessionId(targetSess ? targetSess.id : null);
        setSessionNote(targetSess?.notes || '');
      }
    } else {
      setActiveClass(null);
      setSelectedSessionId(null);
      setSessionNote('');
    }
  };

  useEffect(() => {
    loadClasses(initialClassIdParam);
    tutorService
      .getProfile()
      .then((profile: any) => {
        const activeSubjs = (profile?.tutor_subjects || []).filter(
          (item: any) => item.is_active !== false && item.subject,
        );
        setRegisteredSubjects(activeSubjs);
        if (activeSubjs.length > 0) {
          setClassForm(prev => ({
            ...prev,
            subject: prev.subject || String(activeSubjs[0].subject),
          }));
        }
      })
      .catch(() => setRegisteredSubjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSession =
    (activeClass?.sessions || []).find((s: any) => s.id === selectedSessionId) || null;
  const pagedSessions = useClientPagination(activeClass?.sessions || [], sessionsPage, 10);

  useEffect(() => {
    setSessionsPage(1);
  }, [activeClass?.id]);

  const handleSelectSession = (session: any) => {
    setSelectedSessionId(session.id);
    setSessionNote(session.notes || '');
  };

  const toggleWeekday = (day: string) => {
    setClassForm(prev => {
      const exists = prev.weekdays.includes(day);
      const next = exists ? prev.weekdays.filter(d => d !== day) : [...prev.weekdays, day];
      const ordered = WEEKDAY_OPTIONS.map(o => o.value).filter(v => next.includes(v));
      return { ...prev, weekdays: ordered };
    });
  };

  const toggleCycle = (cycle: string) => {
    setClassForm(prev => {
      const exists = prev.allowed_billing_cycles.includes(cycle);
      const next = exists
        ? prev.allowed_billing_cycles.filter(c => c !== cycle)
        : [...prev.allowed_billing_cycles, cycle];
      return { ...prev, allowed_billing_cycles: next };
    });
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.subject) {
      showToast('Vui lòng chọn môn học đã đăng ký trong hồ sơ của bạn.', 'error');
      return;
    }
    if (classForm.weekdays.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 ngày học trong tuần.', 'error');
      return;
    }
    if (!classForm.start_time || !classForm.end_time || classForm.end_time <= classForm.start_time) {
      showToast('Giờ kết thúc phải lớn hơn giờ bắt đầu.', 'error');
      return;
    }
    if (classForm.end_date && classForm.end_date < classForm.start_date) {
      showToast('Ngày kết thúc phải lớn hơn hoặc bằng ngày khai giảng.', 'error');
      return;
    }

    const schedule_text = `${classForm.weekdays.join(', ')} · ${classForm.start_time} - ${classForm.end_time}`;
    try {
      const created = await onlineClassesApi.createTutorClass({
        title: classForm.title.trim(),
        subject: Number(classForm.subject),
        level: classForm.level,
        description: classForm.description,
        schedule_text,
        meeting_link: classForm.meeting_link,
        start_date: classForm.start_date,
        end_date: classForm.end_date || null,
        total_sessions: classForm.total_sessions,
        session_duration_minutes: classForm.session_duration_minutes,
        max_students: classForm.max_students,
        price_per_session: classForm.price_per_session,
        full_course_price: classForm.full_course_price,
        allowed_billing_cycles: classForm.allowed_billing_cycles,
        payment_grace_days: classForm.payment_grace_days,
      });
      showToast('Đã tạo lớp dạy online!', 'success');
      setIsCreateOpen(false);
      setClassForm({
        ...buildDefaultClassForm(),
        subject: registeredSubjects[0] ? String(registeredSubjects[0].subject) : '',
      });
      await loadClasses(created.id);
    } catch (error: any) {
      const errObj = error.response?.data;
      const msg =
        errObj?.error ||
        errObj?.subject?.[0] ||
        errObj?.end_date?.[0] ||
        errObj?.allowed_billing_cycles?.[0] ||
        errObj?.price_per_session?.[0] ||
        errObj?.full_course_price?.[0] ||
        'Không thể tạo lớp online.';
      showToast(msg, 'error');
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClass) return;
    try {
      const createdSession = await onlineClassesApi.createSession(activeClass.id, sessionForm);
      showToast('Đã thêm buổi học mới.', 'success');
      setIsSessionModalOpen(false);
      setSessionForm({
        session_number: (activeClass.sessions?.length || 0) + 2,
        title: '',
        scheduled_at: '',
        duration_minutes: activeClass.session_duration_minutes || 90,
      });
      await loadClasses(activeClass.id, createdSession.id);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể thêm buổi học.', 'error');
    }
  };

  const handleCompleteSession = async (sessionId: number) => {
    try {
      await onlineClassesApi.updateSession(sessionId, { status: 'completed' });
      showToast('Đã đánh dấu hoàn thành buổi học.', 'success');
      await loadClasses(activeClass?.id, sessionId);
    } catch {
      showToast('Cập nhật buổi học thất bại.', 'error');
    }
  };

  const handleSaveSessionNote = async () => {
    if (!selectedSession) return;
    setSavingNote(true);
    try {
      const res = await onlineClassesApi.updateSession(selectedSession.id, { notes: sessionNote });
      const notified = res.notified_students || 0;
      showToast(
        notified > 0
          ? `Đã lưu lời nhắn và gửi email thông báo tới ${notified} học viên.`
          : 'Đã lưu lời nhắn buổi học.',
        'success',
      );
      await loadClasses(activeClass?.id, selectedSession.id);
    } catch {
      showToast('Không thể lưu lời nhắn buổi học.', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const openMaterialModal = (session: any) => {
    setMaterialModalSession(session);
    setMatType('note');
    setMatTitle('');
    setMatContent('');
    setMatUrl('');
    setMatFile(null);
  };

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialModalSession) return;
    setUploadingMat(true);
    try {
      const fd = new FormData();
      fd.append('material_type', matType);
      fd.append('title', matTitle);
      if (matContent) fd.append('content', matContent);
      if (matUrl) fd.append('external_url', matUrl);
      if (matFile) fd.append('file', matFile);

      const res = await onlineClassesApi.createSessionMaterial(materialModalSession.id, fd);
      const notified = res.notified_students || 0;
      showToast(
        notified > 0
          ? `Đã tải tài liệu và gửi email báo về cho ${notified} học viên.`
          : 'Đã lưu tài liệu buổi học.',
        'success',
      );
      setMaterialModalSession(null);
      await loadClasses(activeClass?.id, materialModalSession.id);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể tải lên tài liệu.', 'error');
    } finally {
      setUploadingMat(false);
    }
  };

  const handleDeleteMaterial = async (materialId: number) => {
    try {
      await onlineClassesApi.deleteSessionMaterial(materialId);
      showToast('Đã xóa tài liệu buổi học.', 'success');
      await loadClasses(activeClass?.id, selectedSessionId);
    } catch {
      showToast('Không thể xóa tài liệu.', 'error');
    }
  };

  const handleGenerateAiLesson = async () => {
    if (!selectedSession || !activeClass) return;
    setGeneratingAiLesson(true);
    try {
      const res = await aiApi.lessonAssistant({
        class_title: activeClass.title,
        subject: activeClass.subject_name || '',
        level: activeClass.level || '',
        session_number: selectedSession.session_number,
        session_title: selectedSession.title,
        duration_minutes: selectedSession.duration_minutes || 90,
      });
      setAiLessonDraft(res);
      if (res.student_note) {
        setSessionNote(res.student_note);
      }
      showToast('AI đã soạn xong lời nhắn & bài tập gợi ý!', 'success');
    } catch {
      showToast('Không thể kết nối AI Trợ giảng lúc này.', 'error');
    } finally {
      setGeneratingAiLesson(false);
    }
  };

  const handleSaveAiDraftAsMaterial = async () => {
    if (!selectedSession || !aiLessonDraft) return;
    const outlineText = (aiLessonDraft.lesson_outline || [])
      .map((line: string, i: number) => `${i + 1}. ${line}`)
      .join('\n');
    const qsText = (aiLessonDraft.practice_questions || [])
      .map((q: any, i: number) => `Bài ${i + 1}: ${q.question}\n   Gợi ý: ${q.hint}`)
      .join('\n\n');
    const combinedContent = `GIÁO ÁN TÓM TẮT:\n${outlineText}\n\nBÀI TẬP LUYỆN TẬP:\n${qsText}\n\nBÀI TẬP VỀ NHÀ:\n${aiLessonDraft.homework_prompt || ''}`;

    const fd = new FormData();
    fd.append('material_type', 'note');
    fd.append('title', `Phiếu học tập & Bài tập - ${formatSessionTitle(selectedSession)}`);
    fd.append('content', combinedContent);
    try {
      const res = await onlineClassesApi.createSessionMaterial(selectedSession.id, fd);
      showToast(
        res.notified_students > 0
          ? `Đã lưu tài liệu & gửi email tới ${res.notified_students} học viên.`
          : 'Đã lưu tài liệu gợi ý từ AI.',
        'success',
      );
      await loadClasses(activeClass?.id, selectedSession.id);
    } catch {
      showToast('Không thể lưu tài liệu gợi ý.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Lớp dạy online (nhiều học viên)</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tạo lớp nhóm công khai, giới hạn sĩ số, thu học phí PayOS theo buổi hoặc toàn khóa, upload tài liệu từng buổi và theo dõi lịch sử đóng học phí.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {activeClass && (
            <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm">
                <CalendarDays className="h-4 w-4" />
                Lớp học
              </span>
              <Link
                to={`/tutor/online-classes/${activeClass.id}/students`}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                <Users className="h-4 w-4" />
                Danh sách học viên ({activeClass.enrollments_count ?? activeClass.active_students_count ?? 0})
              </Link>
            </div>
          )}
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Tạo lớp online mới
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <aside className="rounded-3xl border border-slate-100 bg-white overflow-hidden h-fit">
          <div className="border-b border-slate-100 p-4 font-extrabold text-slate-900">
            Danh sách lớp ({classes.length})
          </div>
          <div className="divide-y divide-slate-100">
            {classes.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">Chưa có lớp nào.</p>
            ) : (
              classes.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => loadClasses(cls.id)}
                  className={`w-full p-4 text-left hover:bg-slate-50 transition ${
                    activeClass?.id === cls.id ? 'bg-emerald-50/70' : ''
                  }`}
                >
                  <p className="text-sm font-extrabold text-slate-900">{cls.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {cls.active_students_count}/{cls.max_students} học viên · Gia hạn {cls.payment_grace_days} ngày
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>

        {!activeClass ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-14 text-center text-sm text-slate-400">
            Chọn hoặc tạo một lớp dạy online để quản lý học viên, phòng tài liệu và buổi học.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Class Overview Header */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{activeClass.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {activeClass.subject_name ? `${activeClass.subject_name} · ` : ''}
                  {activeClass.schedule_text} · Sĩ số: {activeClass.active_students_count}/{activeClass.max_students} · Gia hạn: {activeClass.payment_grace_days} ngày
                </p>
                {(activeClass.start_date || activeClass.end_date) && (
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    Thời gian: {activeClass.start_date ? new Date(activeClass.start_date).toLocaleDateString('vi-VN') : '---'}
                    {activeClass.end_date ? ` → ${new Date(activeClass.end_date).toLocaleDateString('vi-VN')}` : ''}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  to={`/tutor/online-classes/${activeClass.id}/students`}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
                >
                  <Users className="h-4 w-4" />
                  Xem danh sách học viên ({activeClass.enrollments_count ?? activeClass.active_students_count ?? 0})
                </Link>
                {activeClass.meeting_link && (
                  <a
                    href={activeClass.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Video className="h-4 w-4" />
                    Link lớp học
                  </a>
                )}
              </div>
            </div>

            {/* Sessions List + Session Room */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-emerald-600" />
                    Danh sách buổi học & Phòng tài liệu ({activeClass.sessions?.length || 0})
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Bấm chọn một buổi học để nhắn nhủ hoặc tải tài liệu lên cho học viên (hệ thống tự động gửi email thông báo).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSessionModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Thêm buổi học
                </button>
              </div>

              {!activeClass.sessions?.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                  Chưa có buổi học nào. Bấm <strong>"+ Thêm buổi học"</strong> để tạo buổi đầu tiên.
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[300px_1fr] items-start">
                  {/* Session Selector Column */}
                  <div className="space-y-2">
                    {pagedSessions.pagedItems.map((s: any) => {
                      const active = selectedSession?.id === s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s)}
                          className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                            active
                              ? 'border-emerald-500 bg-emerald-50/70'
                              : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-extrabold text-slate-900">
                              {formatSessionTitle(s)}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateOnly(s.scheduled_at)}
                          </p>
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-500">
                              {s.materials?.length || 0} tài liệu
                            </span>
                            {s.status !== 'completed' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCompleteSession(s.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Đã dạy
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold text-emerald-600">Đã hoàn thành</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <Pagination
                      currentPage={pagedSessions.currentPage}
                      totalCount={pagedSessions.totalCount}
                      pageSize={pagedSessions.pageSize}
                      totalPages={pagedSessions.totalPages}
                      onPageChange={setSessionsPage}
                    />
                  </div>

                  {/* Selected Session Room Workspace */}
                  {selectedSession && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                        <div>
                          <h4 className="text-base font-extrabold text-slate-900">
                            Phòng {formatSessionTitle(selectedSession)}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {formatDateOnly(selectedSession.scheduled_at)} · {selectedSession.duration_minutes} phút
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openMaterialModal(selectedSession)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Thêm tài liệu
                        </button>
                      </div>

                      {/* Tutor message / notes */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-slate-500">
                            <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                            Lời nhắn / dặn dò học viên cho buổi học
                          </label>
                          <button
                            type="button"
                            disabled={generatingAiLesson}
                            onClick={handleGenerateAiLesson}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {generatingAiLesson ? 'AI đang soạn...' : 'AI Soạn lời nhắn & bài tập'}
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={sessionNote}
                          onChange={(e) => setSessionNote(e.target.value)}
                          placeholder="Nhập dặn dò chuẩn bị bài, link bài tập hoặc nhắc nhở học viên..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 resize-none"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={savingNote}
                            onClick={handleSaveSessionNote}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {savingNote ? 'Đang lưu...' : 'Lưu lời nhắn & gửi email'}
                          </button>
                        </div>

                        {aiLessonDraft && (
                          <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-extrabold text-indigo-800 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" />
                                Giáo án & Bài tập gợi ý từ AI Trợ giảng
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveAiDraftAsMaterial}
                                  className="rounded-lg bg-indigo-600 px-3 py-1.5 font-extrabold text-white hover:bg-indigo-700"
                                >
                                  Lưu thành tài liệu & gửi email
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAiLessonDraft(null)}
                                  className="rounded-lg bg-white px-2.5 py-1.5 font-bold text-slate-500 hover:bg-slate-100"
                                >
                                  Đóng
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1 text-slate-700">
                              <p className="font-bold text-slate-900">Khung buổi học:</p>
                              {(aiLessonDraft.lesson_outline || []).map((line: string, i: number) => (
                                <p key={i}>• {line}</p>
                              ))}
                            </div>
                            <div className="space-y-1 text-slate-700">
                              <p className="font-bold text-slate-900">Bài tập luyện tập:</p>
                              {(aiLessonDraft.practice_questions || []).map((q: any, i: number) => (
                                <p key={i}>
                                  <strong>{i + 1}.</strong> {q.question} <span className="text-indigo-700">({q.hint})</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Session Materials */}
                      <div className="space-y-2.5">
                        <p className="text-xs font-extrabold uppercase text-slate-500">
                          Tài liệu đã tải lên ({selectedSession.materials?.length || 0})
                        </p>
                        {!selectedSession.materials?.length ? (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs text-slate-400">
                            Chưa có tài liệu nào cho buổi này. Bấm <strong>"+ Thêm tài liệu"</strong> để tải lên và gửi email cho học viên.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedSession.materials.map((m: any) => {
                              const href = m.file_url || m.external_url;
                              return (
                                <div
                                  key={m.id}
                                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5"
                                >
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                                        {MATERIAL_TYPES.find(t => t.value === m.material_type)?.label || m.material_type}
                                      </span>
                                      <p className="truncate text-sm font-bold text-slate-900">{m.title}</p>
                                    </div>
                                    {m.content && (
                                      <p className="text-xs text-slate-600 whitespace-pre-wrap">{m.content}</p>
                                    )}
                                    <p className="text-[11px] text-slate-400">
                                      Ngày tạo: {formatDateOnly(m.created_at)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {href && (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                                        title="Mở tài liệu"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMaterial(m.id)}
                                      className="rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"
                                      title="Xóa tài liệu"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Online Class Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateClass}
            className="w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Tạo lớp dạy online mới</h2>
                <p className="text-xs text-slate-500">Chọn môn học đã đăng ký, lịch dạy cố định hàng tuần và học phí PayOS.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">Tên lớp học *</span>
                  <input
                    required
                    value={classForm.title}
                    onChange={e => setClassForm({ ...classForm, title: e.target.value })}
                    placeholder="VD: Luyện thi Toán 12 nâng cao"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">Môn học đã đăng ký *</span>
                  <select
                    required
                    value={classForm.subject}
                    onChange={e => setClassForm({ ...classForm, subject: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Chọn môn bạn đã đăng ký --</option>
                    {registeredSubjects.map((s: any) => (
                      <option key={s.subject} value={s.subject}>
                        {s.subject_name} ({s.level || 'Mọi cấp độ'})
                      </option>
                    ))}
                  </select>
                  {registeredSubjects.length === 0 && (
                    <p className="mt-1 text-xs font-semibold text-rose-600">
                      Bạn chưa có môn dạy đang bật. Vui lòng thêm môn ở{' '}
                      <Link to="/tutor/settings" className="underline">Hồ sơ gia sư</Link>.
                    </p>
                  )}
                </label>
              </div>

              {/* Weekly schedule: weekdays + start/end time */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <p className="text-xs font-extrabold uppercase text-slate-500">Lịch học hàng tuần *</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((day) => {
                    const checked = classForm.weekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWeekday(day.value)}
                        className={`rounded-xl px-3.5 py-2 text-xs font-bold transition border ${
                          checked
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                        }`}
                      >
                        {day.value}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-slate-500">Giờ bắt đầu *</span>
                    <input
                      type="time"
                      required
                      value={classForm.start_time}
                      onChange={e => setClassForm({ ...classForm, start_time: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-slate-500">Giờ kết thúc *</span>
                    <input
                      type="time"
                      required
                      value={classForm.end_time}
                      onChange={e => setClassForm({ ...classForm, end_time: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold outline-none focus:border-emerald-500"
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  Hiển thị lịch học:{' '}
                  <strong className="text-slate-800">
                    {classForm.weekdays.length > 0 ? classForm.weekdays.join(', ') : 'Chưa chọn thứ'} · {classForm.start_time} - {classForm.end_time}
                  </strong>
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">Ngày khai giảng *</span>
                  <input
                    type="date"
                    required
                    value={classForm.start_date}
                    onChange={e => setClassForm({ ...classForm, start_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">Ngày kết thúc *</span>
                  <input
                    type="date"
                    required
                    min={classForm.start_date}
                    value={classForm.end_date}
                    onChange={e => setClassForm({ ...classForm, end_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase text-slate-500">Link phòng học (Google Meet / Zoom)</span>
                  <input
                    value={classForm.meeting_link}
                    onChange={e => setClassForm({ ...classForm, meeting_link: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-slate-500">Sĩ số tối đa</span>
                    <input
                      type="number"
                      min={1}
                      value={classForm.max_students}
                      onChange={e => setClassForm({ ...classForm, max_students: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-slate-500">Tổng số buổi</span>
                    <input
                      type="number"
                      min={1}
                      value={classForm.total_sessions}
                      onChange={e => setClassForm({ ...classForm, total_sessions: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-slate-500">Gia hạn (ngày)</span>
                    <input
                      type="number"
                      min={0}
                      value={classForm.payment_grace_days}
                      onChange={e => setClassForm({ ...classForm, payment_grace_days: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                    />
                  </label>
                </div>

                <label className="block md:col-span-2">
                  <span className="text-xs font-bold uppercase text-slate-500">Mô tả lớp học</span>
                  <textarea
                    rows={2}
                    value={classForm.description}
                    onChange={e => setClassForm({ ...classForm, description: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none resize-none"
                  />
                </label>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-extrabold uppercase text-slate-500">Hình thức & Mức học phí PayOS (VNĐ)</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { key: 'per_session', label: 'Theo buổi', field: 'price_per_session' as const },
                    { key: 'full_course', label: 'Toàn khóa', field: 'full_course_price' as const },
                  ].map((opt) => {
                    const enabled = classForm.allowed_billing_cycles.includes(opt.key);
                    return (
                      <div key={opt.key} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleCycle(opt.key)}
                          />
                          {opt.label}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={!enabled}
                            value={formatNumberInput(classForm[opt.field])}
                            onChange={e => setClassForm({ ...classForm, [opt.field]: parseMoneyInput(e.target.value) })}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-10 text-sm font-bold disabled:bg-slate-100 outline-none focus:border-emerald-500"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">đ</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 shrink-0">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={registeredSubjects.length === 0}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Đăng lớp lên nền tảng
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Session Modal */}
      {isSessionModalOpen && activeClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={handleAddSession} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-extrabold text-slate-900">Thêm buổi học mới</h3>
              <button type="button" onClick={() => setIsSessionModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Buổi số *</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={sessionForm.session_number}
                  onChange={e => setSessionForm({ ...sessionForm, session_number: Number(e.target.value) })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Thời lượng (phút)</span>
                <input
                  type="number"
                  min={15}
                  required
                  value={sessionForm.duration_minutes}
                  onChange={e => setSessionForm({ ...sessionForm, duration_minutes: Number(e.target.value) })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Tên / chủ đề buổi học *</span>
              <input
                required
                value={sessionForm.title}
                onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                placeholder="VD: Chữa đề số 2 & Tổng kết"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Thời gian diễn ra *</span>
              <input
                type="datetime-local"
                required
                value={sessionForm.scheduled_at}
                onChange={e => setSessionForm({ ...sessionForm, scheduled_at: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsSessionModalOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600">
                Hủy
              </button>
              <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                Lưu buổi học
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upload Session Material Modal */}
      {materialModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={handleUploadMaterial} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Thêm tài liệu buổi học</h3>
                <p className="text-xs text-slate-500">Buổi {materialModalSession.session_number}: {materialModalSession.title}</p>
              </div>
              <button type="button" onClick={() => setMaterialModalSession(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {MATERIAL_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMatType(value);
                    setMatFile(null);
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    matType === value
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Tiêu đề tài liệu *</span>
              <input
                required
                value={matTitle}
                onChange={e => setMatTitle(e.target.value)}
                placeholder="VD: Slide bài giảng & Bài tập về nhà..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none"
              />
            </label>

            {matType === 'note' && (
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Nội dung dặn dò / ghi chú *</span>
                <textarea
                  required
                  rows={4}
                  value={matContent}
                  onChange={e => setMatContent(e.target.value)}
                  placeholder="Nhập nội dung chi tiết cho học viên..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none resize-none"
                />
              </label>
            )}

            {matType === 'link' && (
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Đường dẫn URL *</span>
                <input
                  type="url"
                  required
                  value={matUrl}
                  onChange={e => setMatUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none"
                />
              </label>
            )}

            {['file', 'image', 'video'].includes(matType) && (
              <label className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-xs font-bold text-slate-600 cursor-pointer hover:border-indigo-400">
                <Upload className="h-5 w-5 text-indigo-500" />
                <span>{matFile ? matFile.name : 'Chọn tệp để tải lên cho học viên'}</span>
                <input
                  type="file"
                  accept={matType === 'image' ? 'image/*' : matType === 'video' ? 'video/*' : undefined}
                  className="hidden"
                  onChange={e => setMatFile(e.target.files?.[0] || null)}
                />
              </label>
            )}

            <p className="rounded-xl bg-indigo-50 p-3 text-xs font-semibold text-indigo-700">
              Khi bấm tải lên, hệ thống sẽ tự động gửi email thông báo tới tất cả học viên đang theo học lớp này.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setMaterialModalSession(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600">
                Hủy
              </button>
              <button type="submit" disabled={uploadingMat} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                {uploadingMat ? 'Đang tải & gửi mail...' : 'Tải lên & báo học viên'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TutorOnlineClasses;
