import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Star,
  UserRound,
  Video,
} from 'lucide-react';
import { onlineClassesApi } from '../api/onlineClasses';
import { useToast } from '../components/ui/Toast';
import { getAccessToken } from '../utils/auth';

const BILLING_LABELS: Record<string, string> = {
  per_session: 'Theo buổi',
  full_course: 'Toàn khóa',
};

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const OnlineClassDetail: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [cls, setCls] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'per_session' | 'full_course'>('per_session');
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const isLoggedIn = Boolean(getAccessToken('user'));

  const loadDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await onlineClassesApi.getPublicClassDetail(id);
      setCls(data);
      const allowed = (data.allowed_billing_cycles || []).filter(
        (c: string) => c === 'per_session' || c === 'full_course',
      );
      if (allowed.length > 0 && !allowed.includes(billingCycle)) {
        setBillingCycle(allowed[0]);
      }
    } catch {
      setCls(null);
      showToast('Không tải được thông tin lớp học.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    if (searchParams.get('payment') === 'cancelled') {
      showToast('Bạn đã hủy thanh toán PayOS.', 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleEnroll = async () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setSubmitting(true);
    try {
      const res = await onlineClassesApi.enroll(id!, billingCycle);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      showToast('Đã tạo đăng ký lớp học.', 'success');
      await loadDetail();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể đăng ký lớp học.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayNext = async () => {
    if (!cls?.my_enrollment) return;
    setSubmitting(true);
    try {
      const res = await onlineClassesApi.payNext(cls.my_enrollment.id);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
        return;
      }
      await loadDetail();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không tạo được link thanh toán.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      showToast('Vui lòng nhập nhận xét.', 'error');
      return;
    }
    setReviewing(true);
    try {
      await onlineClassesApi.createReview(id!, { rating, comment });
      showToast('Cảm ơn bạn đã đánh giá lớp học!', 'success');
      setComment('');
      await loadDetail();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể gửi đánh giá.', 'error');
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#5a5ce6]" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <p className="text-lg font-bold text-gray-700">Không tìm thấy lớp học online</p>
        <button onClick={() => navigate('/online-classes')} className="text-sm font-bold text-[#5a5ce6] hover:underline">
          Quay lại danh sách
        </button>
      </div>
    );
  }

  const enrollment = cls.my_enrollment;
  const cycles: ('per_session' | 'full_course')[] = (cls.allowed_billing_cycles || []).filter(
    (c: string): c is 'per_session' | 'full_course' =>
      c === 'per_session' || c === 'full_course',
  );
  const priceByCycle: Record<string, number> = {
    per_session: Number(cls.price_per_session || 0),
    full_course: Number(cls.full_course_price || 0),
  };

  return (
    <div className="flex-1 bg-[#f8faff] py-6 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <button
          onClick={() => navigate('/online-classes')}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#5a5ce6]"
        >
          <ArrowLeft className="h-4 w-4" />
          Danh sách lớp online
        </button>

        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* Left Main Content */}
          <div className="lg:col-span-7 space-y-5">
            <section className="rounded-2xl border border-indigo-100/80 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-[#5a5ce6]">
                  {cls.subject_name || 'Môn học'}
                </span>
                {cls.level && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {cls.level}
                  </span>
                )}
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  {cls.active_students_count}/{cls.max_students} học viên
                </span>
              </div>

              <h1 className="text-2xl font-extrabold text-[#1e1b4b]">{cls.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <Link
                  to={`/tutor/${cls.tutor_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#5a5ce6] hover:underline"
                >
                  <UserRound className="h-4 w-4" />
                  Gia sư: {cls.tutor_name}
                </Link>
                {cls.tutor_id && (
                  <Link
                    to={`/tutor/${cls.tutor_id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-bold text-[#5a5ce6] hover:bg-indigo-100 transition"
                  >
                    Xem hồ sơ gia sư
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600">{cls.description || 'Chưa có mô tả chi tiết.'}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-gray-400">Lịch học</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-800">{cls.schedule_text}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-gray-400">Thời lượng & Gia hạn</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-800">
                    {cls.total_sessions} buổi ({cls.session_duration_minutes}p) · Gia hạn {cls.payment_grace_days} ngày
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-50 bg-white p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-base font-extrabold text-[#1e1b4b]">
                <CalendarDays className="h-4 w-4 text-[#5a5ce6]" />
                Lịch các buổi học ({cls.sessions?.length || 0})
              </h2>
              {cls.sessions?.length ? (
                <div className="divide-y divide-gray-100">
                  {cls.sessions.map((s: any) => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          Buổi {s.session_number}: {s.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(s.scheduled_at).toLocaleString('vi-VN')} · {s.duration_minutes} phút
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          s.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : s.status === 'cancelled'
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {s.status === 'completed' ? 'Đã dạy' : s.status === 'cancelled' ? 'Đã hủy' : 'Sắp tới'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Gia sư chưa thêm lịch buổi học chi tiết.</p>
              )}
            </section>

            {/* Reviews */}
            <section className="rounded-2xl border border-indigo-50 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#1e1b4b]">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  Đánh giá lớp học ({cls.total_reviews || 0})
                </h2>
                <span className="text-sm font-extrabold text-amber-600">
                  {Number(cls.rating_avg || 0).toFixed(1)}/5
                </span>
              </div>

              {enrollment && ['active', 'completed'].includes(enrollment.status) && !enrollment.has_reviewed && (
                <form onSubmit={handleReviewSubmit} className="rounded-xl bg-indigo-50/40 border border-indigo-100 p-4 space-y-3">
                  <p className="text-xs font-extrabold uppercase text-[#5a5ce6]">Viết đánh giá của bạn</p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Chia sẻ trải nghiệm học tập của bạn..."
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#5a5ce6] resize-none"
                  />
                  <button
                    type="submit"
                    disabled={reviewing}
                    className="rounded-xl bg-[#5a5ce6] px-4 py-2 text-xs font-bold text-white hover:bg-[#4b4de0] disabled:opacity-50"
                  >
                    {reviewing ? 'Đang gửi...' : 'Gửi đánh giá'}
                  </button>
                </form>
              )}

              {cls.reviews?.length ? (
                <div className="divide-y divide-gray-100">
                  {cls.reviews.map((rev: any) => (
                    <div key={rev.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">{rev.student_name}</span>
                        <span className="text-xs font-bold text-amber-600">{rev.rating}/5 ★</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Chưa có đánh giá nào.</p>
              )}
            </section>
          </div>

          {/* Right Enrollment / Payment Sidebar */}
          <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
            {enrollment ? (
              <section className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-[#1e1b4b]">Trạng thái ghi danh</h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      enrollment.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : enrollment.status.startsWith('kicked')
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {enrollment.status === 'active'
                      ? 'Đang học'
                      : enrollment.status === 'pending_payment'
                        ? 'Chờ thanh toán'
                        : enrollment.status === 'kicked_by_tutor'
                          ? 'Bị gia sư mời rời lớp'
                          : enrollment.status === 'kicked_unpaid'
                            ? 'Bị xóa (quá hạn học phí)'
                            : enrollment.status}
                  </span>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Hình thức đóng:</span>
                    <span className="font-bold text-gray-900">{BILLING_LABELS[enrollment.billing_cycle] || enrollment.billing_cycle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Đã thanh toán:</span>
                    <span className="font-bold text-emerald-700">{money(enrollment.total_paid_amount)}đ ({enrollment.sessions_paid_total} buổi)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Số buổi đã học:</span>
                    <span className="font-bold text-gray-900">{enrollment.computed_attended_sessions ?? enrollment.sessions_attended} buổi</span>
                  </div>
                  {enrollment.next_payment_due_date && enrollment.status === 'active' && (
                    <div className="flex justify-between text-amber-700">
                      <span>Hạn đóng kỳ tiếp theo:</span>
                      <span className="font-extrabold">
                        {new Date(enrollment.next_payment_due_date).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  )}
                </div>

                {enrollment.status === 'active' && cls.meeting_link && (
                  <a
                    href={cls.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    <Video className="h-4 w-4" />
                    Vào phòng học online
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}

                {enrollment.status === 'active' && enrollment.billing_cycle !== 'full_course' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handlePayNext}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5a5ce6] px-4 py-3 text-sm font-bold text-white hover:bg-[#4b4de0] disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    {submitting ? 'Đang tạo link PayOS...' : 'Đóng học phí kỳ tiếp theo (PayOS)'}
                  </button>
                )}

                {enrollment.status === 'pending_payment' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleEnroll}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5a5ce6] px-4 py-3 text-sm font-bold text-white hover:bg-[#4b4de0] disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    Tiếp tục thanh toán PayOS
                  </button>
                )}

                {enrollment.status.startsWith('kicked') && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2 text-xs text-rose-800">
                    <div className="flex items-center gap-2 font-extrabold">
                      <AlertTriangle className="h-4 w-4" />
                      Lý do rời lớp
                    </div>
                    <p>{enrollment.kick_reason}</p>
                    {enrollment.kick_evidence_note && (
                      <p className="text-rose-700">Minh chứng: {enrollment.kick_evidence_note}</p>
                    )}
                    {enrollment.evidence_url && (
                      <a
                        href={enrollment.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block font-bold underline"
                      >
                        Xem file minh chứng
                      </a>
                    )}
                    <div className="border-t border-rose-200 pt-2 font-bold">
                      {Number(enrollment.refund_amount) > 0
                        ? `Hoàn tiền (${enrollment.refund_sessions_remaining} buổi chưa học): ${money(enrollment.refund_amount)}đ · Trạng thái: ${enrollment.refund_status}`
                        : 'Không hoàn tiền (quá hạn học phí hoặc không còn buổi chưa học).'}
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm space-y-4">
                <h2 className="text-base font-extrabold text-[#1e1b4b]">Đăng ký tham gia lớp</h2>
                <p className="text-xs text-gray-500">
                  Chọn chu kỳ đóng học phí và thanh toán trực tuyến qua PayOS để giữ chỗ ngay.
                </p>

                <div className="space-y-2.5">
                  {cycles.map((cycle) => {
                    const price = priceByCycle[cycle] || 0;
                    const selected = billingCycle === cycle;
                    return (
                      <button
                        key={cycle}
                        type="button"
                        onClick={() => setBillingCycle(cycle)}
                        className={`w-full flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                          selected
                            ? 'border-[#5a5ce6] bg-indigo-50/60 ring-2 ring-[#5a5ce6]/20'
                            : 'border-gray-200 bg-white hover:border-indigo-200'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-extrabold text-gray-900">{BILLING_LABELS[cycle]}</p>
                          <p className="text-xs text-gray-500">
                            {cycle === 'per_session'
                              ? 'Thanh toán từng buổi học'
                              : `Trọn gói ${cls.total_sessions} buổi`}
                          </p>
                        </div>
                        <span className="text-sm font-black text-[#5a5ce6]">{money(price)}đ</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
                  <strong>Lưu ý gia hạn:</strong> Hệ thống gửi email nhắc trước 2 ngày khi đến hạn học phí. Thời gian gia hạn tối thiểu là <strong>{cls.payment_grace_days} ngày</strong>; quá hạn sẽ tự động rời lớp và không hoàn tiền.
                </div>

                <button
                  type="button"
                  disabled={submitting || cls.seats_remaining <= 0}
                  onClick={handleEnroll}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#5a5ce6] px-5 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-100 hover:bg-[#4b4de0] disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {cls.seats_remaining <= 0
                    ? 'Lớp đã đủ sĩ số'
                    : submitting
                      ? 'Đang chuyển tới PayOS...'
                      : `Đăng ký & Thanh toán ${money(priceByCycle[billingCycle])}đ`}
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineClassDetail;
