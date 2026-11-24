import {
  CheckCircle2,
  Clock,
  Hourglass,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { ApprovalStepStatus, ContentStatus } from '../types.ts';

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  switch (status) {
    case 'Menunggu Approval':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 border border-blue-200 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />
          <span>Menunggu Approval</span>
        </span>
      );
    case 'Perlu Revisi':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-200 whitespace-nowrap">
          <RotateCcw className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
          <span>Perlu Revisi</span>
        </span>
      );
    case 'Siap Publikasi':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>Siap Publikasi</span>
        </span>
      );
    case 'Ditolak':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 border border-rose-200 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" aria-hidden="true" />
          <span>Ditolak</span>
        </span>
      );
  }
}

export function StepStatusBadge({ status }: { status: ApprovalStepStatus }) {
  switch (status) {
    case 'Disetujui':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>Disetujui</span>
        </span>
      );
    case 'Menunggu':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 border border-blue-200 whitespace-nowrap">
          <Clock className="h-3 w-3 text-blue-600 shrink-0" aria-hidden="true" />
          <span>Menunggu Keputusan</span>
        </span>
      );
    case 'Menunggu Antrean':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200 whitespace-nowrap">
          <Hourglass className="h-3 w-3 text-slate-500 shrink-0" aria-hidden="true" />
          <span>Menunggu Antrean</span>
        </span>
      );
    case 'Revisi':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200 whitespace-nowrap">
          <RotateCcw className="h-3 w-3 text-amber-600 shrink-0" aria-hidden="true" />
          <span>Diminta Revisi</span>
        </span>
      );
    case 'Ditolak':
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800 border border-rose-200 whitespace-nowrap">
          <XCircle className="h-3 w-3 text-rose-600 shrink-0" aria-hidden="true" />
          <span>Ditolak</span>
        </span>
      );
  }
}
