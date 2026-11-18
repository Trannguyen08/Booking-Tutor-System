import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  FileBarChart,
  RefreshCcw,
  Search,
  Settings,
  ShieldAlert,
  Star,
  XCircle,
} from 'lucide-react';
import { adminApi } from '../../api/admin';
import { formatCurrency, formatDate } from '../../utils/format';
import { Pagination, useClientPagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/Toast';

const toArray = (data: any) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, index) => currentYear - index);

const PageTitle = ({ icon: Icon, title, subtitle }: any) => (
  <div className="flex items-start gap-3">
    <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Icon className="h-5 w-5" /></div>
    <div>
      <h1 className="text-2xl font-black text-slate-900">{title}</h1>
      <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
    </div>
  </div>
);

const Badge = ({ value, tone = 'slate' }: { value: string; tone?: string }) => {
  const tones: Record<string, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black ${tones[tone] || tones.slate}`}>{value}</span>;
};

const Toolbar = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 border-b border-slate-100 p-4 lg:grid-cols-[1fr_repeat(3,150px)]">{children}</div>
);

const SearchInput = ({ value, onChange, placeholder }: any) => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-blue-100"
    />
  </div>
);

const Select = (props: any) => (
  <select {...props} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none" />
);

const slotStatusLabels: Record<string, string> = {
  available: 'Còn trống',
  booked: 'Đã đặt',
  cancelled: 'Đã hủy',
};

export const SlotManagement: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); adminApi.getSlots({ search: search || undefined, status, upcoming: 'true' }).then(data => setItems(toArray(data))).catch(() => setItems([])); }, [search, status]);
  const pagedSlots = useClientPagination(items, page, 10);
  return (
    <div className="space-y-6">
      <PageTitle icon={CalendarClock} title="Lịch dạy và slot" subtitle="Xem slot sắp diễn ra, slot đã đặt, link học và trạng thái booking." />
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Toolbar><SearchInput value={search} onChange={setSearch} placeholder="Tìm gia sư, môn học, meeting link..." /><Select value={status} onChange={(e: any) => setStatus(e.target.value)}><option value="all">Mọi slot</option><option value="available">Còn trống</option><option value="booked">Đã đặt</option><option value="cancelled">Đã hủy</option></Select><div /><div /></Toolbar>
        {pagedSlots.pagedItems.length === 0 ? (
          <div className="p-12 text-center font-semibold text-slate-400">Không có lịch slot phù hợp.</div>
        ) : (
          <div className="grid gap-3 p-4 xl:grid-cols-2">{pagedSlots.pagedItems.map(item => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{item.tutor_name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.subject_name || 'Môn học'} · {new Date(item.start_time).toLocaleString('vi-VN')}</p></div><Badge value={slotStatusLabels[item.status] || item.status} tone={item.status === 'booked' ? 'green' : item.status === 'cancelled' ? 'rose' : 'blue'} /></div>
              <p className="mt-3 text-sm font-semibold text-slate-600">{formatCurrency(Number(item.price || 0))} · Booking #{item.booking_id || '---'} · {item.payment_status || '---'}</p>
              <p className="mt-2 truncate text-xs text-slate-400">{item.meeting_link || 'Chưa có meeting link'}</p>
            </div>
          ))}</div>
        )}
        <div className="px-4 pb-4">
          <Pagination
            currentPage={pagedSlots.currentPage}
            totalCount={pagedSlots.totalCount}
            pageSize={pagedSlots.pageSize}
            totalPages={pagedSlots.totalPages}
            onPageChange={setPage}
          />
        </div>
      </section>
    </div>
  );
};
