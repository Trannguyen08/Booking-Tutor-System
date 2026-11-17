import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { publicClient } from '../../api/client';
import { useToast } from '../../components/ui/Toast';

const ForgotPassword: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await publicClient.post('/auth/forgot-password/', { email: email.trim() });
      showToast(res.data?.message || 'Đã gửi mã OTP nếu email tồn tại.', 'success');
      setStep('reset');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể gửi yêu cầu khôi phục mật khẩu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Mật khẩu mới cần tối thiểu 8 ký tự.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await publicClient.post('/auth/reset-password/', {
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      showToast(res.data?.message || 'Đặt lại mật khẩu thành công!', 'success');
      navigate('/login');
    } catch (error: any) {
      const errMsg =
        error.response?.data?.error ||
        error.response?.data?.new_password?.[0] ||
        'Mã OTP không hợp lệ hoặc đã hết hạn.';
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 w-full flex items-center justify-center p-4 md:p-8 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 min-h-[calc(100vh-160px)]">
      <div className="bg-white p-8 md:p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.05)] w-full max-w-[460px] border border-indigo-50">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#5a5ce6] mb-6">
          <ArrowLeft className="w-4 h-4" />
          Quay lại đăng nhập
        </Link>

        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#5a5ce6] flex items-center justify-center mb-4">
          {step === 'email' ? <Mail className="w-6 h-6" /> : <KeyRound className="w-6 h-6" />}
        </div>

        <h1 className="text-2xl font-bold text-[#312e81] mb-2">
          {step === 'email' ? 'Quên mật khẩu' : 'Đặt lại mật khẩu'}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === 'email'
            ? 'Nhập email đã đăng ký để nhận mã OTP khôi phục mật khẩu.'
            : `Nhập mã OTP 6 chữ số đã gửi về ${email} cùng mật khẩu mới của bạn.`}
        </p>

        {step === 'email' ? (
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5a5ce6]/20 focus:border-[#5a5ce6] text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5a5ce6] hover:bg-[#4b4de0] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60"
            >
              {loading ? 'Đang gửi OTP...' : 'Gửi mã OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Mã OTP</label>
              <input
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 chữ số"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5a5ce6]/20 focus:border-[#5a5ce6] text-sm tracking-widest font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Mật khẩu mới</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5a5ce6]/20 focus:border-[#5a5ce6] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5a5ce6]/20 focus:border-[#5a5ce6] text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5a5ce6] hover:bg-[#4b4de0] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'Đang cập nhật...' : 'Xác nhận đặt lại mật khẩu'}
            </button>
            <button
              type="button"
              onClick={() => setStep('email')}
              className="w-full text-xs font-bold text-gray-500 hover:text-[#5a5ce6] py-2"
            >
              Đổi email / gửi lại OTP
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
