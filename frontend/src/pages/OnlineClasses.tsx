import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Clock, Search, Star, UserRound, Video } from 'lucide-react';
import { onlineClassesApi } from '../api/onlineClasses';
import { tutorService } from '../services/tutorService';
import { getAccessToken } from '../utils/auth';

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const OnlineClasses: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);
  const isLoggedIn = Boolean(getAccessToken('user'));

  const loadData = async () => {
    setLoading(true);
    try {
      const [classData, subjectData] = await Promise.all([
        onlineClassesApi.getPublicClasses({
          search: search.trim() || undefined,
          subject: subject || undefined,
        }),
        tutorService.getSubjects().catch(() => []),
      ]);
      setClasses(Array.isArray(classData) ? classData : []);
      setSubjects(Array.isArray(subjectData) ? subjectData : []);
      if (isLoggedIn) {
        const mine = await onlineClassesApi.getMyEnrollments().catch(() => []);
        setMyEnrollments(Array.isArray(mine) ? mine : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const displayedClasses = useMemo(() => classes, [classes]);

  return (
    <div className="flex-1 bg-[#f8faff] py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-[#5a5ce6]">
              <Video className="h-3.5 w-3.5" />
              Học nhóm trực tuyến nhiều học viên
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#1e1b4b]">
              Lớp học online cùng gia sư
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Tham gia lớp học trực tuyến với sĩ số giới hạn, đóng học phí linh hoạt theo buổi hoặc toàn khóa qua PayOS.
            </p>
          </div>
          {isLoggedIn && (
            <div className="inline-flex rounded-xl bg-white p-1 border border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  tab === 'all' ? 'bg-[#5a5ce6] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Tất cả lớp ({classes.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('mine')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                  tab === 'mine' ? 'bg-[#5a5ce6] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Lớp đã đăng ký ({myEnrollments.length})
              </button>
            </div>
          )}
        </div>

        {tab === 'all' ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadData();
              }}
              className="grid gap-3 rounded-2xl border border-indigo-50 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]"
            >
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm tên lớp, môn học hoặc gia sư..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[#5a5ce6] focus:bg-white"
                />
              </div>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5a5ce6]"
              >
                <option value="">Tất cả môn học</option>
                {subjects.map((subj: any) => (
                  <option key={subj.id} value={subj.id}>
                    {subj.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl bg-[#5a5ce6] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#4b4de0]"
              >
                Tìm kiếm
              </button>
            </form>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl bg-white border border-gray-100" />
                ))}
              </div>
            ) : displayedClasses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm font-semibold text-gray-400">
                Chưa có lớp dạy online nào phù hợp.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {displayedClasses.map((item) => {
                  const full = item.seats_remaining <= 0;
                  return (
                    <div
                      key={item.id}
                      className="group flex flex-col justify-between rounded-2xl border border-indigo-50 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-[#5a5ce6]">
                            {item.subject_name || 'Môn chung'}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              full ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {item.active_students_count}/{item.max_students} học viên
                          </span>
                        </div>

                        <Link to={`/online-classes/${item.id}`} className="block mt-3">
                          <h2 className="text-lg font-extrabold text-[#1e1b4b] group-hover:text-[#5a5ce6] line-clamp-2">
                            {item.title}
                          </h2>
                        </Link>
                        {item.tutor_id ? (
                          <Link
                            to={`/tutor/${item.tutor_id}`}
                            className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#5a5ce6] hover:underline"
                          >
                            <UserRound className="h-3.5 w-3.5" />
                            Gia sư: {item.tutor_name} · Xem hồ sơ
                          </Link>
                        ) : (
                          <p className="mt-1 text-xs font-bold text-gray-500">
                            Gia sư: {item.tutor_name}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-gray-600 line-clamp-2">
                          {item.description || 'Lớp học tương tác trực tiếp qua phòng học online.'}
                        </p>

                        <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-[#5a5ce6]" />
                            <span className="truncate">{item.schedule_text}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-[#5a5ce6]" />
                            <span>
                              {item.total_sessions} buổi · Gia hạn học phí {item.payment_grace_days} ngày
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-gray-100 pt-3.5 space-y-3">
                        <div className="flex items-end justify-between gap-2">
                          <div className="space-y-0.5">
                            {Number(item.price_per_session) > 0 && (
                              <p className="text-sm font-black text-[#5a5ce6]">
                                {money(item.price_per_session)}đ<span className="text-xs font-semibold text-gray-400">/buổi</span>
                              </p>
                            )}
                            {Number(item.full_course_price) > 0 && (
                              <p className="text-xs font-bold text-emerald-700">
                                {money(item.full_course_price)}đ/toàn khóa
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-bold text-amber-600">
                            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            {Number(item.rating_avg || 0).toFixed(1)} ({item.total_reviews || 0})
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            to={`/online-classes/${item.id}`}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5a5ce6] px-3 py-2 text-xs font-bold text-white hover:bg-[#4b4de0] transition"
                          >
                            Xem lớp & Đăng ký
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                          {item.tutor_id && (
                            <Link
                              to={`/tutor/${item.tutor_id}`}
                              className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs font-bold text-[#5a5ce6] hover:bg-indigo-100 transition"
                            >
                              Hồ sơ gia sư
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {myEnrollments.length === 0 ? (
              <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm font-semibold text-gray-400">
                Bạn chưa đăng ký lớp học online nào.
              </div>
            ) : (
              myEnrollments.map((enr) => (
                <div
                  key={enr.id}
                  className="flex flex-col justify-between rounded-2xl border border-indigo-50 bg-white p-5 shadow-sm hover:border-indigo-200 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a5ce6]">
                        <BookOpen className="h-3.5 w-3.5" />
                        {enr.online_class_detail?.subject_name || 'Lớp online'}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          enr.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : enr.status.startsWith('kicked')
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {enr.status === 'active'
                          ? 'Đang học'
                          : enr.status === 'pending_payment'
                            ? 'Chờ thanh toán'
                            : enr.status === 'kicked_by_tutor'
                              ? 'Bị gia sư mời rời lớp'
                              : enr.status === 'kicked_unpaid'
                                ? 'Quá hạn học phí'
                                : enr.status}
                      </span>
                    </div>
                    <Link to={`/online-classes/${enr.online_class}`} className="block mt-2">
                      <h3 className="text-lg font-extrabold text-gray-900 hover:text-[#5a5ce6]">{enr.class_title}</h3>
                    </Link>
                    <p className="mt-1 text-xs text-gray-500">
                      Gia sư: {enr.tutor_name} · Đã đóng: {money(enr.total_paid_amount)}đ ({enr.sessions_paid_total} buổi)
                    </p>
                    {enr.next_payment_due_date && enr.status === 'active' && (
                      <p className="mt-2 text-xs font-bold text-amber-700">
                        Hạn đóng kỳ tiếp theo: {new Date(enr.next_payment_due_date).toLocaleDateString('vi-VN')}
                      </p>
                    )}
                    {Number(enr.refund_amount) > 0 && (
                      <p className="mt-2 text-xs font-bold text-emerald-700">
                        Tiền hoàn lại: {money(enr.refund_amount)}đ ({enr.refund_status})
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3">
                    <Link
                      to={`/online-classes/${enr.online_class}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5a5ce6] px-3 py-2 text-xs font-bold text-white hover:bg-[#4b4de0] transition"
                    >
                      Vào trang lớp học
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    {enr.tutor_id && (
                      <Link
                        to={`/tutor/${enr.tutor_id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs font-bold text-[#5a5ce6] hover:bg-indigo-100 transition"
                      >
                        Hồ sơ gia sư
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnlineClasses;
