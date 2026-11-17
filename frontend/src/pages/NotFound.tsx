import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

const NotFound: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center bg-[#f8faff] px-6 py-20 text-center">
    <p className="text-7xl font-black text-[#5a5ce6]/20">404</p>
    <h1 className="mt-2 text-2xl font-extrabold text-[#1e1b4b]">Không tìm thấy trang</h1>
    <p className="mt-2 max-w-md text-sm text-gray-500">
      Đường dẫn bạn truy cập không tồn tại hoặc đã được di chuyển.
    </p>
    <div className="mt-6 flex flex-wrap gap-3 justify-center">
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-xl bg-[#5a5ce6] px-5 py-3 text-sm font-bold text-white hover:bg-[#4b4de0]"
      >
        <Home className="w-4 h-4" />
        Về trang chủ
      </Link>
      <Link
        to="/find-tutors"
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
      >
        <Search className="w-4 h-4" />
        Tìm gia sư
      </Link>
    </div>
  </div>
);

export default NotFound;
