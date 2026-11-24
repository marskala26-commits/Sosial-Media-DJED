import { useEffect, useState } from 'react';
import { Plus, Search, ChevronRight, FileText, AlertCircle } from 'lucide-react';
import { api, formatDateId } from '../api.ts';
import type { ContentStatus, ContentSummary, PlatformType, UserPublic } from '../types.ts';
import { ContentStatusBadge } from './StatusBadge.tsx';

interface ContentListViewProps {
  currentUser: UserPublic;
  scope: 'all' | 'my_approvals' | 'my_history';
  onSelectContent: (contentId: string) => void;
  onCreateNew: () => void;
}

const STATUS_OPTIONS: Array<{ value: '' | ContentStatus; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'Menunggu Approval', label: 'Menunggu Approval' },
  { value: 'Perlu Revisi', label: 'Perlu Revisi' },
  { value: 'Siap Publikasi', label: 'Siap Publikasi' },
  { value: 'Ditolak', label: 'Ditolak' },
];

const PLATFORM_OPTIONS: Array<{ value: '' | PlatformType; label: string }> = [
  { value: '', label: 'Semua Platform' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'YouTube', label: 'YouTube' },
];

export function ContentListView({
  currentUser,
  scope,
  onSelectContent,
  onCreateNew,
}: ContentListViewProps) {
  const [contents, setContents] = useState<ContentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<string>('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await api.getContents({
          scope,
          status: statusFilter,
          platform: platformFilter,
          search,
        });
        if (active) setContents(res.contents);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat daftar konten.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [scope, statusFilter, platformFilter, search]);

  const pageHeading =
    scope === 'my_approvals'
      ? 'Menunggu Approval Anda'
      : scope === 'my_history'
      ? 'Riwayat Approval Saya'
      : 'Daftar Konten Media Sosial';

  const pageSubheading =
    scope === 'my_approvals'
      ? 'Daftar konten yang saat ini berada pada giliran persetujuan Anda.'
      : scope === 'my_history'
      ? 'Seluruh konten yang melibatkan jenjang persetujuan Anda.'
      : 'Pantau status pembuatan, revisi, dan persetujuan berjenjang konten Tim Humas.';

  return (
    <div className="space-y-5">
      {/* Page Title & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">{pageHeading}</h2>
          <p className="mt-1 text-sm text-slate-500">{pageSubheading}</p>
        </div>

        {currentUser.role === 'kreator' && (
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Buat Konten Baru</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul konten, kreator, atau pejabat..."
            aria-label="Cari konten"
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {scope !== 'my_approvals' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter status konten"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            aria-label="Filter platform"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Judul Konten</th>
                <th className="py-3 px-4">Kreator / Editor</th>
                <th className="py-3 px-4">Platform</th>
                <th className="py-3 px-4">Tanggal Publikasi</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Pejabat Approval Saat Ini</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-28 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-6 w-32 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-4 w-36 bg-slate-100 rounded animate-pulse" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="h-8 w-16 bg-slate-100 rounded ml-auto animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : contents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="mx-auto max-w-sm space-y-2">
                      <FileText
                        className="h-8 w-8 text-slate-300 mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-slate-800">
                        {scope === 'my_approvals'
                          ? 'Tidak ada konten yang menunggu persetujuan Anda'
                          : 'Belum ada konten yang sesuai'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {scope === 'my_approvals'
                          ? 'Seluruh antrean approval Anda saat ini sudah ditindaklanjuti.'
                          : currentUser.role === 'kreator'
                          ? 'Buat konten baru untuk memulai proses pengajuan approval pimpinan.'
                          : 'Konten yang diajukan oleh Tim Humas akan tampil di tabel ini.'}
                      </p>
                      {currentUser.role === 'kreator' && scope === 'all' && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={onCreateNew}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Buat Konten Pertama</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                contents.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 align-top">
                      <button
                        type="button"
                        onClick={() => onSelectContent(item.id)}
                        className="text-left font-medium text-slate-900 hover:text-blue-700 transition-colors"
                      >
                        {item.title}
                      </button>
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        Versi {item.currentVersion}
                        {item.isDemo ? ' · DEMO' : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <div className="text-slate-900">{item.creatorName}</div>
                      <div className="text-xs text-slate-500">{item.creatorJabatan}</div>
                    </td>
                    <td className="py-3.5 px-4 align-top text-slate-700">
                      {item.platforms.join(', ')}
                    </td>
                    <td className="py-3.5 px-4 align-top text-slate-700 tabular-nums whitespace-nowrap">
                      <div>{formatDateId(item.publishDate)}</div>
                      <div className="text-xs text-slate-500">{item.publishTime} WIB</div>
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <ContentStatusBadge status={item.status} />
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      {item.currentApproverName ? (
                        <div>
                          <div className="text-slate-900">{item.currentApproverName}</div>
                          <div className="text-xs text-slate-500">
                            {item.currentApproverLevelLabel}
                          </div>
                        </div>
                      ) : item.status === 'Siap Publikasi' ? (
                        <span className="text-xs text-emerald-700 font-medium">
                          Persetujuan Selesai
                        </span>
                      ) : (
                        <span className="text-xs text-rose-700 font-medium">
                          Proses Dihentikan
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => onSelectContent(item.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>Detail</span>
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
