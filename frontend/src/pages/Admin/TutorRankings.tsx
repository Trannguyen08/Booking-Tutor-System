import React, { useEffect, useState } from 'react';
import {
  Ban,
  MessageSquareWarning,
  Sparkles,
  TrendingDown,
  Trophy,
  Unlock,
  X,
} from 'lucide-react';
import { adminApi } from '../../api/admin';
import { aiApi } from '../../api/ai';
import { Pagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';

const money = (value: number | string | undefined) =>
  Math.round(Number(value || 0)).toLocaleString('vi-VN');

type RankingMode = 'month' | 'quarter' | 'year';

const TutorRankings: React.FC = () => {
  const { showToast } = useToast();
  const today = new Date();
  const [mode, setMode] = useState<RankingMode>('month');
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.floor(today.getMonth() / 3) + 1);
  const [activeTab, setActiveTab] = useState<'top' | 'poor'>('top');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // AI Insight Modal for Poor Revenue Tutor
  const [aiTarget, setAiTarget] = useState<any>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Violation / Warning Case Modal
  const [caseTarget, setCaseTarget] = useState<any>(null);
  const [caseTitle, setCaseTitle] = useState('');
  const [caseDesc, setCaseDesc] = useState('');
  const [creatingCase, setCreatingCase] = useState(false);

  const loadRankings = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getTutorRankings({ mode, year, month, quarter });
      setData(res);
    } catch {
      showToast('Không thể tải bảng xếp hạng doanh thu gia sư.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRankings();
  }, [mode, year, month, quarter]);

  const handleAnalyzeTutor = async (row: any) => {
    setAiTarget(row);
    setAiResult(null);
    setLoadingAi(true);
    try {
      const res = await aiApi.performanceInsights({
        scope: 'admin_poor_tutor',
        tutor_name: row.full_name,
        period_label: data?.period?.label || '',
        subjects: row.subjects || [],
        gross_revenue: row.gross_revenue || 0,
        net_revenue: row.net_revenue || 0,
        sessions_taught: row.sessions_taught || 0,
        rating_avg: row.rating_avg || 0,
        total_reviews: row.total_reviews || 0,
        open_cases_count: row.open_cases_count || 0,
      });
      setAiResult(res);
    } catch {
      showToast('Không thể phân tích AI cho gia sư này.', 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  const openOutreachModal = (row: any, prefillMessage = '') => {
    setCaseTarget(row);
    setCaseTitle(`Trao đổi hiệu suất & doanh thu kỳ ${data?.period?.label || ''}`);
    setCaseDesc(
      prefillMessage ||
        `Chào ${row.full_name}, hệ thống ghi nhận doanh thu kỳ ${data?.period?.label || ''} đạt ${money(row.gross_revenue)}đ (${row.sessions_taught} buổi dạy). Admin mời trao đổi để hỗ trợ cải thiện hoạt động giảng dạy.`,
    );
  };

  const handleCreateOutreachCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseTarget) return;
    setCreatingCase(true);
    try {
      await adminApi.createViolation({
        title: caseTitle.trim(),
        description: caseDesc.trim(),
        severity: caseTarget.gross_revenue === 0 ? 'high' : 'medium',
        target_user: caseTarget.user_id,
      });
      showToast(`Đã tạo hồ sơ trao đổi/nhắc nhở tới gia sư ${caseTarget.full_name}.`, 'success');
      setCaseTarget(null);
      setAiTarget(null);
      await loadRankings();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không thể gửi trao đổi.', 'error');
    } finally {
      setCreatingCase(false);
    }
  };

  const handleRemoveOrToggleTutor = async (row: any, action: 'remove' | 'unlock') => {
    const confirmText =
      action === 'remove'
        ? `Xác nhận khóa/loại bỏ gia sư "${row.full_name}" khỏi nền tảng vì doanh thu & hoạt động kém?`
        : `Mở khóa lại tài khoản gia sư "${row.full_name}"?`;
    if (!window.confirm(confirmText)) return;

    try {
      if (row.user_tutor_profile_id) {
        await adminApi.tutorAction(row.user_tutor_profile_id, action, {
          reason:
            action === 'remove'
              ? `Doanh thu kém trong ${data?.period?.label || 'kỳ đánh giá'} (${money(row.gross_revenue)}đ)`
              : '',
        });
      } else {
        await adminApi.userAction(row.user_id, action === 'remove' ? 'lock' : 'unlock');
      }
      showToast(
        action === 'remove' ? `Đã loại bỏ/khóa gia sư ${row.full_name}.` : `Đã mở khóa gia sư ${row.full_name}.`,
        'success',
      );
      setAiTarget(null);
      await loadRankings();
    } catch {
      showToast('Không thể cập nhật trạng thái gia sư.', 'error');
    }
  };

  const yearOptions = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
  const topList: any[] = data?.top_rankings || [];
  const poorList: any[] = data?.poor_rankings || [];
  const summary = data?.summary || {};

  return (
    <div className="space-y-6">
      {/* Header + Period Selectors */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Bảng xếp hạng doanh thu gia sư</h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi gia sư doanh thu cao và rà soát gia sư doanh thu kém để trao đổi hoặc loại bỏ khỏi nền tảng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
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
                onClick={() => setMode(opt.value)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition ${
                  mode === opt.value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'month' && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
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
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>Quý {q}</option>
              ))}
            </select>
          )}

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>Năm {y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Tổng doanh thu kỳ {data?.period?.label}</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{money(summary.total_platform_gross)}đ</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Tổng thực nhận gia sư</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600">{money(summary.total_platform_net)}đ</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Gia sư có phát sinh thu nhập</p>
          <p className="mt-2 text-2xl font-extrabold text-blue-600">{summary.active_earning_tutors || 0} / {data?.total_tutors || 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold uppercase text-slate-400">Gia sư doanh thu 0đ</p>
          <p className="mt-2 text-2xl font-extrabold text-rose-600">{summary.zero_revenue_tutors || 0} gia sư</p>
        </div>
      </div>

      {/* Leaderboard Switcher */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { setActiveTab('top'); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold transition ${
            activeTab === 'top'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Trophy className="h-4 w-4" />
          BXH Gia sư Doanh thu cao ({topList.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('poor'); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold transition ${
            activeTab === 'poor'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          BXH Gia sư Doanh thu kém ({poorList.length})
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm font-semibold text-slate-400">Đang tải dữ liệu xếp hạng...</div>
        ) : activeTab === 'top' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-extrabold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Hạng</th>
                  <th className="px-4 py-3">Gia sư</th>
                  <th className="px-4 py-3 text-center">Số buổi</th>
                  <th className="px-4 py-3 text-right">Học 1-1</th>
                  <th className="px-4 py-3 text-right">Lớp online</th>
                  <th className="px-4 py-3 text-right">Tổng doanh thu</th>
                  <th className="px-4 py-3 text-right">Thực nhận</th>
                  <th className="px-4 py-3 text-center">Đánh giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topList.slice((page - 1) * 10, page * 10).map((row: any) => (
                  <tr key={row.tutor_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
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
                      <p className="font-extrabold text-slate-900">{row.full_name}</p>
                      <p className="text-xs text-slate-400">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{row.sessions_taught} buổi</td>
                    <td className="px-4 py-3 text-right text-slate-700">{money(row.booking_revenue)}đ</td>
                    <td className="px-4 py-3 text-right text-slate-700">{money(row.online_class_revenue)}đ</td>
                    <td className="px-4 py-3 text-right font-extrabold text-slate-900">{money(row.gross_revenue)}đ</td>
                    <td className="px-4 py-3 text-right font-extrabold text-emerald-600">{money(row.net_revenue)}đ</td>
                    <td className="px-4 py-3 text-center font-bold text-amber-600">{(row.rating_avg || 0).toFixed(1)} ★</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 pb-4">
              <Pagination
                currentPage={page}
                totalCount={topList.length}
                pageSize={10}
                onPageChange={setPage}
              />
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-rose-50/70 text-xs font-extrabold uppercase text-rose-700">
                <tr>
                  <th className="px-4 py-3">Mức ưu tiên</th>
                  <th className="px-4 py-3">Gia sư</th>
                  <th className="px-4 py-3 text-center">Buổi dạy</th>
                  <th className="px-4 py-3 text-right">Doanh thu kỳ</th>
                  <th className="px-4 py-3 text-center">Rating / Cảnh báo</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {poorList.slice((page - 1) * 10, page * 10).map((row: any) => (
                  <tr key={row.tutor_id} className="hover:bg-rose-50/20">
                    <td className="px-4 py-3 font-extrabold text-rose-600">#{row.poor_rank}</td>
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-slate-900">{row.full_name}</p>
                      <p className="text-xs text-slate-400">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{row.sessions_taught} buổi</td>
                    <td className="px-4 py-3 text-right font-extrabold text-rose-600">{money(row.gross_revenue)}đ</td>
                    <td className="px-4 py-3 text-center text-xs">
                      <span className="font-bold text-slate-700">{(row.rating_avg || 0).toFixed(1)} ★</span>
                      {row.open_cases_count > 0 && (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                          {row.open_cases_count} case mở
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {!row.is_active ? (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">Đã khóa/Loại bỏ</span>
                      ) : row.performance_flag === 'critical' ? (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">Doanh thu 0đ</span>
                      ) : row.performance_flag === 'warning' ? (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Cần nhắc nhở</span>
                      ) : (
                        <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Ổn định</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAnalyzeTutor(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          AI Phân tích
                        </button>
                        <button
                          type="button"
                          onClick={() => openOutreachModal(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                        >
                          <MessageSquareWarning className="h-3.5 w-3.5" />
                          Trao đổi
                        </button>
                        {row.is_active ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveOrToggleTutor(row, 'remove')}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Loại bỏ
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveOrToggleTutor(row, 'unlock')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                          >
                            <Unlock className="h-3.5 w-3.5" />
                            Mở khóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 pb-4">
              <Pagination
                currentPage={page}
                totalCount={poorList.length}
                pageSize={10}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </div>

      {/* AI Risk / Coaching Evaluation Modal */}
      {aiTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-extrabold text-white">
                  <Sparkles className="h-3 w-3" />
                  AI Đánh giá rủi ro & đề xuất xử lý
                </span>
                <h3 className="mt-1.5 text-lg font-extrabold text-slate-900">{aiTarget.full_name}</h3>
              </div>
              <button type="button" onClick={() => setAiTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingAi || !aiResult ? (
              <div className="py-10 text-center text-sm font-semibold text-slate-400">
                AI đang phân tích dữ liệu doanh thu & đánh giá gia sư...
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">Đánh giá tổng quan</p>
                    <p className="font-extrabold text-slate-900 mt-0.5">{aiResult.headline}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                    aiResult.risk_level === 'high' ? 'bg-rose-100 text-rose-700' :
                    aiResult.risk_level === 'medium' ? 'bg-amber-100 text-amber-800' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {aiResult.health_score}/100
                  </span>
                </div>

                <div>
                  <p className="text-xs font-extrabold uppercase text-slate-500 mb-1">Khuyến nghị hành động</p>
                  <ul className="space-y-1 text-xs text-slate-700">
                    {(aiResult.improvement_actions || []).map((a: string, idx: number) => (
                      <li key={idx}>• {a}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs">
                  <p className="font-extrabold text-indigo-800 mb-1">Thư mời trao đổi gợi ý từ AI:</p>
                  <p className="text-slate-700 leading-relaxed">{aiResult.outreach_message}</p>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => openOutreachModal(aiTarget, aiResult.outreach_message)}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-white hover:bg-amber-600"
                  >
                    Dùng mẫu này mở hồ sơ trao đổi
                  </button>
                  {aiTarget.is_active && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOrToggleTutor(aiTarget, 'remove')}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-700"
                    >
                      Loại bỏ khỏi nền tảng
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outreach / Warning ViolationCase Modal */}
      {caseTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={handleCreateOutreachCase} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-extrabold text-slate-900">
                Gửi trao đổi / nhắc nhở: {caseTarget.full_name}
              </h3>
              <button type="button" onClick={() => setCaseTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Tiêu đề</span>
              <input
                required
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500">Nội dung trao đổi</span>
              <textarea
                rows={4}
                required
                value={caseDesc}
                onChange={(e) => setCaseDesc(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none resize-none"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCaseTarget(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
                Hủy
              </button>
              <button type="submit" disabled={creatingCase} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                {creatingCase ? 'Đang gửi...' : 'Gửi thông báo trao đổi'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TutorRankings;
