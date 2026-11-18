import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, EyeOff, RefreshCw, ShieldAlert, Star, Users, Video, XCircle } from 'lucide-react';
import { onlineClassesApi } from '../../api/onlineClasses';
import { Pagination, useClientPagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';

const BILLING_LABELS: Record<string, string> = {
  per_session: 'Theo buổi',
  full_course: 'Toàn khóa',
};

const CLASS_STATUS_LABELS: Record<string, string> = {
  open: 'Đang mở đăng ký',
  ongoing: 'Đang diễn ra',
  completed: 'Hoàn thành',
  closed: 'Đã đóng',
  cancelled: 'Đã hủy',
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Chờ thanh toán',
  active: 'Đang học',
  completed: 'Hoàn thành',
  kicked_by_tutor: 'Gia sư mời rời lớp',
  kicked_unpaid: 'Quá hạn học phí',
  cancelled: 'Đã hủy',
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  none: 'Không hoàn tiền',
  pending: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
  rejected: 'Từ chối hoàn',
};

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const OnlineClassManagement: React.FC = () => {
  const { showToast } = useToast();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<'classes' | 'refunds' | 'enrollments' | 'payments' | 'reviews'>('classes');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [runningWorkers, setRunningWorkers] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await onlineClassesApi.getAdminOverview();
      setData(res);
    } catch {
      showToast('Không tải được dữ liệu lớp học online.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClassAction = async (classId: number, status: string) => {
    try {
      await onlineClassesApi.adminClassAction(classId, status);
      showToast('Đã cập nhật trạng thái lớp.', 'success');
      await load();
    } catch {
      showToast('Cập nhật thất bại.', 'error');
    }
  };

  const handleRefundAction = async (enrollmentId: number, action: 'mark_refunded' | 'reject_refund') => {
    const note = window.prompt('Ghi chú xử lý hoàn tiền (không bắt buộc):') || '';
    try {
      await onlineClassesApi.adminRefundAction(enrollmentId, action, note);
      showToast('Đã cập nhật trạng thái hoàn tiền.', 'success');
      await load();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể xử lý.', 'error');
    }
  };

  const handleReviewAction = async (reviewId: number, action: 'hide' | 'show') => {
    try {
      await onlineClassesApi.adminReviewAction(reviewId, action);
      showToast('Đã cập nhật hiển thị đánh giá.', 'success');
      await load();
    } catch {
      showToast('Thao tác thất bại.', 'error');
    }
  };

  const runWorkers = async () => {
    setRunningWorkers(true);
    try {
      const res = await onlineClassesApi.adminRunBillingWorkers();
      showToast(
        `Đã chạy worker: gửi ${res.reminders_sent} email nhắc hạn, kick ${res.overdue_kicked} học viên quá hạn.`,
        'success',
      );
      await load();
    } catch {
      showToast('Chạy worker thất bại.', 'error');
    } finally {
      setRunningWorkers(false);
    }
  };

  if (loading && !data) {
    return <div className="p-10 text-center font-semibold text-slate-400">Đang tải dữ liệu...</div>;
  }

  const summary = data?.summary || {};
  const pagedClasses = useClientPagination(data?.classes || [], page, 10);
  const pagedRefunds = useClientPagination(data?.kicks_and_refunds || [], page, 10);
  const pagedEnrollments = useClientPagination(data?.enrollments || [], page, 10);
  const pagedPayments = useClientPagination(data?.payments || [], page, 10);
  const pagedReviews = useClientPagination(data?.reviews || [], page, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Quản lý lớp dạy online</h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi lớp nhóm, thanh toán PayOS theo kỳ, xử lý kick có minh chứng & hoàn tiền, và worker nhắc học phí.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runWorkers}
            disabled={runningWorkers}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <BellRing className="h-4 w-4" />
            {runningWorkers ? 'Đang chạy...' : 'Chạy nhắc hạn & kiểm tra quá hạn'}
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Video} label="Tổng lớp online" value={summary.total_classes || 0} />
        <StatCard icon={Users} label="Học viên đang học" value={summary.active_enrollments || 0} />
        <StatCard icon={ShieldAlert} label="Chờ hoàn tiền" value={summary.pending_refunds || 0} />
        <StatCard icon={Star} label="Doanh thu PayOS" value={`${money(summary.total_paid_revenue)}đ`} />
      </div>

      <div className="inline-flex flex-wrap gap-2 rounded-2xl bg-white p-1.5 border border-slate-200">
        {[
          { key: 'classes', label: `Lớp học (${data?.classes?.length || 0})` },
          { key: 'refunds', label: `Rời lớp & Hoàn tiền (${data?.kicks_and_refunds?.length || 0})` },
          { key: 'enrollments', label: `Ghi danh (${data?.enrollments?.length || 0})` },
          { key: 'payments', label: `Nhật ký học phí (${data?.payments?.length || 0})` },
          { key: 'reviews', label: `Đánh giá (${data?.reviews?.length || 0})` },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setTab(item.key as any);
              setPage(1);
            }}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              tab === item.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'classes' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Lớp học</th>
                <th className="px-5 py-3.5">Gia sư</th>
                <th className="px-5 py-3.5">Sĩ số</th>
                <th className="px-5 py-3.5">Gia hạn</th>
                <th className="px-5 py-3.5">Trạng thái</th>
                <th className="px-5 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedClasses.pagedItems.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{c.title}</p>
                    <p className="text-xs text-slate-500">{c.subject_name} · {c.schedule_text}</p>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-slate-700">{c.tutor_name}</td>
                  <td className="px-5 py-3.5 font-bold whitespace-nowrap">{c.active_students_count}/{c.max_students}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{c.payment_grace_days} ngày</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{CLASS_STATUS_LABELS[c.status] || c.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    {c.status !== 'open' && (
                      <button onClick={() => handleClassAction(c.id, 'open')} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Mở lại</button>
                    )}
                    {c.status !== 'closed' && (
                      <button onClick={() => handleClassAction(c.id, 'closed')} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">Đóng lớp</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 pt-0">
            <Pagination
              currentPage={pagedClasses.currentPage}
              totalCount={pagedClasses.totalCount}
              pageSize={pagedClasses.pageSize}
              totalPages={pagedClasses.totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {tab === 'refunds' && (
        <div className="space-y-3">
          {pagedRefunds.pagedItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
              Chưa có trường hợp kick hoặc hoàn tiền nào.
            </div>
          ) : (
            pagedRefunds.pagedItems.map((item: any) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-slate-900">{item.student_name}</span>
                    <span className="text-xs text-slate-400">({item.student_email})</span>
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                      {item.kick_type === 'overdue_unpaid' ? 'Quá hạn học phí (0đ hoàn)' : 'Gia sư mời rời lớp'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-600">Lớp: {item.class_title}</p>
                  <p className="text-xs text-slate-600">Lý do: {item.kick_reason}</p>
                  {item.kick_evidence_note && <p className="text-xs text-slate-500">Minh chứng: {item.kick_evidence_note}</p>}
                  {item.evidence_url && (
                    <a href={item.evidence_url} target="_blank" rel="noreferrer" className="inline-block text-xs font-bold text-blue-600 underline">
                      Xem file minh chứng
                    </a>
                  )}
                  <p className="text-xs font-bold text-emerald-700">
                    Đã học {item.sessions_attended}/{item.sessions_paid_total} buổi · Buổi chưa học: {item.refund_sessions_remaining} · Hoàn lại: {money(item.refund_amount)}đ ({REFUND_STATUS_LABELS[item.refund_status] || item.refund_status})
                  </p>
                  {item.student_bank_info && (item.student_bank_info.bank_account_number || item.student_bank_info.bank_qr_url) ? (
                    <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <span className="font-bold">TK hoàn tiền HV:</span>{' '}
                      {[item.student_bank_info.bank_name, item.student_bank_info.bank_account_number, item.student_bank_info.bank_account_holder].filter(Boolean).join(' · ')}
                      {item.student_bank_info.bank_qr_url && (
                        <a href={item.student_bank_info.bank_qr_url} target="_blank" rel="noreferrer" className="ml-2 font-bold text-blue-600 underline">
                          Xem QR học viên
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-amber-600">Học viên chưa lưu tài khoản ngân hàng trong hồ sơ.</p>
                  )}
                </div>

                {item.refund_status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleRefundAction(item.id, 'mark_refunded')}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Đã hoàn tiền
                    </button>
                    <button
                      onClick={() => handleRefundAction(item.id, 'reject_refund')}
                      className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Từ chối
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          <Pagination
            currentPage={pagedRefunds.currentPage}
            totalCount={pagedRefunds.totalCount}
            pageSize={pagedRefunds.pageSize}
            totalPages={pagedRefunds.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {tab === 'enrollments' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Học viên</th>
                <th className="px-5 py-3.5">Lớp</th>
                <th className="px-5 py-3.5">Chu kỳ</th>
                <th className="px-5 py-3.5">Đã đóng</th>
                <th className="px-5 py-3.5">Hạn tiếp theo</th>
                <th className="px-5 py-3.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedEnrollments.pagedItems.map((enr: any) => (
                <tr key={enr.id}>
                  <td className="px-5 py-3.5 font-bold text-slate-900">{enr.student_name}</td>
                  <td className="px-5 py-3.5">{enr.class_title}</td>
                  <td className="px-5 py-3.5">{BILLING_LABELS[enr.billing_cycle] || enr.billing_cycle}</td>
                  <td className="px-5 py-3.5 font-bold text-emerald-700">{money(enr.total_paid_amount)}đ</td>
                  <td className="px-5 py-3.5">{enr.next_payment_due_date ? new Date(enr.next_payment_due_date).toLocaleDateString('vi-VN') : '---'}</td>
                  <td className="px-5 py-3.5">{ENROLLMENT_STATUS_LABELS[enr.status] || enr.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 pt-0">
            <Pagination
              currentPage={pagedEnrollments.currentPage}
              totalCount={pagedEnrollments.totalCount}
              pageSize={pagedEnrollments.pageSize}
              totalPages={pagedEnrollments.totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Học viên</th>
                <th className="px-5 py-3.5">Lớp</th>
                <th className="px-5 py-3.5">Gói</th>
                <th className="px-5 py-3.5">Số tiền</th>
                <th className="px-5 py-3.5">Mã PayOS</th>
                <th className="px-5 py-3.5">Ngày đóng</th>
                <th className="px-5 py-3.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedPayments.pagedItems.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{p.student_name}</p>
                    <p className="text-xs text-slate-400">{p.student_email}</p>
                  </td>
                  <td className="px-5 py-3.5">{p.class_title}</td>
                  <td className="px-5 py-3.5">{BILLING_LABELS[p.billing_cycle] || p.billing_cycle}</td>
                  <td className="px-5 py-3.5 font-bold text-emerald-700">{money(p.amount)}đ</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{p.payos_order_code || '---'}</td>
                  <td className="px-5 py-3.5 text-xs font-semibold text-slate-700">
                    {p.paid_at ? new Date(p.paid_at).toLocaleString('vi-VN') : '---'}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {p.status === 'paid' ? 'Đã thanh toán' : p.status === 'pending' ? 'Chờ thanh toán' : p.status === 'cancelled' ? 'Đã hủy' : 'Thất bại'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 pt-0">
            <Pagination
              currentPage={pagedPayments.currentPage}
              totalCount={pagedPayments.totalCount}
              pageSize={pagedPayments.pageSize}
              totalPages={pagedPayments.totalPages}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="space-y-3">
          {pagedReviews.pagedItems.map((rev: any) => (
            <div key={rev.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold text-slate-900">
                  {rev.class_title} · {rev.student_name} ({rev.rating}/5 ★)
                </p>
                <p className="mt-1 text-sm text-slate-600">{rev.comment}</p>
              </div>
              <button
                onClick={() => handleReviewAction(rev.id, rev.is_visible ? 'hide' : 'show')}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
              >
                <EyeOff className="h-3.5 w-3.5" />
                {rev.is_visible ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          ))}
          <Pagination
            currentPage={pagedReviews.currentPage}
            totalCount={pagedReviews.totalCount}
            pageSize={pagedReviews.pageSize}
            totalPages={pagedReviews.totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value }: any) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-slate-400">
      <Icon className="h-4 w-4 text-blue-600" />
      {label}
    </div>
    <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
  </div>
);

export default OnlineClassManagement;
