import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Search,
  Upload,
  UserMinus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { onlineClassesApi } from '../api/onlineClasses';
import { Pagination, useClientPagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';

const money = (value: string | number | undefined) =>
  Math.round(Number(value || 0)).toLocaleString('vi-VN');

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
  kicked_by_tutor: 'Mời rời lớp',
  kicked_unpaid: 'Quá hạn học phí (rời lớp)',
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

const TutorOnlineClassStudents: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [classes, setClasses] = useState<any[]>([]);
  const [classDetail, setClassDetail] = useState<any>(null);
  const [studentsData, setStudentsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Kick modal state
  const [kickTarget, setKickTarget] = useState<any>(null);
  const [kickForm, setKickForm] = useState({
    kick_reason: '',
    kick_evidence_note: '',
    attended_sessions: '',
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const loadPageData = async (classIdParam?: string) => {
    const targetId = classIdParam || id;
    if (!targetId) return;
    setLoading(true);
    try {
      const [allClasses, detail, sp] = await Promise.all([
        onlineClassesApi.getTutorClasses().catch(() => []),
        onlineClassesApi.getTutorClassDetail(targetId).catch(() => null),
        onlineClassesApi.getTutorClassStudentsPayments(targetId),
      ]);
      setClasses(Array.isArray(allClasses) ? allClasses : []);
      setClassDetail(detail);
      setStudentsData(sp);
    } catch {
      showToast('Không thể tải danh sách học viên và nhật ký học phí.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPageData(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openKickModal = (row: any) => {
    setKickTarget(row);
    setKickForm({
      kick_reason: '',
      kick_evidence_note: '',
      attended_sessions: String(row.sessions_attended ?? row.computed_attended_sessions ?? 0),
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
      const updated = await onlineClassesApi.kickStudent(kickTarget.enrollment_id || kickTarget.id, fd);
      showToast(
        `Đã mời học viên rời lớp. Tiền hoàn tính toán: ${money(updated.refund_amount)}đ.`,
        'success',
      );
      setKickTarget(null);
      await loadPageData(id);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể mời học viên rời lớp.', 'error');
    }
  };

  const previewRefund = () => {
    if (!kickTarget) return { attended: 0, remaining: 0, refund: 0 };
    const paidSessions = Number(kickTarget.sessions_paid_total || 0);
    const totalPaid = Number(kickTarget.total_paid_amount || 0);
    const attended = Math.max(0, Math.min(paidSessions, Number(kickForm.attended_sessions || 0)));
    const remaining = Math.max(0, paidSessions - attended);
    const refund = paidSessions > 0 ? Math.round((totalPaid * remaining) / paidSessions) : 0;
    return { attended, remaining, refund };
  };

  const allStudents: any[] = studentsData?.students || [];
  const filteredStudents = allStudents.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.student_name || '').toLowerCase().includes(q) ||
      (s.student_email || '').toLowerCase().includes(q)
    );
  });
  const hasLeftReason = filteredStudents.some(
    (r) => r.status?.startsWith('kicked') || Boolean(r.kick_reason),
  );
  useEffect(() => {
    setPage(1);
  }, [search, id]);
  const pagedStudents = useClientPagination(filteredStudents, page, 10);
  const activeCount = allStudents.filter((s) => s.status === 'active').length;
  const leftCount = allStudents.filter((s) => s.status?.startsWith('kicked')).length;
  const totalCollected = allStudents.reduce(
    (sum, s) => sum + Number(s.total_paid_amount || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/tutor/online-classes?classId=${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 hover:underline mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại quản lý buổi học
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900">
            Danh sách học viên & Nhật ký đóng học phí
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi chi tiết học viên, số buổi đã học, lịch sử thanh toán theo ngày và quản lý rời lớp.
          </p>
        </div>

        {/* 2 Tabs Switcher */}
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm shrink-0">
          <Link
            to={`/tutor/online-classes?classId=${id}`}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
          >
            <CalendarDays className="h-4 w-4" />
            Lớp học
          </Link>
          <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm">
            <Users className="h-4 w-4" />
            Danh sách học viên ({allStudents.length})
          </span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        {/* Class Switcher Sidebar */}
        <aside className="rounded-3xl border border-slate-100 bg-white overflow-hidden h-fit">
          <div className="border-b border-slate-100 p-4 font-extrabold text-slate-900">
            Danh sách lớp ({classes.length})
          </div>
          <div className="divide-y divide-slate-100">
            {classes.map((cls) => (
              <button
                key={cls.id}
                type="button"
                onClick={() => navigate(`/tutor/online-classes/${cls.id}/students`)}
                className={`w-full p-4 text-left hover:bg-slate-50 transition ${
                  String(cls.id) === String(id) ? 'bg-emerald-50/70' : ''
                }`}
              >
                <p className="text-sm font-extrabold text-slate-900">{cls.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {cls.active_students_count}/{cls.max_students} học viên · Gia hạn {cls.payment_grace_days} ngày
                </p>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <div className="space-y-5 min-w-0">
          {/* Class Header Card */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                {classDetail?.title || studentsData?.class_title || 'Lớp học online'}
              </h2>
              {classDetail && (
                <p className="mt-1 text-sm text-slate-500">
                  {classDetail.subject_name ? `${classDetail.subject_name} · ` : ''}
                  {classDetail.schedule_text} · Sĩ số: {classDetail.active_students_count}/{classDetail.max_students}
                </p>
              )}
            </div>
            {classDetail?.meeting_link && (
              <a
                href={classDetail.meeting_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 shrink-0"
              >
                <Video className="h-4 w-4" />
                Link lớp học
              </a>
            )}
          </div>

          {/* KPI Strip */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[11px] font-extrabold uppercase text-slate-400">Tổng học viên</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{allStudents.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[11px] font-extrabold uppercase text-slate-400">Đang học</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-600">{activeCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[11px] font-extrabold uppercase text-slate-400">Đã rời lớp</p>
              <p className="mt-1 text-2xl font-extrabold text-rose-600">{leftCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[11px] font-extrabold uppercase text-slate-400">Tổng học phí đã thu</p>
              <p className="mt-1 text-2xl font-extrabold text-indigo-600">{money(totalCollected)}đ</p>
            </div>
          </div>

          {/* Table Card */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Bảng học viên theo tên & nhật ký học phí ({filteredStudents.length})
                </h3>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc email..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm font-semibold text-slate-400">
                Đang tải danh sách học viên...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
                Không có học viên nào phù hợp.
              </div>
            ) : (
              <>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Tên học viên</th>
                      <th className="px-4 py-3.5">Email</th>
                      <th className="px-4 py-3.5 text-center">Số buổi đã học</th>
                      <th className="px-4 py-3.5">Các ngày đóng học phí kèm số tiền</th>
                      <th className="px-4 py-3.5 text-right">Tổng tiền đã đóng</th>
                      <th className="px-4 py-3.5">Trạng thái</th>
                      {hasLeftReason && <th className="px-4 py-3.5 min-w-[200px]">Lý do rời lớp</th>}
                      <th className="px-4 py-3.5 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedStudents.pagedItems.map((row) => {
                      const isKicked = row.status?.startsWith('kicked');
                      return (
                        <tr key={row.enrollment_id || row.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-4 py-3.5 font-extrabold text-slate-900 whitespace-nowrap">
                            {row.student_name}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600">{row.student_email}</td>
                          <td className="px-4 py-3.5 text-center font-bold text-slate-800 whitespace-nowrap">
                            {row.sessions_attended ?? row.computed_attended_sessions ?? 0} buổi
                          </td>
                          <td className="px-4 py-3.5">
                            {!row.payments?.length ? (
                              <span className="text-xs text-slate-400">Chưa ghi nhận</span>
                            ) : (
                              <div className="space-y-1.5">
                                {row.payments.map((p: any) => (
                                  <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                                      {formatDateOnly(p.paid_date)}
                                    </span>
                                    <span className="font-extrabold text-emerald-700">
                                      {money(p.amount)}đ
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                      ({BILLING_LABELS[p.billing_cycle] || p.billing_cycle})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-extrabold text-slate-900 whitespace-nowrap">
                            {money(row.total_paid_amount)}đ
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                row.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : isKicked
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {row.status === 'kicked_by_tutor'
                                ? 'Mời rời lớp'
                                : row.status_label || ENROLLMENT_STATUS_LABELS[row.status] || row.status}
                            </span>
                            {isKicked && Number(row.refund_amount || 0) > 0 && (
                              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                Hoàn {money(row.refund_amount)}đ ({REFUND_STATUS_LABELS[row.refund_status] || row.refund_status})
                              </p>
                            )}
                          </td>
                          {hasLeftReason && (
                            <td className="px-4 py-3.5 text-xs text-rose-700 leading-relaxed">
                              {isKicked ? (
                                <span>{row.kick_reason || KICK_TYPE_LABELS[row.kick_type] || 'Đã mời rời lớp'}</span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            {row.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => openKickModal(row)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                                Mời rời lớp
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={pagedStudents.currentPage}
                totalCount={pagedStudents.totalCount}
                pageSize={pagedStudents.pageSize}
                totalPages={pagedStudents.totalPages}
                onPageChange={setPage}
              />
            </>
            )}
          </div>
        </div>
      </div>

      {/* Kick Modal */}
      {kickTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
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

export default TutorOnlineClassStudents;
