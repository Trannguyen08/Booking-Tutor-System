import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, HelpCircle, LifeBuoy, ShieldCheck, Briefcase, FileText, ArrowRight } from 'lucide-react';

export type InfoPageKind =
  | 'how-it-works'
  | 'privacy'
  | 'terms'
  | 'support'
  | 'help'
  | 'careers';

const PAGE_CONTENT: Record<
  InfoPageKind,
  {
    title: string;
    subtitle: string;
    icon: React.FC<{ className?: string }>;
    sections: { heading: string; body: string[] }[];
    cta?: { label: string; to: string };
  }
> = {
  'how-it-works': {
    title: 'Cách TutorMatch hoạt động',
    subtitle: 'Kết nối học viên, phụ huynh và gia sư minh bạch chỉ với 4 bước đơn giản.',
    icon: BookOpen,
    sections: [
      {
        heading: 'Tìm kiếm & xem hồ sơ',
        body: [
          'Lọc gia sư theo môn học, cấp độ, khu vực, học phí và lịch rảnh thực tế.',
          'Xem học vấn, chứng chỉ, CV năng lực và đánh giá đã kiểm duyệt từ học viên.',
        ],
      },
      {
        heading: 'Đặt lịch & thanh toán cọc',
        body: [
          'Chọn ngày bắt đầu, kết thúc và khung giờ phù hợp từ lịch mở của gia sư.',
          'Thanh toán cọc trực tuyến qua PayOS; hệ thống tự động tạo khóa học.',
        ],
      },
      {
        heading: 'Học tập & theo dõi tiến độ',
        body: [
          'Gia sư chia sẻ tài liệu và ghi chú bài giảng sau từng buổi học.',
          'Học viên xác nhận hoàn thành từng buổi và đánh giá sau khóa học.',
        ],
      },
      {
        heading: 'Kiểm duyệt AI & hỗ trợ',
        body: [
          'Hồ sơ gia sư được đối chiếu CCCD, ảnh chân dung và chứng chỉ trước khi hiển thị.',
          'Bộ phận quản trị tiếp nhận và xử lý kịp thời các yêu cầu hủy khóa hoặc tranh chấp.',
        ],
      },
    ],
    cta: { label: 'Tìm gia sư ngay', to: '/find-tutors' },
  },
  privacy: {
    title: 'Chính sách bảo mật',
    subtitle: 'Cam kết bảo vệ dữ liệu cá nhân của học viên, phụ huynh và gia sư.',
    icon: ShieldCheck,
    sections: [
      {
        heading: 'Thông tin thu thập',
        body: [
          'Thông tin tài khoản cơ bản (tên, email, số điện thoại) dùng để xác thực và liên lạc lịch học.',
          'Giấy tờ xác minh danh tính (CCCD) chỉ phục vụ duyệt nội bộ và không hiển thị công khai.',
        ],
      },
      {
        heading: 'Hiển thị hồ sơ & CV',
        body: [
          'Học vấn, môn dạy, thành tích và CV do gia sư tải lên sẽ hiển thị công khai để phụ huynh tham khảo.',
          'Gia sư có thể cập nhật hoặc gỡ CV bất kỳ lúc nào trong phần Cài đặt hồ sơ.',
        ],
      },
    ],
  },
  terms: {
    title: 'Điều khoản dịch vụ',
    subtitle: 'Quy định sử dụng nền tảng dành cho học viên, phụ huynh và gia sư.',
    icon: FileText,
    sections: [
      {
        heading: 'Trách nhiệm người dùng',
        body: [
          'Cung cấp thông tin trung thực khi đăng ký tài khoản, đặt lịch và đánh giá khóa học.',
          'Tôn trọng quy tắc cộng đồng, không chia sẻ nội dung vi phạm pháp luật.',
        ],
      },
      {
        heading: 'Đặt lịch, ký quỹ & hoàn tiền',
        body: [
          'Gia sư duy trì số dư ký quỹ tối thiểu theo quy định để nhận lớp mới.',
          'Yêu cầu hủy khóa và hoàn tiền được quản trị viên xử lý theo số buổi thực học.',
        ],
      },
    ],
  },
  support: {
    title: 'Trung tâm hỗ trợ',
    subtitle: 'Giải đáp thắc mắc và hỗ trợ xử lý sự cố trong quá trình học và dạy.',
    icon: LifeBuoy,
    sections: [
      {
        heading: 'Hỗ trợ học viên & phụ huynh',
        body: [
          'Gửi báo cáo về lịch học, thanh toán hoặc chất lượng buổi dạy ngay tại Lịch sử đăng ký.',
          'Email: support@tutormatch.vn (08:00 - 21:00 hằng ngày).',
        ],
      },
      {
        heading: 'Hỗ trợ gia sư',
        body: [
          'Theo dõi và trao đổi các hồ sơ hỗ trợ tại mục Hỗ trợ trong Tutor Portal.',
        ],
      },
    ],
    cta: { label: 'Lịch sử đăng ký', to: '/registration-history' },
  },
  help: {
    title: 'Trợ giúp đăng nhập & tài khoản',
    subtitle: 'Hướng dẫn nhanh khi gặp sự cố đăng ký, xác thực OTP hoặc đăng nhập.',
    icon: HelpCircle,
    sections: [
      {
        heading: 'Tài khoản gia sư chưa đăng nhập được?',
        body: [
          'Hồ sơ gia sư cần được admin duyệt trước khi kích hoạt; mật khẩu tạm sẽ gửi qua email.',
          'Bạn có thể dùng chức năng Quên mật khẩu để đặt lại bằng OTP bất kỳ lúc nào.',
        ],
      },
      {
        heading: 'Chưa nhận được mã OTP?',
        body: [
          'Kiểm tra thư mục Spam/Quảng cáo hoặc bấm gửi lại mã tại trang xác thực OTP.',
        ],
      },
    ],
    cta: { label: 'Quên mật khẩu', to: '/forgot-password' },
  },
  careers: {
    title: 'Tuyển dụng & Hợp tác giảng dạy',
    subtitle: 'Đồng hành cùng TutorMatch xây dựng cộng đồng giáo dục chất lượng cao.',
    icon: Briefcase,
    sections: [
      {
        heading: 'Trở thành gia sư đối tác',
        body: [
          'Sinh viên giỏi, cử nhân, thạc sĩ và giáo viên có thể đăng ký dạy trực tuyến hoặc tại nhà.',
          'Chuẩn bị ảnh chân dung, CCCD, chứng chỉ và CV để hồ sơ được duyệt nhanh nhất.',
        ],
      },
      {
        heading: 'Quyền lợi gia sư',
        body: [
          'Chủ động mở lịch dạy, học phí và quản lý tài liệu học viên ngay trên nền tảng.',
        ],
      },
    ],
    cta: { label: 'Đăng ký làm gia sư', to: '/register/tutor' },
  },
};

const InfoPage: React.FC<{ kind: InfoPageKind }> = ({ kind }) => {
  const content = PAGE_CONTENT[kind];
  const Icon = content.icon;

  return (
    <div className="flex-1 bg-[#f8faff] py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-indigo-100/80 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-[#5a5ce6]">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-[#1e1b4b]">{content.title}</h1>
              <p className="mt-1 text-sm text-gray-600">{content.subtitle}</p>
            </div>
          </div>
          {content.cta && (
            <Link
              to={content.cta.to}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5a5ce6] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#4b4de0] transition"
            >
              {content.cta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {content.sections.map((section, index) => (
            <div
              key={section.heading}
              className="rounded-2xl border border-indigo-50 bg-white p-5 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-black text-[#5a5ce6]">
                    0{index + 1}
                  </span>
                  <h2 className="text-base font-extrabold text-[#1e1b4b]">{section.heading}</h2>
                </div>
                <div className="space-y-1.5 text-sm leading-6 text-gray-600">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InfoPage;
