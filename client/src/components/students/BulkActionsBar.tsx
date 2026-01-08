import { FaDownload, FaTimes } from 'react-icons/fa';

interface BulkActionsBarProps {
  selectedCount: number;
  onExport: () => void;
  onClearSelection: () => void;
}

const BulkActionsBar = ({ selectedCount, onExport, onClearSelection }: BulkActionsBarProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 animate-slide-up">
      <div className="bg-gradient-primary text-white px-6 py-4 rounded-xl shadow-glow-lg flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center font-bold">
            {selectedCount}
          </div>
          <span className="font-medium">
            {selectedCount} student{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>

        <div className="h-6 w-px bg-white bg-opacity-30"></div>

        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-all flex items-center gap-2 font-medium"
          >
            <FaDownload />
            Export
          </button>

          <button
            onClick={onClearSelection}
            className="px-3 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-all"
            title="Clear selection"
          >
            <FaTimes />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkActionsBar;
