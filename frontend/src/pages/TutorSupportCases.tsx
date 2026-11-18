import React, { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Send, X } from 'lucide-react';
import { bookingsApi } from '../api/bookings';
import { coursesApi } from '../api/courses';
import { Pagination, useClientPagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';

const STATUS_LABELS: Record<string, string> = {
  open: 'Đang mở',
  investigating: 'Đang xử lý',
  resolved: 'Đã xử lý',
  dismissed: 'Đã đóng',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

const TutorSupportCases: React.FC = () => {
  const { showToast } = useToast();
  const [cases, setCases] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    title: '',
    severity: 'medium',
    course: '',
    booking: '',
    description: '',
  });

  const loadData = async () => {
    const [caseList, courseList, bookingList] = await Promise.all([
      bookingsApi.getSupportCases().catch(() => []),
      coursesApi.getTutorCourses().catch(() => []),
      bookingsApi.getTutorBookings().catch(() => []),
    ]);
    setCases(Array.isArray(caseList) ? caseList : []);
    setCourses(Array.isArray(courseList) ? courseList : []);
    setBookings(Array.isArray(bookingList) ? bookingList : []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const pagedCases = useClientPagination(cases, page, 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      showToast('Vui lòng nhập tiêu đề yêu cầu hỗ trợ.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        severity: form.severity,
        description: form.description.trim(),
      };
      if (form.course) payload.course = Number(form.course);
      if (form.booking) payload.booking = Number(form.booking);

      await bookingsApi.createSupportCase(payload);
      showToast('Đã gửi yêu cầu hỗ trợ tới Admin.', 'success');
      setForm({ title: '', severity: 'medium', course: '', booking: '', description: '' });
      setIsModalOpen(false);
      await loadData();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể gửi yêu cầu hỗ trợ.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Hỗ trợ và tranh chấp</h1>
          <p className="mt-1 text-sm text-slate-500">Gửi yêu cầu để Admin hỗ trợ hoặc theo dõi các hồ sơ liên quan đến tài khoản của bạn.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Gửi yêu cầu hỗ trợ
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Gửi yêu cầu hỗ trợ về Admin</h2>
                <p className="mt-0.5 text-xs text-slate-500">Admin sẽ nhận ngay thông báo tại mục Vi phạm & Hỗ trợ để xử lý giúp bạn.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Tiêu đề yêu cầu *</span>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="VD: Hỗ trợ đổi lịch học / khiếu nại thanh toán / học viên vắng..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Mức độ ưu tiên</span>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
                >
                  <option value="low">Thấp</option>
                  <option value="medium">Trung bình</option>
                  <option value="high">Cao</option>
                  <option value="critical">Nghiêm trọng</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Khóa học liên quan (nếu có)</span>
                <select
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value, booking: e.target.value ? '' : form.booking })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">-- Không chọn --</option>
                  {courses.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500">Lịch hẹn (Booking) liên quan (nếu có)</span>
                <select
                  value={form.booking}
                  onChange={(e) => setForm({ ...form, booking: e.target.value, course: e.target.value ? '' : form.course })}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">-- Không chọn --</option>
                  {bookings.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} - {b.student_name || b.student_email} ({b.subject_name || 'Môn học'})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-bold uppercase text-slate-500">Nội dung chi tiết</span>
                <textarea
                  rows={4}
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Mô tả rõ vấn đề bạn cần Admin hỗ trợ hoặc can thiệp..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 resize-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Đang gửi...' : 'Gửi về Admin'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {pagedCases.pagedItems.map(item => (
          <div key={item.id} className="rounded-3xl border border-slate-100 bg-white p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                    Mức độ: {SEVERITY_LABELS[item.severity] || item.severity}
                  </span>
                </div>
                <h2 className="font-extrabold text-slate-900">{item.title}</h2>
                <p className="mt-2 text-sm font-medium text-slate-600">{item.description || 'Chưa có mô tả.'}</p>
                <p className="mt-2 text-xs font-semibold text-slate-400">
                  {item.booking_label || item.course_title || 'Hồ sơ hỗ trợ'} · {new Date(item.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
              {item.resolution_note && (
                <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700 lg:max-w-sm">
                  <p className="text-[11px] font-black uppercase text-emerald-800 mb-1">Phản hồi từ Admin</p>
                  {item.resolution_note}
                </div>
              )}
            </div>
          </div>
        ))}
        {cases.length === 0 && <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">Chưa có hồ sơ hỗ trợ.</div>}
      </div>
      <Pagination
        currentPage={pagedCases.currentPage}
        totalCount={pagedCases.totalCount}
        pageSize={pagedCases.pageSize}
        totalPages={pagedCases.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
};

export default TutorSupportCases;
