import { Download, X } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onExport: () => void;
  onClearSelection: () => void;
}

const BulkActionsBar = ({ selectedCount, onExport, onClearSelection }: BulkActionsBarProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40 animate-slide-up px-3 w-full max-w-xl">
      <div className="bg-surface-alt text-text-primary px-4 py-3 rounded-lg shadow-navy-lg border border-primary-500/30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
            {selectedCount}
          </div>
          <span className="font-medium text-sm">
            {selectedCount} student{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="h-9 px-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-all flex items-center gap-2 font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          <button
            onClick={onClearSelection}
            className="h-9 w-9 bg-white/6 hover:bg-white/10 text-text-secondary rounded-lg transition-all flex items-center justify-center"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsBar;
