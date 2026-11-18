import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  Coins,
  Sparkles,
  Star,
  Trophy,
  Video,
  Wallet,
} from 'lucide-react';
import { tutorService } from '../services/tutorService';
import { aiApi } from '../api/ai';
import { Pagination, useClientPagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';

const money = (value: number | string | undefined) =>
  Math.round(Number(value || 0)).toLocaleString('vi-VN');

type PeriodMode = 'week' | 'month' | 'quarter' | 'year';
type RankingMode = 'month' | 'quarter' | 'year';

const TutorAnalytics: React.FC = () => {
  const { showToast } = useToast();
  const today = new Date();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.floor(today.getMonth() / 3) + 1);
  const [weekDate, setWeekDate] = useState<string>(today.toISOString().slice(0, 10));

  const [rankingMode, setRankingMode] = useState<RankingMode>('month');
  const [rankingYear, setRankingYear] = useState<number>(today.getFullYear());
  const [rankingMonth, setRankingMonth] = useState<number>(today.getMonth() + 1);
  const [rankingQuarter, setRankingQuarter] = useState<number>(Math.floor(today.getMonth() / 3) + 1);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [deductionsPage, setDeductionsPage] = useState(1);
  const [coursesPage, setCoursesPage] = useState(1);
  const [classesPage, setClassesPage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [rankingsPage, setRankingsPage] = useState(1);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await tutorService.getAnalytics({
        mode,
        year,
        month,
        quarter,
        week_date: weekDate,
        ranking_mode: rankingMode,
        ranking_year: rankingYear,
        ranking_month: rankingMonth,
        ranking_quarter: rankingQuarter,
      });
      setData(res);
    } catch {
      showToast('Không thể tải dữ liệu báo cáo thống kê.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [mode, year, month, quarter, weekDate, rankingMode, rankingYear, rankingMonth, rankingQuarter]);

  const handleGenerateAiInsights = async () => {
    if (!data?.summary) return;
    setLoadingAi(true);
    try {
      const myRank = data.leaderboard?.my_rank;
      const res = await aiApi.performanceInsights({
        scope: 'tutor',
        tutor_name: myRank?.full_name || 'Gia sư',
        period_label: data.period?.label || '',
        subjects: myRank?.subjects || [],
        gross_revenue: data.summary.gross_revenue || 0,
        net_revenue: data.summary.net_revenue || 0,
        sessions_taught: data.summary.sessions_taught || 0,
        rating_avg: data.summary.overall_rating_avg || data.summary.average_rating || 0,
        total_reviews: myRank?.total_reviews || data.summary.reviews_count || 0,
        rank: myRank?.rank || null,
        total_tutors: data.leaderboard?.total_tutors || null,
      });
      setAiInsights(res);
    } catch {
      showToast('Không thể khởi tạo phân tích AI lúc này.', 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  const summary = data?.summary || {};
  const chartSeries: any[] = data?.chart_series || [];
  const maxRevenue = Math.max(
    1,
    ...chartSeries.map((b: any) => Math.max(Number(b.gross_revenue || 0), Number(b.net_revenue || 0))),
  );
  const courses: any[] = data?.courses || [];
  const onlineClasses: any[] = data?.online_classes || [];
  const reviews: any[] = data?.reviews || [];
  const leaderboard = data?.leaderboard || {};
  const myRank = leaderboard.my_rank;
  const rankings: any[] = leaderboard.rankings || [];

  const pagedDeductions = useClientPagination(data?.deductions || [], deductionsPage, 10);
  const pagedCourses = useClientPagination(courses, coursesPage, 10);
  const pagedClasses = useClientPagination(onlineClasses, classesPage, 10);
  const pagedReviews = useClientPagination(reviews, reviewsPage, 10);
  const pagedRankings = useClientPagination(rankings, rankingsPage, 10);

  const yearOptions = [today.getFullYear() - 1, today.getFullYear(), today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear() + 1];

  return (
    <div className="space-y-8">
      {/* Header + Period Controls */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Báo cáo & Thống kê giảng dạy</h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi số buổi đã dạy, doanh thu, thực nhận, khóa học, lớp online và thứ hạng doanh thu theo tuần, tháng, quý, năm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {(
              [
                { value: 'week', label: 'Tuần' },
                { value: 'month', label: 'Tháng' },
                { value: 'quarter', label: 'Quý' },
                { value: 'year', label: 'Năm' },
              ] as { value: PeriodMode; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                  mode === opt.value ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'week' && (
            <input
              type="date"
              value={weekDate}
              onChange={(e) => setWeekDate(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            />
          )}

          {mode === 'month' && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          )}

          {mode === 'quarter' && (
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>Quý {q}</option>
              ))}
            </select>
          )}

          {mode !== 'week' && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              {Array.from(new Set(yearOptions)).map((y) => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {data?.period?.label && (
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-extrabold text-emerald-700">
          <Calendar className="h-3.5 w-3.5" />
          Kỳ thống kê: {data.period.label}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-14 text-center text-sm font-semibold text-slate-400">
          Đang tổng hợp số liệu thống kê...
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-100 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-400">Số buổi đã dạy</span>
                <span className="rounded-xl bg-blue-50 p-2 text-blue-600"><BookOpen className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{summary.sessions_taught || 0} buổi</p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.course_sessions_taught || 0} buổi 1-1 · {summary.online_sessions_taught || 0} buổi lớp online
              </p>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-400">Số tiền kiếm được</span>
                <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Coins className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">{money(summary.gross_revenue)}đ</p>
              <p className="mt-1 text-xs text-slate-500">
                1-1: {money(summary.booking_revenue)}đ · Online: {money(summary.online_class_revenue)}đ
              </p>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-400">Thực nhận</span>
                <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><Wallet className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-emerald-600">{money(summary.net_revenue)}đ</p>
              <p className="mt-1 text-xs text-slate-500">
                Đã trừ {money(summary.commission_deducted)}đ hoa hồng & {money(summary.refund_deducted)}đ hoàn tiền
              </p>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-400">Đánh giá & Quy mô</span>
                <span className="rounded-xl bg-amber-50 p-2 text-amber-500"><Star className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-extrabold text-slate-900">
                {(summary.average_rating || 0).toFixed(1)} <span className="text-base font-bold text-amber-500">★</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.reviews_count || 0} đánh giá trong kỳ · {summary.courses_count || 0} khóa 1-1 · {summary.online_classes_count || 0} lớp online
              </p>
            </div>
          </div>

          {/* Detailed Deductions Breakdown (shows why Gross != Net) */}
          {(data?.deductions?.length > 0 || Number(summary.commission_deducted || 0) + Number(summary.refund_deducted || 0) > 0) && (
            <div className="rounded-3xl border border-rose-100 bg-white p-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Chi tiết các khoản khấu trừ trong kỳ ({data?.deductions?.length || 0} khoản)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Công thức: Kiếm được ({money(summary.gross_revenue)}đ) − Tổng khấu trừ ({money(Number(summary.commission_deducted || 0) + Number(summary.refund_deducted || 0))}đ) = Thực nhận ({money(summary.net_revenue)}đ).
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-extrabold text-rose-700 shrink-0">
                  −{money(Number(summary.commission_deducted || 0) + Number(summary.refund_deducted || 0))}đ
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Loại khoản trừ</th>
                      <th className="px-4 py-3">Khóa học / Lớp online</th>
                      <th className="px-4 py-3">Học viên</th>
                      <th className="px-4 py-3">Lý do / Diễn giải</th>
                      <th className="px-4 py-3">Ngày ghi nhận</th>
                      <th className="px-4 py-3 text-right">Số tiền trừ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedDeductions.pagedItems.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            item.type === 'refund' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'
                          }`}>
                            {item.type_label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{item.title}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">{item.student_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.detail}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '---'}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-rose-600">
                          −{money(item.amount)}đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={pagedDeductions.currentPage}
                totalCount={pagedDeductions.totalCount}
                pageSize={pagedDeductions.pageSize}
                totalPages={pagedDeductions.totalPages}
                onPageChange={setDeductionsPage}
              />
            </div>
          )}

          {/* Chart + AI Insights Row */}
          <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            {/* Revenue & Sessions Chart */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-600" />
                    Biểu đồ doanh thu & số buổi dạy
                  </h2>
                  <p className="text-xs text-slate-500">So sánh tổng tiền kiếm được (tím) và thực nhận (xanh lá) theo từng mốc.</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-3 w-3 rounded bg-indigo-500 inline-block" /> Kiếm được
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="h-3 w-3 rounded bg-emerald-500 inline-block" /> Thực nhận
                  </span>
                </div>
              </div>

              {chartSeries.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu biểu đồ cho kỳ này.</div>
              ) : (
                <div className="grid gap-3 pt-2" style={{ gridTemplateColumns: `repeat(${chartSeries.length}, minmax(0, 1fr))` }}>
                  {chartSeries.map((bucket: any) => {
                    const grossH = Math.max(4, Math.round((Number(bucket.gross_revenue || 0) / maxRevenue) * 160));
                    const netH = Math.max(4, Math.round((Number(bucket.net_revenue || 0) / maxRevenue) * 160));
                    return (
                      <div key={bucket.label} className="group flex flex-col items-center gap-2">
                        <div className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition text-center whitespace-nowrap">
                          {money(bucket.net_revenue)}đ
                        </div>
                        <div className="flex h-44 w-full items-end justify-center gap-1.5 rounded-xl bg-slate-50/70 px-1.5 pb-2">
                          <div
                            title={`Kiếm được: ${money(bucket.gross_revenue)}đ`}
                            style={{ height: `${bucket.gross_revenue > 0 ? grossH : 4}px` }}
                            className="w-3 rounded-t-md bg-indigo-500/85 transition-all"
                          />
                          <div
                            title={`Thực nhận: ${money(bucket.net_revenue)}đ`}
                            style={{ height: `${bucket.net_revenue > 0 ? netH : 4}px` }}
                            className="w-3 rounded-t-md bg-emerald-500 transition-all"
                          />
                        </div>
                        <div className="text-center">
                          <p className="text-[11px] font-extrabold text-slate-700">{bucket.short_label}</p>
                          <p className="text-[10px] font-semibold text-slate-400">{bucket.sessions_taught} buổi</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Tutor Coach */}
            <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/50 p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-extrabold text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Cố vấn gia sư
                  </span>
                  {aiInsights && (
                    <span className="text-xs font-extrabold text-indigo-700">
                      Điểm hiệu suất: {aiInsights.health_score}/100
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {aiInsights ? aiInsights.headline : 'Phân tích hiệu suất & gợi ý tăng thu nhập'}
                </h3>

                {!aiInsights ? (
                  <p className="text-xs leading-relaxed text-slate-600">
                    Trợ lý AI sẽ đánh giá doanh thu thực nhận, tần suất mở lớp online và điểm đánh giá trong kỳ {data?.period?.label} để đề xuất cách cải thiện thứ hạng của bạn.
                  </p>
                ) : (
                  <div className="space-y-3 text-xs">
                    {aiInsights.strengths?.length > 0 && (
                      <div>
                        <p className="font-extrabold uppercase text-emerald-700 mb-1">Điểm mạnh</p>
                        <ul className="space-y-1 text-slate-700">
                          {aiInsights.strengths.map((s: string, idx: number) => (
                            <li key={idx}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiInsights.improvement_actions?.length > 0 && (
                      <div>
                        <p className="font-extrabold uppercase text-indigo-700 mb-1">Đề xuất hành động</p>
                        <ul className="space-y-1 text-slate-700">
                          {aiInsights.improvement_actions.map((a: string, idx: number) => (
                            <li key={idx}>• {a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={loadingAi}
                onClick={handleGenerateAiInsights}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {loadingAi ? 'AI đang phân tích...' : aiInsights ? 'Phân tích lại với kỳ hiện tại' : 'Nhờ AI phân tích hiệu suất'}
              </button>
            </div>
          </div>

          {/* Courses & Online Classes Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1-1 Courses */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  Khóa học 1-1 trong kỳ ({courses.length})
                </h2>
              </div>
              {courses.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Không có khóa học 1-1 phát sinh trong kỳ này.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pagedCourses.pagedItems.map((c: any) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-slate-900">{c.title}</p>
                        <p className="text-xs text-slate-500">
                          HV: {c.student_name} · {c.subject_name} · Đã dạy trong kỳ: <strong>{c.sessions_taught_in_period}</strong>/{c.total_sessions} buổi
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-emerald-600">{money(c.net_amount)}đ</p>
                        <p className="text-[11px] text-slate-400">Gộp {money(c.total_amount)}đ</p>
                      </div>
                    </div>
                  ))}
                  <Pagination
                    currentPage={pagedCourses.currentPage}
                    totalCount={pagedCourses.totalCount}
                    pageSize={pagedCourses.pageSize}
                    totalPages={pagedCourses.totalPages}
                    onPageChange={setCoursesPage}
                  />
                </div>
              )}
            </div>

            {/* Online Group Classes */}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Video className="h-4 w-4 text-emerald-600" />
                  Lớp dạy online trong kỳ ({onlineClasses.length})
                </h2>
              </div>
              {onlineClasses.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Chưa có lớp online nào hoạt động trong kỳ này.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pagedClasses.pagedItems.map((oc: any) => (
                    <div key={oc.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-slate-900">{oc.title}</p>
                        <p className="text-xs text-slate-500">
                          {oc.subject_name} · Sĩ số: {oc.active_students}/{oc.max_students} HV · Dạy trong kỳ: <strong>{oc.sessions_taught_in_period}</strong> buổi
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-emerald-600">{money(oc.revenue_in_period)}đ</p>
                        <p className="text-[11px] text-slate-400">Doanh thu kỳ</p>
                      </div>
                    </div>
                  ))}
                  <Pagination
                    currentPage={pagedClasses.currentPage}
                    totalCount={pagedClasses.totalCount}
                    pageSize={pagedClasses.pageSize}
                    totalPages={pagedClasses.totalPages}
                    onPageChange={setClassesPage}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Reviews in Period */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Đánh giá từ học viên trong kỳ ({reviews.length})
            </h2>
            {reviews.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Chưa có đánh giá mới nào trong kỳ này.</p>
            ) : (
              <>
              <div className="grid gap-3 md:grid-cols-2">
                {pagedReviews.pagedItems.map((rev: any) => (
                  <div key={rev.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-slate-900">{rev.student_name}</p>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-700">
                        {rev.rating} ★
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-indigo-600">{rev.source} · {rev.title}</p>
                    <p className="text-xs text-slate-600">{rev.comment}</p>
                    <p className="text-[11px] text-slate-400">
                      Ngày tạo: {new Date(rev.created_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                ))}
              </div>
              <Pagination
                currentPage={pagedReviews.currentPage}
                totalCount={pagedReviews.totalCount}
                pageSize={pagedReviews.pageSize}
                totalPages={pagedReviews.totalPages}
                onPageChange={setReviewsPage}
              />
              </>
            )}
          </div>

          {/* Revenue Leaderboard (Independent Tháng / Quý / Năm Selector) */}
          <div className="rounded-3xl border border-slate-100 bg-white p-6 space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Bảng xếp hạng doanh thu gia sư ({leaderboard.period?.label})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn riêng theo tháng, quý hoặc năm để theo dõi thứ hạng doanh thu trên toàn nền tảng.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {(
                    [
                      { value: 'month', label: 'Tháng' },
                      { value: 'quarter', label: 'Quý' },
                      { value: 'year', label: 'Năm' },
                    ] as { value: RankingMode; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRankingMode(opt.value)}
                      className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                        rankingMode === opt.value ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {rankingMode === 'month' && (
                  <select
                    value={rankingMonth}
                    onChange={(e) => setRankingMonth(Number(e.target.value))}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                )}

                {rankingMode === 'quarter' && (
                  <select
                    value={rankingQuarter}
                    onChange={(e) => setRankingQuarter(Number(e.target.value))}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>Quý {q}</option>
                    ))}
                  </select>
                )}

                <select
                  value={rankingYear}
                  onChange={(e) => setRankingYear(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  {Array.from(new Set(yearOptions)).map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>
            </div>

            {myRank && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white font-black">
                    #{myRank.rank}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      Thứ hạng của bạn: #{myRank.rank} / {leaderboard.total_tutors} gia sư
                    </p>
                    <p className="text-xs text-slate-600">
                      {myRank.sessions_taught} buổi dạy · Rating {(myRank.rating_avg || 0).toFixed(1)}★ ({myRank.total_reviews || 0} đánh giá)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-500">Kiếm được</p>
                    <p className="text-sm font-extrabold text-slate-900">{money(myRank.gross_revenue)}đ</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase text-slate-500">Thực nhận</p>
                    <p className="text-sm font-extrabold text-emerald-700">{money(myRank.net_revenue)}đ</p>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Hạng</th>
                    <th className="px-4 py-3">Gia sư</th>
                    <th className="px-4 py-3 text-center">Số buổi dạy</th>
                    <th className="px-4 py-3 text-right">Doanh thu gộp</th>
                    <th className="px-4 py-3 text-right">Thực nhận</th>
                    <th className="px-4 py-3 text-center">Đánh giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRankings.pagedItems.map((row: any) => {
                    const isMe = myRank && row.tutor_id === myRank.tutor_id;
                    return (
                      <tr key={row.tutor_id} className={isMe ? 'bg-emerald-50/60' : 'hover:bg-slate-50/70'}>
                        <td className="px-4 py-3 font-extrabold">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${
                            row.rank === 1 ? 'bg-amber-400 text-white' :
                            row.rank === 2 ? 'bg-slate-300 text-slate-800' :
                            row.rank === 3 ? 'bg-amber-700 text-white' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {row.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-extrabold text-slate-900">
                            {row.full_name} {isMe && <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">Bạn</span>}
                          </p>
                          <p className="text-xs text-slate-400">{(row.subjects || []).join(', ')}</p>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">{row.sessions_taught} buổi</td>
                        <td className="px-4 py-3 text-right font-extrabold text-slate-900">{money(row.gross_revenue)}đ</td>
                        <td className="px-4 py-3 text-right font-extrabold text-emerald-600">{money(row.net_revenue)}đ</td>
                        <td className="px-4 py-3 text-center font-bold text-amber-600">
                          <span className="inline-flex items-center gap-1">
                            <Award className="h-3.5 w-3.5" />
                            {(row.rating_avg || 0).toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={pagedRankings.currentPage}
              totalCount={pagedRankings.totalCount}
              pageSize={pagedRankings.pageSize}
              totalPages={pagedRankings.totalPages}
              onPageChange={setRankingsPage}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default TutorAnalytics;
