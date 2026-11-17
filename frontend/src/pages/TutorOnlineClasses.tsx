import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Plus,
  Upload,
  UserMinus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { onlineClassesApi } from '../api/onlineClasses';
import { tutorService } from '../services/tutorService';
import { useToast } from '../components/ui/Toast';

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const BILLING_LABELS: Record<string, string> = {
  per_session: 'Theo buổi',
  full_course: 'Toàn khóa',
};

const defaultClassForm = {
  title: '',
  subject: '',
  level: 'THPT',
  description: '',
  schedule_text: 'Thứ 2, 4 - 19:30',
  meeting_link: 'https://meet.google.com/',
  start_date: new Date().toISOString().slice(0, 10),
  total_sessions: 12,
  session_duration_minutes: 90,
  max_students: 15,
  price_per_session: 80000,
  full_course_price: 900000,
  allowed_billing_cycles: ['per_session', 'full_course'] as string[],
  payment_grace_days: 3,
};

const TutorOnlineClasses: React.FC = () => {
  const { showToast } = useToast();
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [activeClass, setActiveClass] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [classForm, setClassForm] = useState({ ...defaultClassForm });
  const [sessionForm, setSessionForm] = useState({
    session_number: 1,
    title: '',
    scheduled_at: '',
    duration_minutes: 90,
    material_url: '',
  });
  const [kickTarget, setKickTarget] = useState<any>(null);
  const [kickForm, setKickForm] = useState({
    kick_reason: '',
    kick_evidence_note: '',
    attended_sessions: '',
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const loadClasses = async (selectId?: number) => {
    const list = await onlineClassesApi.getTutorClasses().catch(() => []);
    setClasses(list);
    const targetId = selectId || activeClass?.id || list[0]?.id;
    if (targetId) {
      const detail = await onlineClassesApi.getTutorClassDetail(targetId).catch(() => null);
      setActiveClass(detail);
      if (detail) {
        setSessionForm(prev => ({
          ...prev,
          session_number: (detail.sessions?.length || 0) + 1,
        }));
      }
    } else {
      setActiveClass(null);
    }
  };

  useEffect(() => {
    loadClasses();
    tutorService.getSubjects().then(setSubjects).catch(() => setSubjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
      const created = await onlineClassesApi.createTutorClass({
        ...classForm,
        subject: classForm.subject || null,
      });
      showToast('Đã tạo lớp dạy online!', 'success');
      setIsCreateOpen(false);
      setClassForm({ ...defaultClassForm });
      await loadClasses(created.id);
    } catch (error: any) {
      const errObj = error.response?.data;
      const msg =
        errObj?.error ||
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
      await onlineClassesApi.createSession(activeClass.id, sessionForm);
      showToast('Đã thêm buổi học.', 'success');
      setSessionForm({
        session_number: (activeClass.sessions?.length || 0) + 2,
        title: '',
        scheduled_at: '',
        duration_minutes: activeClass.session_duration_minutes || 90,
        material_url: '',
      });
      await loadClasses(activeClass.id);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể thêm buổi học.', 'error');
    }
  };

  const handleCompleteSession = async (sessionId: number) => {
    try {
      await onlineClassesApi.updateSession(sessionId, { status: 'completed' });
      showToast('Đã đánh dấu hoàn thành buổi học.', 'success');
      await loadClasses(activeClass?.id);
    } catch {
      showToast('Cập nhật buổi học thất bại.', 'error');
    }
  };

  const openKickModal = (enrollment: any) => {
    setKickTarget(enrollment);
    setKickForm({
      kick_reason: '',
      kick_evidence_note: '',
      attended_sessions: String(enrollment.computed_attended_sessions ?? 0),
    });
    setEvidenceFile(null);
  };

  const submitKick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kickTarget) return;
    const fd = new FormData();
    fd.append('kick_reason', kickForm.kick_reason);
    if (kickForm.kick_evidence_note) fd.append('kick_evidence_note', kickForm.kick_evidence_note);
    if (kickForm.attended_sessions !== '') fd.append('attended_sessions', kickForm.attended_sessions);
    if (evidenceFile) fd.append('kick_evidence_file', evidenceFile);

    try {
      const updated = await onlineClassesApi.kickStudent(kickTarget.id, fd);
      showToast(
        `Đã mời học viên rời lớp. Tiền hoàn tính toán: ${money(updated.refund_amount)}đ.`,
        'success',
      );
      setKickTarget(null);
      await loadClasses(activeClass?.id);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể mời học viên rời lớp.', 'error');
    }
  };

  const previewRefund = () => {
    if (!kickTarget) return { attended: 0, remaining: 0, refund: 0 };
    const paidSessions = Number(kickTarget.sessions_paid_total || 0);
    const totalPaid = Number(kickTarget.total_paid_amount || 0);
    const attended = Math.max(
      0,
      Math.min(paidSessions, Number(kickForm.attended_sessions || 0)),
    );
    const remaining = Math.max(0, paidSessions - attended);
    const refund = paidSessions > 0 ? Math.round((totalPaid * remaining) / paidSessions) : 0;
    return { attended, remaining, refund };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Lớp dạy online (nhiều học viên)</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tạo lớp nhóm công khai, giới hạn sĩ số, thu học phí PayOS theo buổi hoặc toàn khóa và quản lý học viên.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Tạo lớp online mới
        </button>
      </div>

      {isCreateOpen && (
        <form onSubmit={handleCreateClass} className="rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-lg font-extrabold text-slate-900">Tạo lớp dạy online mới</h2>
            <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Tên lớp học</span>
              <input
                required
                value={classForm.title}
                onChange={e => setClassForm({ ...classForm, title: e.target.value })}
                placeholder="VD: Luyện thi Toán 12 nâng cao"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Môn học</span>
              <select
                value={classForm.subject}
                onChange={e => setClassForm({ ...classForm, subject: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Chọn môn</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Lịch học hàng tuần</span>
              <input
                required
                value={classForm.schedule_text}
                onChange={e => setClassForm({ ...classForm, schedule_text: e.target.value })}
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
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Ngày khai giảng</span>
              <input
                type="date"
                required
                value={classForm.start_date}
                onChange={e => setClassForm({ ...classForm, start_date: e.target.value })}
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
            <p className="text-xs font-extrabold uppercase text-slate-500">Hình thức & Mức học phí (PayOS)</p>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { key: 'per_session', label: 'Theo buổi', field: 'price_per_session' },
                { key: 'full_course', label: 'Toàn khóa', field: 'full_course_price' },
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
                    <input
                      type="number"
                      min={0}
                      disabled={!enabled}
                      value={(classForm as any)[opt.field]}
                      onChange={e => setClassForm({ ...classForm, [opt.field]: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold disabled:bg-slate-100"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600">
              Hủy
            </button>
            <button type="submit" className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
              Đăng lớp lên nền tảng
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-3xl border border-slate-100 bg-white overflow-hidden">
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
                  className={`w-full p-4 text-left hover:bg-slate-50 ${
                    activeClass?.id === cls.id ? 'bg-emerald-50/60' : ''
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
            Chọn hoặc tạo một lớp dạy online để quản lý học viên và buổi học.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{activeClass.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {activeClass.schedule_text} · Sĩ số: {activeClass.active_students_count}/{activeClass.max_students} · Gia hạn: {activeClass.payment_grace_days} ngày
                </p>
              </div>
              {activeClass.meeting_link && (
                <a
                  href={activeClass.meeting_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700"
                >
                  <Video className="h-4 w-4" />
                  Link lớp học
                </a>
              )}
            </div>

            {/* Add session */}
            <form onSubmit={handleAddSession} className="rounded-3xl border border-slate-100 bg-white p-5 space-y-3">
              <p className="text-xs font-extrabold uppercase text-slate-500 flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-emerald-600" />
                Thêm buổi học ({activeClass.sessions?.length || 0})
              </p>
              <div className="grid gap-3 md:grid-cols-4">
                <input
                  type="number"
                  min={1}
                  required
                  value={sessionForm.session_number}
                  onChange={e => setSessionForm({ ...sessionForm, session_number: Number(e.target.value) })}
                  placeholder="Số buổi"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
                <input
                  required
                  value={sessionForm.title}
                  onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                  placeholder="Tên buổi học"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm md:col-span-2"
                />
                <input
                  type="datetime-local"
                  required
                  value={sessionForm.scheduled_at}
                  onChange={e => setSessionForm({ ...sessionForm, scheduled_at: e.target.value })}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div className="flex justify-end">
                <button className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  Thêm buổi
                </button>
              </div>

              {activeClass.sessions?.length > 0 && (
                <div className="divide-y divide-slate-100 pt-2">
                  {activeClass.sessions.map((s: any) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <span className="font-bold text-slate-900">Buổi {s.session_number}: {s.title}</span>
                        <span className="ml-2 text-xs text-slate-400">{new Date(s.scheduled_at).toLocaleString('vi-VN')}</span>
                      </div>
                      {s.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => handleCompleteSession(s.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Đã dạy
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-emerald-600">Đã hoàn thành</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </form>

            {/* Enrolled Students */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-4">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                Học viên trong lớp ({activeClass.enrollments?.length || 0})
              </h3>
              {!activeClass.enrollments?.length ? (
                <p className="text-sm text-slate-400">Chưa có học viên đăng ký.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeClass.enrollments.map((enr: any) => (
                    <div key={enr.id} className="py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">
                          {enr.student_name} <span className="text-xs font-semibold text-slate-400">({enr.student_email})</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Gói: {BILLING_LABELS[enr.billing_cycle] || enr.billing_cycle} · Đã đóng: {money(enr.total_paid_amount)}đ ({enr.sessions_paid_total} buổi) · Đã học: {enr.computed_attended_sessions} buổi
                          {enr.next_payment_due_date && ` · Hạn tiếp: ${new Date(enr.next_payment_due_date).toLocaleDateString('vi-VN')}`}
                        </p>
                        {enr.status.startsWith('kicked') && (
                          <p className="mt-1 text-xs font-bold text-rose-600">
                            Đã rời lớp ({enr.kick_type}): {enr.kick_reason} · Hoàn tiền: {money(enr.refund_amount)}đ ({enr.refund_status})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {enr.status}
                        </span>
                        {enr.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => openKickModal(enr)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            Mời rời lớp
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Kick Modal */}
      {kickTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={submitKick} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-extrabold text-slate-900">
                Mời học viên rời lớp: {kickTarget.student_name}
              </h3>
              <button type="button" onClick={() => setKickTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Lý do bắt buộc</span>
              <textarea
                required
                rows={3}
                value={kickForm.kick_reason}
                onChange={e => setKickForm({ ...kickForm, kick_reason: e.target.value })}
                placeholder="VD: Nghỉ không phép nhiều buổi liên tiếp / gây mất trật tự lớp..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none resize-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Minh chứng (mô tả hoặc file/ảnh đính kèm)</span>
              <input
                value={kickForm.kick_evidence_note}
                onChange={e => setKickForm({ ...kickForm, kick_evidence_note: e.target.value })}
                placeholder="Mô tả bằng chứng hoặc đường dẫn..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 cursor-pointer">
              <Upload className="h-4 w-4" />
              {evidenceFile ? evidenceFile.name : 'Đính kèm ảnh / file minh chứng'}
              <input
                type="file"
                className="hidden"
                onChange={e => setEvidenceFile(e.target.files?.[0] || null)}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">
                Số buổi học viên đã học (tối đa {kickTarget.sessions_paid_total} buổi đã đóng)
              </span>
              <input
                type="number"
                min={0}
                max={kickTarget.sessions_paid_total}
                value={kickForm.attended_sessions}
                onChange={e => setKickForm({ ...kickForm, attended_sessions: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-bold outline-none"
              />
            </label>

            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3.5 text-xs text-amber-900 space-y-1">
              <p className="font-extrabold">Dự kiến hoàn tiền theo số buổi chưa học:</p>
              <p>
                Số buổi chưa học: <strong>{previewRefund().remaining}</strong> / {kickTarget.sessions_paid_total} buổi · Số tiền hoàn lại: <strong>{money(previewRefund().refund)}đ</strong>
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setKickTarget(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600">
                Hủy
              </button>
              <button type="submit" className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700">
                Xác nhận mời rời lớp
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TutorOnlineClasses;
