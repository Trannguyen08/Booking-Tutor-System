import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import Header from './components/layout/Header/Header';
import Footer from './components/layout/Footer/Footer';
import Login from './pages/Auth/Login';
import StudentRegister from './pages/Auth/StudentRegister';
import TutorRegister from './pages/Auth/TutorRegister';
import TutorRegisterSuccess from './pages/Auth/TutorRegisterSuccess';
import VerifyOTP from './pages/Auth/VerifyOTP';
import ForgotPassword from './pages/Auth/ForgotPassword';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { ToastProvider } from './components/ui/Toast';

import Home from './pages/Home';
import FindTutors from './pages/FindTutors';
import TutorDetail from './pages/TutorDetail';
import TutorBooking from './pages/TutorBooking';
import TutorLayout from './components/layout/TutorLayout';
import TutorDashboard from './pages/TutorDashboard';
import TutorSchedule from './pages/TutorSchedule';
import TutorStudents from './pages/TutorStudents';
import TutorSettings from './pages/TutorSettings';
import TutorBookings from './pages/TutorBookings';
import TutorReviews from './pages/TutorReviews';
import TutorSupportCases from './pages/TutorSupportCases';
import StudyRooms from './pages/StudyRooms';
import Profile from './pages/Profile';
import InfoPage from './pages/InfoPage';
import NotFound from './pages/NotFound';
import OnlineClasses from './pages/OnlineClasses';
import OnlineClassDetail from './pages/OnlineClassDetail';
import TutorOnlineClasses from './pages/TutorOnlineClasses';
import TutorOnlineClassStudents from './pages/TutorOnlineClassStudents';
import TutorAnalytics from './pages/TutorAnalytics';

// Course Pages
import MyCourses from './pages/MyCourses';
import CourseDetail, { CourseSessionDetail } from './pages/CourseDetail';
import RegistrationHistory from './pages/RegistrationHistory';
import PaymentSuccess from './pages/PaymentSuccess';
import { TutorCourseList, TutorCourseDetail } from './pages/TutorCourseManagement';

// Admin Pages
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/Admin/Dashboard';
import UserManagement from './pages/Admin/UserManagement';
import {
  AdminBookingsWorkspace,
  AdminClassesWorkspace,
  AdminFinanceWorkspace,
  AdminReportsWorkspace,
  AdminTutorsWorkspace,
} from './pages/Admin/AdminWorkspaces';
import {
  AdminNotifications,
  ReviewManagement,
  SettingsManagement,
} from './pages/Admin/Operations';
import { getAccessToken, getStoredUser } from './utils/auth';

const ProtectedRoute: React.FC<{ role?: 'user' | 'tutor' | 'admin'; children: React.ReactElement }> = ({
  role,
  children,
}) => {
  const token = getAccessToken(role);
  const user = getStoredUser(role);
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (role === 'admin' && !user.is_staff && !user.is_superuser) {
    return <Navigate to="/" replace />;
  }
  if (role === 'tutor' && !user.is_tutor) {
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <Router>
        <ToastProvider>
        <div className="flex flex-col min-h-screen bg-white">
          <Routes>
            {/* Main Layout Pages */}
            <Route element={<><Header /><main className="flex-1 flex flex-col"><Outlet /></main><Footer /></>}>
              <Route path="/" element={<Home />} />
              <Route path="/find-tutors" element={<FindTutors />} />
              <Route path="/online-classes" element={<OnlineClasses />} />
              <Route path="/online-classes/:id" element={<OnlineClassDetail />} />
              <Route path="/tutor/:id" element={<TutorDetail />} />
              <Route path="/tutor/:id/book" element={<TutorBooking />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/register/student" element={<StudentRegister />} />
              <Route path="/register/tutor" element={<TutorRegister />} />
              <Route path="/register/tutor/success" element={<TutorRegisterSuccess />} />
              <Route path="/verify-otp" element={<VerifyOTP />} />

              {/* Info & Support Pages */}
              <Route path="/how-it-works" element={<InfoPage kind="how-it-works" />} />
              <Route path="/privacy" element={<InfoPage kind="privacy" />} />
              <Route path="/terms" element={<InfoPage kind="terms" />} />
              <Route path="/support" element={<InfoPage kind="support" />} />
              <Route path="/help" element={<InfoPage kind="help" />} />
              <Route path="/careers" element={<InfoPage kind="careers" />} />

              {/* Authenticated General & Student Pages */}
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/my-courses" element={<ProtectedRoute><MyCourses /></ProtectedRoute>} />
              <Route path="/my-courses/:id" element={<ProtectedRoute><CourseDetail /></ProtectedRoute>} />
              <Route path="/my-courses/:id/sessions/:sessionId" element={<ProtectedRoute><CourseSessionDetail /></ProtectedRoute>} />
              <Route path="/registration-history" element={<ProtectedRoute><RegistrationHistory /></ProtectedRoute>} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/study-rooms" element={<ProtectedRoute><StudyRooms /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Tutor Portal Pages (Custom Layout) */}
            <Route path="/tutor" element={<ProtectedRoute role="tutor"><TutorLayout /></ProtectedRoute>}>
              <Route path="dashboard" element={<TutorDashboard />} />
              <Route path="schedule" element={<TutorSchedule />} />
              <Route path="bookings" element={<TutorBookings />} />
              <Route path="students" element={<TutorStudents />} />
              <Route path="rooms" element={<Navigate to="/tutor/courses" replace />} />
              <Route path="reviews" element={<TutorReviews />} />
              <Route path="support" element={<TutorSupportCases />} />
              <Route path="settings" element={<TutorSettings />} />
              <Route path="courses" element={<TutorCourseList />} />
              <Route path="courses/:id" element={<TutorCourseDetail />} />
              <Route path="online-classes" element={<TutorOnlineClasses />} />
              <Route path="online-classes/:id/students" element={<TutorOnlineClassStudents />} />
              <Route path="analytics" element={<TutorAnalytics />} />
              <Route index element={<Navigate to="/tutor/dashboard" replace />} />
            </Route>

            {/* Admin Portal Pages */}
            <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="tutor-approvals" element={<AdminTutorsWorkspace mode="approval" />} />
              <Route path="tutors" element={<AdminTutorsWorkspace mode="management" />} />
              <Route path="tutor-rankings" element={<AdminReportsWorkspace tab="rankings" />} />
              <Route path="users" element={<UserManagement />} />
              <Route path="bookings" element={<AdminBookingsWorkspace tab="bookings" />} />
              <Route path="payments" element={<AdminFinanceWorkspace tab="payments" />} />
              <Route path="slots" element={<AdminBookingsWorkspace tab="slots" />} />
              <Route path="classes" element={<AdminClassesWorkspace tab="classes" />} />
              <Route path="online-classes" element={<AdminClassesWorkspace tab="online" />} />
              <Route path="course-cancellations" element={<AdminClassesWorkspace tab="cancellations" />} />
              <Route path="finance" element={<AdminFinanceWorkspace tab="finance" />} />
              <Route path="reviews" element={<ReviewManagement />} />
              <Route path="reports" element={<AdminReportsWorkspace tab="reports" />} />
              <Route path="settings" element={<SettingsManagement />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="profile" element={<Profile />} />
              <Route index element={<AdminDashboard />} />
            </Route>
          </Routes>
        </div>
        </ToastProvider>
      </Router>
    </GoogleOAuthProvider>
  );
}

export default App;
