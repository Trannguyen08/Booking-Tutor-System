import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationMeta {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface PaginationProps {
  currentPage: number;
  totalCount: number;
  pageSize?: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function useClientPagination<T>(items: T[], page: number, pageSize = 10) {
  const safeItems = Array.isArray(items) ? items : [];
  const totalCount = safeItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const pagedItems = safeItems.slice(start, start + pageSize);
  return {
    pagedItems,
    currentPage: safePage,
    totalCount,
    totalPages,
    pageSize,
  };
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalCount,
  pageSize = 10,
  totalPages: propTotalPages,
  onPageChange,
  className = '',
}) => {
  const totalPages = Math.max(1, propTotalPages || Math.ceil(totalCount / pageSize));
  if (totalCount === 0) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalCount, safePage * pageSize);

  const getPages = (): (number | 'dots')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'dots')[] = [1];
    if (safePage > 3) pages.push('dots');
    const winStart = Math.max(2, safePage - 1);
    const winEnd = Math.min(totalPages - 1, safePage + 1);
    for (let p = winStart; p <= winEnd; p++) pages.push(p);
    if (safePage < totalPages - 2) pages.push('dots');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div
      className={`flex flex-col gap-3 border-t border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-xs font-semibold text-slate-500">
        Hiển thị <span className="font-extrabold text-slate-800">{startIdx}–{endIdx}</span> trên{' '}
        <span className="font-extrabold text-slate-800">{totalCount}</span> bản ghi ({pageSize}/trang)
      </p>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {getPages().map((item, idx) =>
            item === 'dots' ? (
              <span key={`dots-${idx}`} className="px-1.5 text-xs font-bold text-slate-400">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded-xl px-2.5 text-xs font-extrabold transition ${
                  item === safePage
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Pagination;
