import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  Coins,
  Download,
  FileBarChart,
  RefreshCcw,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { adminApi } from '../../api/admin';
import { formatCurrency } from '../../utils/format';
import { useToast } from '../../components/ui/Toast';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, index) => currentYear - index);

export const ReportManagement: React.FC = () => {
  const now = new Date();
  const [data, setData] = useState<any>(null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { showToast } = useToast();

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getReports({ month, year });
      setData(res);
    } catch {
      showToast('Không tải được báo cáo tài chính & vận hành.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const blob = await adminApi.downloadReportCsv({ month, year });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `admin-report-${year}-${String(month).padStart(2, '0')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Đã xuất file báo cáo CSV.', 'success');
    } catch {
      showToast('Không thể tải file CSV báo cáo.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const rp = data?.revenue_and_profit || {};
  const bookings = data?.bookings || {};
  const courses = data?.courses || {};
  const finance = data?.finance || {};
  const quality = data?.quality || {};
  const series: any[] = data?.monthly_series || [];
  const maxChartVal = Math.max(
    1,
    ...series.map((item) => Math.max(Number(item.total_revenue || 0), Number(item.system_profit || 0))),
  );
  const feePct = Math.round(Number(data?.selected?.commission_rate ?? 0.15) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
            <FileBarChart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Báo cáo doanh thu & Vận hành hệ thống</h1>
            <p className="mt-1 text-sm text-slate-500">
              Tổng hợp doanh thu nền tảng (1-1 & lớp online), lợi nhuận ròng, hoàn tiền và chỉ số chất lượng.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((item) => (
              <option key={item} value={item}>Tháng {item}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 outline-none"
          >
            {years.map((item) => (
              <option key={item} value={item}>Năm {item}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Làm mới
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {downloading ? 'Đang xuất...' : 'Xuất CSV'}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-14 text-center text-sm font-semibold text-slate-400">
          Đang tổng hợp báo cáo tài chính hệ thống...
        </div>
      ) : (
        <>
          {/* 4 Hero KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 to-blue-700 p-6 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-indigo-100">Tổng doanh thu hệ thống</span>
                <Coins className="h-5 w-5 text-indigo-100" />
              </div>
              <p className="mt-3 text-2xl font-black">{formatCurrency(Number(rp.total_system_revenue || 0))}</p>
              <p className="mt-1.5 text-xs text-indigo-100">
                1-1: {formatCurrency(Number(rp.booking_revenue || 0))} · Online: {formatCurrency(Number(rp.online_class_revenue || 0))}
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-emerald-100">Lợi nhuận hệ thống</span>
                <TrendingUp className="h-5 w-5 text-emerald-100" />
              </div>
              <p className="mt-3 text-2xl font-black">{formatCurrency(Number(rp.system_profit || 0))}</p>
              <p className="mt-1.5 text-xs text-emerald-100">
                Hoa hồng 1-1: {formatCurrency(Number(rp.commission_collected || 0))} + Phí online ({feePct}%): {formatCurrency(Number(rp.online_platform_fee || 0))}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-400">Hoàn tiền & Chi trả cọc</span>
                <span className="rounded-xl bg-rose-50 p-2 text-rose-600"><Wallet className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-black text-rose-600">
                {formatCurrency(Number(rp.total_refunds || 0) + Number(rp.tutor_payouts_paid || 0))}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                Hoàn học viên: {formatCurrency(Number(rp.total_refunds || 0))} · Trả gia sư: {formatCurrency(Number(rp.tutor_payouts_paid || 0))}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase text-slate-400">Dòng tiền ròng & Chất lượng</span>
                <span className="rounded-xl bg-amber-50 p-2 text-amber-500"><Star className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-900">{formatCurrency(Number(rp.net_cashflow || 0))}</p>
              <p className="mt-1.5 text-xs text-slate-500">
                {quality.reviews || 0} đánh giá mới · {quality.low_reviews || 0} đánh giá ≤ 2★
              </p>
            </div>
          </div>

          {/* 12-month Chart */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  Biểu đồ Doanh thu & Lợi nhuận năm {year}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  So sánh tổng doanh thu giao dịch qua nền tảng (xanh dương) và lợi nhuận hệ thống (xanh ngọc) theo từng tháng.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-3 w-3 rounded bg-indigo-500 inline-block" /> Doanh thu hệ thống
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-3 w-3 rounded bg-emerald-500 inline-block" /> Lợi nhuận hệ thống
                </span>
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2.5 pt-2">
              {series.map((bucket: any) => {
                const revH = Math.max(4, Math.round((Number(bucket.total_revenue || 0) / maxChartVal) * 150));
                const profH = Math.max(4, Math.round((Number(bucket.system_profit || 0) / maxChartVal) * 150));
                const isSelected = Number(bucket.month) === Number(month);
                return (
                  <div
                    key={bucket.month}
                    onClick={() => setMonth(Number(bucket.month))}
                    className={`group cursor-pointer rounded-2xl p-2 flex flex-col items-center gap-1.5 transition ${
                      isSelected ? 'bg-indigo-50/80 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex h-40 w-full items-end justify-center gap-1">
                      <div
                        title={`T${bucket.month} Doanh thu: ${formatCurrency(Number(bucket.total_revenue || 0))}`}
                        style={{ height: `${bucket.total_revenue > 0 ? revH : 4}px` }}
                        className="w-2.5 rounded-t bg-indigo-500 transition-all"
                      />
                      <div
                        title={`T${bucket.month} Lợi nhuận: ${formatCurrency(Number(bucket.system_profit || 0))}`}
                        style={{ height: `${bucket.system_profit > 0 ? profH : 4}px` }}
                        className="w-2.5 rounded-t bg-emerald-500 transition-all"
                      />
                    </div>
                    <p className={`text-[11px] font-black ${isSelected ? 'text-indigo-700' : 'text-slate-600'}`}>
                      {bucket.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Detailed Structured Cards */}
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                Đặt lịch (Booking 1-1)
              </h3>
              <MetricRow label="Tổng số booking" value={bookings.total || 0} />
              <MetricRow label="Đã thanh toán" value={bookings.paid || 0} highlight="text-emerald-600" />
              <MetricRow label="Đã hủy" value={bookings.cancelled || 0} highlight="text-rose-600" />
              <MetricRow label="Doanh thu booking" value={formatCurrency(Number(bookings.revenue || 0))} />
              <MetricRow label="Tiền cọc đã thu" value={formatCurrency(Number(bookings.deposit || 0))} />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                <BookOpen className="h-4 w-4 text-emerald-600" />
                Khóa học & Lớp online
              </h3>
              <MetricRow label="Khóa 1-1 tạo mới" value={courses.total || 0} />
              <MetricRow label="Đang giảng dạy" value={courses.active || 0} highlight="text-indigo-600" />
              <MetricRow label="Đã hoàn thành" value={courses.completed || 0} highlight="text-emerald-600" />
              <MetricRow label="Đã hủy" value={courses.cancelled || 0} highlight="text-rose-600" />
              <MetricRow label="Lớp nhóm online mới" value={courses.online_classes_total || 0} />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                <Wallet className="h-4 w-4 text-amber-600" />
                Tài chính nền tảng
              </h3>
              <MetricRow label="Hoa hồng phát sinh" value={formatCurrency(Number(finance.commission || 0))} />
              <MetricRow label="Hoa hồng đã thu" value={formatCurrency(Number(finance.commission_paid || 0))} highlight="text-emerald-600" />
              <MetricRow label="Phí lớp online (tạm tính)" value={formatCurrency(Number(rp.online_platform_fee || 0))} highlight="text-emerald-600" />
              <MetricRow label="Nợ hoa hồng hiện tại" value={formatCurrency(Number(finance.commission_debt || 0))} highlight="text-rose-600" />
              <MetricRow label="Tổng cọc bảo chứng đang giữ" value={formatCurrency(Number(finance.deposit_balance || 0))} />
            </section>
          </div>
        </>
      )}
    </div>
  );
};

const MetricRow = ({ label, value, highlight = 'text-slate-900' }: { label: string; value: string | number; highlight?: string }) => (
  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
    <span className="text-xs font-bold text-slate-500">{label}</span>
    <span className={`text-sm font-black ${highlight}`}>{value}</span>
  </div>
);

export default ReportManagement;
