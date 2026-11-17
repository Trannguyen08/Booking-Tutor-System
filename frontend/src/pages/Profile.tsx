import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Lock, Save, User as UserIcon } from 'lucide-react';
import client from '../api/client';
import { useToast } from '../components/ui/Toast';
import { getStoredUser, updateStoredUser } from '../utils/auth';

const Profile: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'password' ? 'password' : 'profile';
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>(initialTab);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [user, setUser] = useState<any>(() => getStoredUser());
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    phone: '',
    bio: '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>('');
  const avatarRef = useRef<HTMLInputElement>(null);

  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    setActiveTab(searchParams.get('tab') === 'password' ? 'password' : 'profile');
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    client
      .get('/auth/me/')
      .then((res) => {
        if (!mounted) return;
        const data = res.data;
        setUser(data);
        setForm({
          username: data.username || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone: data.phone || '',
          bio: data.bio || '',
        });
        setAvatarPreview(data.avatar_url || data.avatar || '');
      })
      .catch(() => {
        showToast('Không tải được thông tin hồ sơ.', 'error');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('username', form.username);
      payload.append('first_name', form.first_name);
      payload.append('last_name', form.last_name);
      payload.append('phone', form.phone);
      payload.append('bio', form.bio);
      if (avatarFile) {
        payload.append('avatar', avatarFile);
      }

      const res = await client.patch('/auth/me/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data);
      setAvatarFile(null);
      setAvatarPreview(res.data.avatar_url || res.data.avatar || avatarPreview);
      updateStoredUser(res.data);
      showToast('Đã cập nhật hồ sơ cá nhân.', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể cập nhật hồ sơ.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.old_password || !passwordForm.new_password) {
      showToast('Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.', 'error');
      return;
    }
    if (passwordForm.new_password.length < 8) {
      showToast('Mật khẩu mới cần tối thiểu 8 ký tự.', 'error');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      showToast('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await client.post('/auth/change-password/', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      showToast('Đổi mật khẩu thành công.', 'success');
    } catch (error: any) {
      showToast(
        error.response?.data?.old_password ||
          error.response?.data?.new_password?.[0] ||
          'Đổi mật khẩu thất bại.',
        'error',
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#5a5ce6]" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#f8faff] py-10 px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-[#1e1b4b]">Hồ sơ cá nhân</h1>
            <p className="mt-1 text-sm text-gray-500">Quản lý thông tin tài khoản và bảo mật.</p>
          </div>
          <div className="inline-flex rounded-xl bg-white p-1 border border-gray-200">
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeTab === 'profile' ? 'bg-[#5a5ce6] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              Thông tin
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({ tab: 'password' })}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                activeTab === 'password' ? 'bg-[#5a5ce6] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Lock className="w-4 h-4" />
              Đổi mật khẩu
            </button>
          </div>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleSaveProfile} className="rounded-3xl border border-indigo-50 bg-white p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative h-24 w-24 rounded-2xl bg-indigo-50 overflow-hidden border border-indigo-100 flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-extrabold text-[#5a5ce6]">
                    {(user?.username || user?.email || 'U')[0].toUpperCase()}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => avatarRef.current?.click()}
                  className="absolute bottom-1.5 right-1.5 rounded-lg bg-slate-900/80 p-1.5 text-white hover:bg-slate-900"
                  title="Đổi ảnh đại diện"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) {
                      setAvatarFile(picked);
                      setAvatarPreview(URL.createObjectURL(picked));
                    }
                  }}
                />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">{user?.username || user?.email}</h2>
                <p className="text-sm font-medium text-gray-500">{user?.email}</p>
                <span className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-[#5a5ce6]">
                  {user?.is_staff || user?.is_superuser ? 'Quản trị viên' : user?.is_tutor ? 'Gia sư' : 'Học viên'}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Tên hiển thị (Username)</span>
                <input
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#5a5ce6]"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Số điện thoại</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#5a5ce6]"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Họ</span>
                <input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#5a5ce6]"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Tên</span>
                <input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#5a5ce6]"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Giới thiệu ngắn</span>
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-[#5a5ce6] resize-none"
                />
              </label>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#5a5ce6] px-6 py-3 text-sm font-bold text-white hover:bg-[#4b4de0] disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleChangePassword} className="rounded-3xl border border-indigo-50 bg-white p-8 shadow-sm space-y-5 max-w-xl">
            <h2 className="text-xl font-extrabold text-gray-900">Đổi mật khẩu</h2>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Mật khẩu hiện tại</span>
              <input
                type="password"
                required
                value={passwordForm.old_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#5a5ce6]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Mật khẩu mới</span>
              <input
                type="password"
                required
                minLength={8}
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#5a5ce6]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase text-gray-500 mb-1.5">Xác nhận mật khẩu mới</span>
              <input
                type="password"
                required
                minLength={8}
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#5a5ce6]"
              />
            </label>
            <button
              type="submit"
              disabled={changingPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              <Lock className="w-4 h-4" />
              {changingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Profile;
