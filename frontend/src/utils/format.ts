export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(value);
};

export const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('vi-VN').format(date);
};

export const formatPhoneNumber = (phone: string) => {
  if (!phone) return '';
  // Simple masking for users if needed: 09xx xxx 123
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} xxx ${cleaned.slice(7)}`;
  }
  return phone;
};

export const formatNumberInput = (value: string | number | null | undefined): string => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
};

export const parseMoneyInput = (value: string | number | null | undefined): number => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};
