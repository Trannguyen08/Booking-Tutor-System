import React from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  GraduationCap,
  ShieldAlert,
  Trophy,
  Video,
  XCircle,
} from 'lucide-react';
import TutorManagement from './TutorManagement';
import AdminCourseManagement from './CourseManagement';
import AdminOnlineClassManagement from './OnlineClassManagement';
import CancellationManagement from './CancellationManagement';
import AdminFinanceManagement from './FinanceManagement';
import AdminTutorRankings from './TutorRankings';
import {
  BookingManagement,
  PaymentManagement,
  ReportManagement,
  SlotManagement,
} from './Operations';

interface TabItem {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const WorkspaceTabs: React.FC<{ tabs: TabItem[]; activeKey: string }> = ({ tabs, activeKey }) => (
  <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm w-fit">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const active = tab.key === activeKey;
      return (
        <Link
          key={tab.key}
          to={tab.path}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
            active
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{tab.label}</span>
        </Link>
      );
    })}
  </div>
);

export const AdminTutorsWorkspace: React.FC<{ mode: 'management' | 'approval' }> = ({ mode }) => (
  <div>
    <WorkspaceTabs
      activeKey={mode}
      tabs={[
        { key: 'management', label: 'Quản lý gia sư', path: '/admin/tutors', icon: GraduationCap },
        { key: 'approval', label: 'Duyệt hồ sơ gia sư', path: '/admin/tutor-approvals', icon: ShieldAlert },
      ]}
    />
    <TutorManagement mode={mode} />
  </div>
);

export const AdminBookingsWorkspace: React.FC<{ tab: 'bookings' | 'slots' }> = ({ tab }) => (
  <div>
    <WorkspaceTabs
      activeKey={tab}
      tabs={[
        { key: 'bookings', label: 'Đặt lịch (Booking)', path: '/admin/bookings', icon: CalendarClock },
        { key: 'slots', label: 'Lịch dạy & Slot', path: '/admin/slots', icon: CalendarClock },
      ]}
    />
    {tab === 'bookings' ? <BookingManagement /> : <SlotManagement />}
  </div>
);

export const AdminClassesWorkspace: React.FC<{ tab: 'classes' | 'online' | 'cancellations' }> = ({ tab }) => (
  <div>
    <WorkspaceTabs
      activeKey={tab}
      tabs={[
        { key: 'classes', label: 'Khóa học 1-1', path: '/admin/classes', icon: BookOpen },
        { key: 'online', label: 'Lớp học online', path: '/admin/online-classes', icon: Video },
        { key: 'cancellations', label: 'Yêu cầu hủy khóa', path: '/admin/course-cancellations', icon: XCircle },
      ]}
    />
    {tab === 'classes' ? (
      <AdminCourseManagement />
    ) : tab === 'online' ? (
      <AdminOnlineClassManagement />
    ) : (
      <CancellationManagement />
    )}
  </div>
);

export const AdminFinanceWorkspace: React.FC<{ tab: 'finance' | 'payments' }> = ({ tab }) => (
  <div>
    <WorkspaceTabs
      activeKey={tab}
      tabs={[
        { key: 'finance', label: 'Quản lý dòng tiền', path: '/admin/finance', icon: CircleDollarSign },
        { key: 'payments', label: 'Đối soát thanh toán PayOS', path: '/admin/payments', icon: CreditCard },
      ]}
    />
    {tab === 'finance' ? <AdminFinanceManagement /> : <PaymentManagement />}
  </div>
);

export const AdminReportsWorkspace: React.FC<{ tab: 'reports' | 'rankings' }> = ({ tab }) => (
  <div>
    <WorkspaceTabs
      activeKey={tab}
      tabs={[
        { key: 'reports', label: 'Báo cáo doanh thu & Lợi nhuận', path: '/admin/reports', icon: BarChart3 },
        { key: 'rankings', label: 'BXH Gia sư', path: '/admin/tutor-rankings', icon: Trophy },
      ]}
    />
    {tab === 'reports' ? <ReportManagement /> : <AdminTutorRankings />}
  </div>
);
