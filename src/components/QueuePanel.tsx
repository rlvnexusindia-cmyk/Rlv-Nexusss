import React from 'react';
import { ArrowUp, Play, Trash2 } from 'lucide-react';
import type { Track } from '../types/music';

interface QueuePanelProps {
  queue: Track[];
  onPlayQueueItem: (index: number) => void;
  onMoveUp: (index: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onMixNext: () => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  queue,
  onPlayQueueItem,
  onMoveUp,
  onRemove,
  onClear,
  onMixNext,
}) => {
  return (
    <aside
      id="queue"
      aria-label="Up Next DJ Setlist Queue"
      className="rounded-2xl border border-white/8 bg-[#12161F]/78 backdrop-blur-xl p-4 sm:p-5 flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/8 pb-3.5">
        <div>
          <h2 className="font-display text-lg font-bold text-[#F1F3F5]">Up Next Queue</h2>
          <p className="text-xs text-[#9CA3AF] font-mono-tabular">
            {queue.length} {queue.length === 1 ? 'track' : 'tracks'} queued
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {queue.length > 0 && (
            <>
              <button
                type="button"
                onClick={onMixNext}
                className="min-h-[38px] rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-[#090B10] hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                Mix Next
              </button>
              <button
                type="button"
                onClick={onClear}
                className="min-h-[38px] rounded-xl border border-white/10 bg-[#1A1E28] px-3 py-1.5 text-xs font-medium text-[#9CA3AF] hover:text-[#F1F3F5] transition-colors cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-[#D1D5DB]">Queue is empty</p>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Add tracks from any genre or run AI Smart Filter to build a nonstop DJ set.
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-white/6 max-h-[540px] overflow-y-auto pr-1">
          {queue.map((track, idx) => (
            <li
              key={`${track.id}-${idx}`}
              className="flex items-center justify-between gap-2.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="font-mono-tabular text-xs text-[#6B7280] w-5 text-right shrink-0">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#F1F3F5] truncate">{track.title}</p>
                  <p className="text-[11px] text-[#9CA3AF] truncate">
                    {track.artist} · <span className="font-mono-tabular">{track.bpm} BPM</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onPlayQueueItem(idx)}
                  title="Play this track now"
                  aria-label={`Play ${track.title}`}
                  className="rounded-md bg-[#1A1E28] p-1.5 text-amber-400 hover:bg-[#232836] cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => onMoveUp(idx)}
                    title="Move up"
                    aria-label={`Move ${track.title} up`}
                    className="rounded-md bg-[#1A1E28] p-1.5 text-[#9CA3AF] hover:text-[#F1F3F5] cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  title="Remove from queue"
                  aria-label={`Remove ${track.title}`}
                  className="rounded-md bg-[#1A1E28] p-1.5 text-[#9CA3AF] hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
};
