import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bell } from 'lucide-react';
import { adminApi } from '../../api/admin';

const NOTIFICATION_ITEMS: Record<string, { label: string; desc: string; path: string }> = {
  pending_tutors: {
    label: 'Hồ sơ gia sư chờ duyệt',
    desc: 'Kiểm tra kết quả AI Review và xét duyệt gia sư mới.',
    path: '/admin/tutor-approvals',
  },
  pending_payments: {
    label: 'Thanh toán đang chờ PayOS',
    desc: 'Các booking đang chờ hoàn tất thanh toán cọc.',
    path: '/admin/payments',
  },
  failed_payments: {
    label: 'Thanh toán gặp lỗi',
    desc: 'Giao dịch cọc PayOS bị lỗi cần đối soát.',
    path: '/admin/payments',
  },
  overdue_commissions: {
    label: 'Commission quá hạn',
    desc: 'Gia sư có khoản nợ hoa hồng vượt quá hạn thanh toán.',
    path: '/admin/finance',
  },
  low_reviews: {
    label: 'Đánh giá thấp (≤ 2 sao)',
    desc: 'Phản hồi điểm thấp từ học viên cần kiểm duyệt.',
    path: '/admin/reviews',
  },
};

export const AdminNotifications: React.FC = () => {
  const [data, setData] = useState<any>(null);
  useEffect(() => { adminApi.getNotifications().then(setData).catch(() => setData({})); }, []);
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600"><Bell className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Thông báo vận hành</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Các tín hiệu cần admin kiểm tra và xử lý trong hệ thống.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(data || {}).map(([key, value]) => {
        const meta = NOTIFICATION_ITEMS[key];
        const count = Number(value || 0);
        return (
          <Link
            key={key}
            to={meta?.path || '/admin/dashboard'}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${count > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
                <p className="text-sm font-black text-slate-800">{meta?.label || key}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
            </div>
            <p className="mt-3 text-3xl font-black text-slate-900">{String(value)}</p>
            {meta?.desc && <p className="mt-2 text-xs font-medium text-slate-500">{meta.desc}</p>}
          </Link>
        );
      })}</div>
    </div>
  );
};
