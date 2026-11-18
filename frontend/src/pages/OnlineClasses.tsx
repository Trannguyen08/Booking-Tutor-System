import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Clock, Search, Sparkles, Star, UserRound, Video } from 'lucide-react';
import { onlineClassesApi } from '../api/onlineClasses';
import { aiApi } from '../api/ai';
import { Pagination } from '../components/ui/Pagination';
import { tutorService } from '../services/tutorService';
import { getAccessToken } from '../utils/auth';

const REFUND_STATUS_LABELS: Record<string, string> = {
  none: 'Không hoàn tiền',
  pending: 'Chờ hoàn tiền',
  refunded: 'Đã hoàn tiền',
  rejected: 'Từ chối hoàn',
};

const money = (value: string | number | undefined) =>
  Number(value || 0).toLocaleString('vi-VN');

const OnlineClasses: React.FC = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [myEnrollments, setMyEnrollments] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [allPage, setAllPage] = useState(1);
  const [allPagination, setAllPagination] = useState<{ count: number; total_pages: number; page: number; page_size: number } | null>(null);
  const [minePage, setMinePage] = useState(1);
  const [minePagination, setMinePagination] = useState<{ count: number; total_pages: number; page: number; page_size: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState('');
  const [aiWeeklyHours, setAiWeeklyHours] = useState(4);
  const [aiBudget, setAiBudget] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const isLoggedIn = Boolean(getAccessToken('user'));

  const handleGenerateRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiGoal.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiApi.learningRoadmap({
        goal: aiGoal.trim(),
        weekly_hours: aiWeeklyHours,
        budget_per_session: aiBudget ? Number(aiBudget) : null,
      });
      setAiResult(res);
    } catch {
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  };

  const loadData = async (nextAllPage = allPage, nextMinePage = minePage) => {
    setLoading(true);
    try {
      const [classData, subjectData] = await Promise.all([
        onlineClassesApi.getPublicClasses({
          search: search.trim() || undefined,
          subject: subject || undefined,
          page: nextAllPage,
          page_size: 10,
        }),
        tutorService.getSubjects().catch(() => []),
      ]);
      if (Array.isArray(classData)) {
        setClasses(classData);
        setAllPagination({ count: classData.length, page: 1, page_size: 10, total_pages: Math.max(1, Math.ceil(classData.length / 10)) });
      } else {
        const list = Array.isArray(classData?.results) ? classData.results : [];
        setClasses(list);
        setAllPagination({
          count: Number(classData?.count ?? list.length),
          page: Number(classData?.page ?? nextAllPage),
          page_size: Number(classData?.page_size ?? 10),
          total_pages: Number(classData?.total_pages ?? 1),
        });
      }
      setSubjects(Array.isArray(subjectData) ? subjectData : []);
      if (isLoggedIn) {
        const mine = await onlineClassesApi.getMyEnrollments({ page: nextMinePage, page_size: 10 }).catch(() => []);
        if (Array.isArray(mine)) {
          setMyEnrollments(mine);
          setMinePagination({ count: mine.length, page: 1, page_size: 10, total_pages: Math.max(1, Math.ceil(mine.length / 10)) });
        } else {
          const mineList = Array.isArray(mine?.results) ? mine.results : [];
          setMyEnrollments(mineList);
          setMinePagination({
            count: Number(mine?.count ?? mineList.length),
            page: Number(mine?.page ?? nextMinePage),
            page_size: Number(mine?.page_size ?? 10),
            total_pages: Number(mine?.total_pages ?? 1),
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(allPage, minePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, allPage, minePage]);

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
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#5a5ce6] to-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" />
              AI Thiết kế lộ trình & Gợi ý lớp
            </button>
            {isLoggedIn && (
              <div className="inline-flex rounded-xl bg-white p-1 border border-gray-200">
                <button
                  type="button"
                  onClick={() => setTab('all')}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    tab === 'all' ? 'bg-[#5a5ce6] text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Tất cả lớp ({allPagination?.count ?? classes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('mine')}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    tab === 'mine' ? 'bg-[#5a5ce6] text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Lớp đã đăng ký ({minePagination?.count ?? myEnrollments.length})
                </button>
              </div>
            )}
          </div>
        </div>

        {aiOpen && (
          <div className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-md space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold text-[#1e1b4b] flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#5a5ce6]" />
                  AI Cố vấn lộ trình học & Ghép lớp / Gia sư phù hợp
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Nhập mục tiêu học tập của bạn, AI sẽ tự động lập lộ trình theo từng giai đoạn và đề xuất lớp nhóm online + gia sư 1-1 phù hợp nhất.
                </p>
              </div>
            </div>

            <form onSubmit={handleGenerateRoadmap} className="grid gap-3 md:grid-cols-[1fr_140px_180px_auto]">
              <input
                required
                value={aiGoal}
                onChange={(e) => setAiGoal(e.target.value)}
                placeholder="VD: Mất gốc Toán 12 muốn thi THPTQG đạt 8+, hoặc luyện IELTS 6.5..."
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#5a5ce6]"
              />
              <input
                type="number"
                min={1}
                max={40}
                value={aiWeeklyHours}
                onChange={(e) => setAiWeeklyHours(Number(e.target.value) || 3)}
                placeholder="Giờ/tuần"
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#5a5ce6]"
              />
              <input
                type="number"
                min={0}
                step={10000}
                value={aiBudget}
                onChange={(e) => setAiBudget(e.target.value)}
                placeholder="Ngân sách/buổi (đ)"
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#5a5ce6]"
              />
              <button
                type="submit"
                disabled={aiLoading}
                className="rounded-xl bg-[#5a5ce6] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[#4b4de0] disabled:opacity-50"
              >
                {aiLoading ? 'Đang lập lộ trình...' : 'Tạo lộ trình AI'}
              </button>
            </form>

            {aiResult?.roadmap && (
              <div className="space-y-4 border-t border-indigo-50 pt-4">
                <div className="rounded-2xl bg-indigo-50/70 p-4">
                  <p className="text-sm font-extrabold text-[#1e1b4b]">{aiResult.roadmap.summary}</p>
                  <p className="mt-1 text-xs font-semibold text-indigo-700">
                    Môn nhận diện: {aiResult.roadmap.detected_subject} · Trình độ: {aiResult.roadmap.detected_level} · Dự kiến {aiResult.roadmap.recommended_weeks} tuần ({aiResult.roadmap.estimated_sessions} buổi)
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {(aiResult.roadmap.milestones || []).map((m: any, idx: number) => (
                    <div key={idx} className="rounded-2xl border border-indigo-100 bg-gray-50/70 p-4 space-y-2">
                      <span className="inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-extrabold text-indigo-700">
                        {m.phase}
                      </span>
                      <h4 className="text-sm font-extrabold text-slate-900">{m.title}</h4>
                      <ul className="space-y-1 text-xs text-slate-600">
                        {(m.focus_topics || []).map((t: string, i: number) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] font-bold text-emerald-700">Kết quả: {m.outcome}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {aiResult.matched_online_classes?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase text-slate-500">Lớp online phù hợp gợi ý</p>
                      <div className="space-y-2">
                        {aiResult.matched_online_classes.map((oc: any) => (
                          <Link
                            key={oc.id}
                            to={`/online-classes/${oc.id}`}
                            className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:border-[#5a5ce6] transition"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{oc.title}</p>
                              <p className="text-xs text-slate-500">{oc.tutor_name} · {oc.schedule_text}</p>
                            </div>
                            <span className="shrink-0 text-xs font-extrabold text-[#5a5ce6]">
                              {money(oc.price_per_session)}đ/buổi →
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiResult.matched_tutors?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase text-slate-500">Gia sư 1-1 phù hợp gợi ý</p>
                      <div className="space-y-2">
                        {aiResult.matched_tutors.map((t: any) => (
                          <Link
                            key={t.id}
                            to={`/tutor/${t.id}`}
                            className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:border-[#5a5ce6] transition"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{t.full_name}</p>
                              <p className="truncate text-xs text-slate-500">{(t.subjects || []).join(', ')} · {(t.rating_avg || 0).toFixed(1)}★</p>
                            </div>
                            <span className="shrink-0 text-xs font-extrabold text-emerald-600">
                              {t.min_hourly_rate ? `${money(t.min_hourly_rate)}đ/giờ` : 'Xem hồ sơ'} →
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'all' ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (allPage !== 1) setAllPage(1);
                else loadData(1, minePage);
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
              <>
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
              <Pagination
                currentPage={allPagination?.page || allPage}
                totalCount={allPagination?.count ?? displayedClasses.length}
                pageSize={10}
                totalPages={allPagination?.total_pages}
                onPageChange={setAllPage}
              />
              </>
            )}
          </>
        ) : (
          <>
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
                        Tiền hoàn lại: {money(enr.refund_amount)}đ ({REFUND_STATUS_LABELS[enr.refund_status] || enr.refund_status})
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
          <Pagination
            currentPage={minePagination?.page || minePage}
            totalCount={minePagination?.count ?? myEnrollments.length}
            pageSize={10}
            totalPages={minePagination?.total_pages}
            onPageChange={setMinePage}
          />
          </>
        )}
      </div>
    </div>
  );
};

export default OnlineClasses;
