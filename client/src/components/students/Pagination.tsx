import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../ui/Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  onItemsPerPageChange: (items: number) => void;
}

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  onItemsPerPageChange,
}: PaginationProps) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Info + per-page */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-text-tertiary">
          <span className="text-text-secondary font-medium">{startItem}–{endItem}</span>
          {' '}of{' '}
          <span className="text-text-secondary font-medium">{totalItems}</span>
        </p>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="h-7 px-2 bg-surface-alt border border-white/10 rounded-lg text-xs text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary-400 hover:border-white/20 transition-colors"
        >
          <option value={5}>5 / page</option>
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>

      {/* Page buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex gap-1">
          {getPageNumbers().map((page, index) =>
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="w-8 flex items-center justify-center text-xs text-text-tertiary">
                …
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                className={`
                  w-8 h-8 rounded-lg text-xs font-medium transition-all
                  ${currentPage === page
                    ? 'bg-primary-600 text-white shadow-glow'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }
                `}
              >
                {page}
              </button>
            )
          )}
        </div>

        <Button
          variant="ghost"
          size="xs"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default Pagination;
