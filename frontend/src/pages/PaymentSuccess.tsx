import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { bookingsApi } from '../api/bookings';
import { onlineClassesApi } from '../api/onlineClasses';

const PaymentSuccess: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('Đang xác nhận thanh toán với PayOS...');

  const onlineClassId = params.get('onlineClassId');
  const paymentId = params.get('paymentId');

  useEffect(() => {
    const payosReturnedPaid = params.get('status') === 'PAID';
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const verify = async () => {
      const maxAttempts = payosReturnedPaid ? 5 : 1;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          if (onlineClassId || paymentId) {
            const res = await onlineClassesApi.verifyPayment({
              orderCode: params.get('orderCode'),
              paymentId,
            });
            if (res.payment?.status === 'paid') {
              setStatus('success');
              setMessage('Thanh toán học phí lớp online thành công! Bạn đã được ghi danh vào lớp.');
              window.setTimeout(() => navigate(`/online-classes/${onlineClassId || res.enrollment?.online_class}`), 2000);
              return;
            }
          } else {
            const booking = await bookingsApi.verifyPayment({
              orderCode: params.get('orderCode'),
              bookingId: params.get('bookingId'),
            });

            if (booking.payment_status === 'paid') {
              setStatus('success');
              setMessage('Thanh toán cọc thành công. Hệ thống đã xác nhận booking và thông báo cho gia sư.');
              window.setTimeout(() => navigate('/my-courses'), 2200);
              return;
            }
          }
        } catch {
          if (attempt === maxAttempts) {
            setStatus('failed');
            setMessage('Không xác nhận được thanh toán. Vui lòng kiểm tra lại.');
            return;
          }
        }

        if (attempt < maxAttempts) {
          await wait(1200);
        }
      }

      setStatus('failed');
      setMessage('PayOS chưa ghi nhận giao dịch thành công. Vui lòng thử lại sau ít phút.');
    };

    verify();
  }, [navigate, onlineClassId, params, paymentId]);

  const Icon = status === 'loading' ? Loader2 : status === 'success' ? CheckCircle2 : XCircle;
  const fallbackLink = onlineClassId ? `/online-classes/${onlineClassId}` : '/registration-history';
  const fallbackLabel = onlineClassId ? 'Quay lại lớp học online' : 'Về lịch sử đăng ký';

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-[#f8faff] px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-indigo-50 bg-white p-8 text-center shadow-xl shadow-indigo-100">
        <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${
          status === 'success' ? 'bg-emerald-50 text-emerald-600' : status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-[#5a5ce6]'
        }`}>
          <Icon className={`h-8 w-8 ${status === 'loading' ? 'animate-spin' : ''}`} />
        </div>
        <h1 className="mb-3 text-2xl font-extrabold text-[#1e1b4b]">
          {status === 'success' ? 'Thanh toán thành công' : status === 'failed' ? 'Cần kiểm tra lại' : 'Đang xử lý'}
        </h1>
        <p className="mb-6 text-sm font-medium leading-relaxed text-gray-500">{message}</p>
        <Link to={fallbackLink} className="inline-flex rounded-xl bg-[#5a5ce6] px-5 py-3 text-sm font-bold text-white">
          {fallbackLabel}
        </Link>
      </div>
    </div>
  );
};

export default PaymentSuccess;
