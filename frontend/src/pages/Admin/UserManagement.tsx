import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CreditCard,
  Eye,
  Landmark,
  Lock,
  Mail,
  Phone,
  QrCode,
  Search,
  Star,
  Trash2,
  Unlock,
  Video,
  X,
} from 'lucide-react';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../store/useAdminStore';
import { formatCurrency, formatDate, formatPhoneNumber } from '../../utils/format';
import { Pagination, useClientPagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const courseStatusLabel: Record<string, string> = {
  active: 'Đang học',
  completed: 'Hoàn thành',
  paused: 'Tạm dừng',
  cancelled: 'Đã hủy',
  kicked_by_tutor: 'Gia sư mời rời lớp',
  kicked_unpaid: 'Quá hạn học phí',
  pending_payment: 'Chờ thanh toán',
};

const UserManagement: React.FC = () => {
  const { users, isLoading, fetchUsers, userAction } = useAdminStore();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [studentDetail, setStudentDetail] = useState<any>(null);

  const openDetailModal = async (userId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setStudentDetail(null);
    try {
      const data = await adminApi.getUserDetail(userId);
      setStudentDetail(data);
    } catch {
      showToast('Không thể tải thông tin chi tiết học viên.', 'error');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers({ role: 'student' });
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const keyword = normalizeText(searchTerm.trim());
    return (Array.isArray(users) ? users : [])
      .filter((user) => !user.is_tutor && !user.is_staff)
      .filter((user) => {
        if (statusFilter === 'active') return user.is_active;
        if (statusFilter === 'locked') return !user.is_active;
        if (statusFilter === 'verified') return user.is_verified;
        if (statusFilter === 'unverified') return !user.is_verified;
        return true;
      })
      .filter((user) => {
        if (!keyword) return true;
        const haystack = normalizeText(
          [user.username, user.email, user.phone, user.created_at].filter(Boolean).join(' '),
        );
        return haystack.includes(keyword);
      });
  }, [searchTerm, statusFilter, users]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  const pagedUsers = useClientPagination(filteredUsers, page, 10);

  const handleAction = async (id: number, action: string) => {
    try {
      await userAction(id, action, { role: 'student' });
      const labels: Record<string, string> = {
        lock: 'Đã khóa tài khoản học sinh.',
        unlock: 'Đã mở khóa tài khoản học sinh.',
        delete: 'Đã xóa tài khoản học sinh.',
      };
      showToast(labels[action] || 'Thao tác thành công.', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Thao tác thất bại.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Quản lý học sinh</h1>
        <p className="mt-1 text-sm text-slate-500">Chỉ hiển thị các tài khoản có vai trò học sinh trong hệ thống.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/40 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              type="text"
              placeholder="Tìm theo tên, email, số điện thoại..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Bị khóa</option>
            <option value="verified">Đã xác thực</option>
            <option value="unverified">Chưa xác thực</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">#</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Học sinh</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Liên hệ</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Xác thực</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Ngày tham gia</th>
                <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Trạng thái</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase text-slate-500">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : pagedUsers.pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Không có học sinh phù hợp.
                  </td>
                </tr>
              ) : (
                pagedUsers.pagedItems.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-slate-50/60">
                    <td className="px-6 py-4 text-sm text-slate-500">{(pagedUsers.currentPage - 1) * pagedUsers.pageSize + idx + 1}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username || user.email)}`}
                          alt={user.username}
                          className="h-9 w-9 rounded-full border border-slate-200 bg-slate-50"
                        />
                        <div>
                          <div className="text-sm font-bold text-slate-800">{user.username}</div>
                          <div className="text-xs text-slate-500">ID: {user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-700">{user.email || '---'}</div>
                      <div className="mt-1 text-sm text-slate-500">{formatPhoneNumber(user.phone) || '---'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${
                          user.is_verified
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        {user.is_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-500 whitespace-nowrap">{formatDate(user.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${
                          user.is_active
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : 'border-rose-200 bg-rose-100 text-rose-700'
                        }`}
                      >
                        {user.is_active ? 'Hoạt động' : 'Bị khóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openDetailModal(user.id)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          title="Xem chi tiết học viên"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {user.is_active ? (
                          <button
                            onClick={() => handleAction(user.id, 'lock')}
                            className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                            title="Khóa tài khoản"
                          >
                            <Lock className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(user.id, 'unlock')}
                            className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title="Mở khóa tài khoản"
                          >
                            <Unlock className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(user.id, 'delete')}
                          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Xóa tài khoản"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 pb-4">
          <Pagination
            currentPage={pagedUsers.currentPage}
            totalCount={pagedUsers.totalCount}
            pageSize={pagedUsers.pageSize}
            totalPages={pagedUsers.totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">Thông tin chi tiết học viên</h2>
                <p className="text-xs font-medium text-slate-500">Hồ sơ cá nhân, khóa học, đánh giá, học phí và tài khoản ngân hàng.</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {detailLoading || !studentDetail ? (
                <div className="py-16 text-center text-sm font-semibold text-slate-400">Đang tải thông tin chi tiết học viên...</div>
              ) : (
                <>
                  {/* Personal Info + Money Summary */}
                  <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={
                            studentDetail.profile.avatar_url ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(studentDetail.profile.username || studentDetail.profile.email)}`
                          }
                          alt={studentDetail.profile.full_name}
                          className="h-16 w-16 rounded-2xl border border-slate-200 bg-white object-cover"
                        />
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-black text-slate-900">{studentDetail.profile.full_name}</h3>
                          <p className="text-xs font-semibold text-slate-500">@{studentDetail.profile.username} · ID #{studentDetail.profile.id}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${studentDetail.profile.is_verified ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                              {studentDetail.profile.is_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                            </span>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${studentDetail.profile.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {studentDetail.profile.is_active ? 'Đang hoạt động' : 'Bị khóa'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2.5 text-xs text-slate-700 sm:grid-cols-2">
                        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 border border-slate-100">
                          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate font-semibold">{studentDetail.profile.email}</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 border border-slate-100">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold">{studentDetail.profile.phone ? formatPhoneNumber(studentDetail.profile.phone) : 'Chưa cập nhật'}</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 border border-slate-100 sm:col-span-2">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>Ngày tham gia: <b>{formatDate(studentDetail.profile.created_at)}</b></span>
                        </div>
                      </div>
                      {studentDetail.profile.bio && (
                        <p className="rounded-xl bg-white px-3.5 py-2.5 text-xs text-slate-600 border border-slate-100">
                          {studentDetail.profile.bio}
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold uppercase text-emerald-100">Tổng tiền đã đóng</span>
                          <CreditCard className="h-5 w-5 text-emerald-100" />
                        </div>
                        <p className="mt-2 text-2xl font-black">{formatCurrency(Number(studentDetail.summary.total_paid_overall || 0))}</p>
                        <p className="mt-1.5 text-xs text-emerald-100">
                          Cọc 1-1: {formatCurrency(Number(studentDetail.summary.total_paid_1on1_deposit || 0))} · Online: {formatCurrency(Number(studentDetail.summary.total_paid_online || 0))}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
                          <p className="text-[11px] font-bold uppercase text-slate-400">Khóa 1-1</p>
                          <p className="mt-1 text-xl font-black text-slate-900">{studentDetail.summary.courses_count || 0}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
                          <p className="text-[11px] font-bold uppercase text-slate-400">Lớp online</p>
                          <p className="mt-1 text-xl font-black text-indigo-600">{studentDetail.summary.online_classes_count || 0}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
                          <p className="text-[11px] font-bold uppercase text-slate-400">Đánh giá</p>
                          <p className="mt-1 text-xl font-black text-amber-600">{studentDetail.summary.reviews_count || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bank Info */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                      <Landmark className="h-4 w-4 text-indigo-600" />
                      Thông tin tài khoản ngân hàng (hoàn tiền)
                    </h4>
                    {studentDetail.bank_info.bank_account_number || studentDetail.bank_info.bank_qr_url ? (
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid flex-1 gap-2 text-xs sm:grid-cols-2">
                          <p className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">Ngân hàng:</span> <b>{studentDetail.bank_info.bank_name || '---'}</b></p>
                          <p className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">Số tài khoản:</span> <b>{studentDetail.bank_info.bank_account_number || '---'}</b></p>
                          <p className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">Chủ tài khoản:</span> <b>{studentDetail.bank_info.bank_account_holder || '---'}</b></p>
                          <p className="rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">Chi nhánh:</span> <b>{studentDetail.bank_info.bank_branch || '---'}</b></p>
                        </div>
                        {studentDetail.bank_info.bank_qr_url ? (
                          <a href={studentDetail.bank_info.bank_qr_url} target="_blank" rel="noreferrer" className="shrink-0">
                            <img src={studentDetail.bank_info.bank_qr_url} alt="QR Ngân hàng" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
                          </a>
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-[10px] font-bold text-slate-400">
                            <QrCode className="h-5 w-5 mb-1" />
                            Chưa có QR
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-400">
                        Học viên chưa lưu thông tin tài khoản ngân hàng.
                      </p>
                    )}
                  </div>

                  {/* Courses & Online Classes */}
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                      <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                        <BookOpen className="h-4 w-4 text-blue-600" />
                        Khóa học 1-1 ({studentDetail.courses.length})
                      </h4>
                      {studentDetail.courses.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Chưa có khóa học 1-1.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {studentDetail.courses.map((c: any) => (
                            <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-black text-slate-900">{c.title}</p>
                                <span className="inline-flex whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-100">
                                  {courseStatusLabel[c.status] || c.status}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-500">Gia sư: <b>{c.tutor_name}</b> · {c.subject_name}</p>
                              <p className="mt-1 font-semibold text-slate-600">
                                Tiến độ: {c.completed_sessions}/{c.total_sessions} buổi · {formatCurrency(Number(c.hourly_rate || 0))}/h
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                      <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                        <Video className="h-4 w-4 text-emerald-600" />
                        Lớp học online ({studentDetail.online_classes.length})
                      </h4>
                      {studentDetail.online_classes.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Chưa tham gia lớp online nào.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {studentDetail.online_classes.map((oc: any) => (
                            <div key={oc.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-black text-slate-900">{oc.class_title}</p>
                                <span className="inline-flex whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-100">
                                  {courseStatusLabel[oc.status] || oc.status}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-500">Gia sư: <b>{oc.tutor_name}</b> · {oc.subject_name}</p>
                              <p className="mt-1 font-semibold text-emerald-700">
                                Đã đóng: {formatCurrency(Number(oc.total_paid_amount || 0))} · Đã học {oc.sessions_attended}/{oc.sessions_paid_total} buổi
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reviews */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
                      <Star className="h-4 w-4 text-amber-500" />
                      Các bài đánh giá đã viết ({studentDetail.reviews.length})
                    </h4>
                    {studentDetail.reviews.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Học viên chưa viết đánh giá nào.</p>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {studentDetail.reviews.map((rev: any) => (
                          <div key={rev.uid} className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{rev.source}</span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800">
                                {rev.rating} ★
                              </span>
                            </div>
                            <p className="font-black text-slate-900">{rev.title}</p>
                            <p className="text-slate-500">Gia sư: {rev.tutor_name}</p>
                            <p className="text-slate-700 leading-relaxed">{rev.comment}</p>
                            <p className="text-[11px] text-slate-400">{formatDate(rev.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
