import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  History,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  api,
  downloadProtectedFile,
  formatBytes,
  formatDateId,
  formatDateTimeId,
} from '../api.ts';
import {
  ROLE_LABELS,
  type ApprovalStep,
  type ContentDetail,
  type PlatformType,
  type UserPublic,
} from '../types.ts';
import { ContentStatusBadge, StepStatusBadge } from './StatusBadge.tsx';

interface ContentDetailViewProps {
  contentId: string;
  currentUser: UserPublic;
  onBack: () => void;
  onNotificationsChanged: () => void;
}

const PLATFORMS: PlatformType[] = ['Instagram', 'Facebook', 'YouTube'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function ContentDetailView({
  contentId,
  currentUser,
  onBack,
  onNotificationsChanged,
}: ContentDetailViewProps) {
  const [content, setContent] = useState<ContentDetail | null>(null);
  const [allUsers, setAllUsers] = useState<UserPublic[]>([]);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Pimpinan decision state
  const [decisionMode, setDecisionMode] = useState<'approve' | 'revise' | 'reject' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Kreator revise/resubmit state
  const [editingRevision, setEditingRevision] = useState(false);
  const [revTitle, setRevTitle] = useState('');
  const [revCaption, setRevCaption] = useState('');
  const [revPlatforms, setRevPlatforms] = useState<PlatformType[]>([]);
  const [revDate, setRevDate] = useState('');
  const [revTime, setRevTime] = useState('');
  const [revFile, setRevFile] = useState<File | null>(null);
  const [submittingRevision, setSubmittingRevision] = useState(false);

  // Replace approver state
  const [replacingStep, setReplacingStep] = useState<ApprovalStep | null>(null);
  const [replacementApproverId, setReplacementApproverId] = useState('');
  const [replacementReason, setReplacementReason] = useState('');
  const [submittingReplace, setSubmittingReplace] = useState(false);

  // Download feedback
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, usersRes] = await Promise.all([
        api.getContentDetail(contentId),
        api.getUsers(),
      ]);
      setContent(detailRes.content);
      setAllUsers(usersRes.users);
      setSelectedVersionNumber(detailRes.content.currentVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail konten.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  function openRevisionForm() {
    if (!content) return;
    setRevTitle(content.latestVersion.title);
    setRevCaption(content.latestVersion.caption);
    setRevPlatforms(content.platforms);
    setRevDate(content.publishDate);
    setRevTime(content.publishTime);
    setRevFile(null);
    setEditingRevision(true);
    setError(null);
  }

  function handleRevisionFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setRevFile(null);
      return;
    }
    const validMime =
      picked.type.startsWith('image/') ||
      picked.type === 'video/mp4' ||
      picked.type === 'video/webm' ||
      picked.type === 'video/quicktime';
    if (!validMime) {
      setError('Format file harus JPG, PNG, WEBP, MP4, WEBM, atau MOV.');
      e.target.value = '';
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setError('Ukuran file maksimal 50 MB.');
      e.target.value = '';
      return;
    }
    setError(null);
    setRevFile(picked);
  }

  async function handleSubmitRevision(e: FormEvent) {
    e.preventDefault();
    if (!content) return;
    if (revPlatforms.length === 0) {
      setError('Pilih minimal satu platform media sosial.');
      return;
    }
    setError(null);
    setSubmittingRevision(true);
    try {
      const res = await api.resubmitContent(content.id, {
        title: revTitle,
        caption: revCaption,
        platforms: revPlatforms,
        publishDate: revDate,
        publishTime: revTime,
        file: revFile,
      });
      setContent(res.content);
      setSelectedVersionNumber(res.content.currentVersion);
      setEditingRevision(false);
      setActionNotice(
        `Perbaikan Versi ${res.content.currentVersion} berhasil diajukan kembali ke pejabat peminta revisi.`
      );
      onNotificationsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengajukan ulang perbaikan.');
    } finally {
      setSubmittingRevision(false);
    }
  }

  async function handleSubmitDecision(e: FormEvent) {
    e.preventDefault();
    if (!content || !decisionMode) return;
    setError(null);
    setSubmittingDecision(true);
    try {
      const res = await api.submitDecision(content.id, {
        decision: decisionMode,
        note: decisionNote,
      });
      setContent(res.content);
      setDecisionMode(null);
      setDecisionNote('');
      setActionNotice(
        decisionMode === 'approve'
          ? 'Persetujuan berhasil dicatat.'
          : decisionMode === 'revise'
          ? 'Permintaan revisi berhasil dikirim ke Kreator / Editor.'
          : 'Penolakan konten berhasil dicatat.'
      );
      onNotificationsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan keputusan approval.');
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function handleReplaceApprover(e: FormEvent) {
    e.preventDefault();
    if (!content || !replacingStep || !replacementApproverId) return;
    setError(null);
    setSubmittingReplace(true);
    try {
      const res = await api.replaceApprover(content.id, {
        stepId: replacingStep.id,
        newApproverId: replacementApproverId,
        reason: replacementReason,
      });
      setContent(res.content);
      setReplacingStep(null);
      setReplacementApproverId('');
      setReplacementReason('');
      setActionNotice('Pejabat approval pengganti berhasil diperbarui dan dinotifikasikan.');
      onNotificationsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti pejabat approval.');
    } finally {
      setSubmittingReplace(false);
    }
  }

  async function handleDownload(fileId: string, downloadUrl: string | null, originalName: string) {
    if (!downloadUrl || currentUser.role === 'pimpinan') return;
    setDownloadingFileId(fileId);
    setError(null);
    try {
      await downloadProtectedFile(downloadUrl, originalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh file.');
    } finally {
      setDownloadingFileId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
        <p className="text-sm font-medium text-slate-900">
          {error || 'Konten tidak ditemukan.'}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Kembali ke Daftar</span>
        </button>
      </div>
    );
  }

  const displayedVersion =
    content.versions.find((v) => v.versionNumber === selectedVersionNumber) ??
    content.latestVersion;

  const canPimpinanDecide =
    currentUser.role === 'pimpinan' &&
    content.status === 'Menunggu Approval' &&
    content.currentApproverId === currentUser.id;

  const canKreatorRevise =
    currentUser.role === 'kreator' && content.status === 'Perlu Revisi';

  const canKreatorReplaceApprover =
    currentUser.role === 'kreator' &&
    (content.status === 'Menunggu Approval' || content.status === 'Perlu Revisi');

  const canDownloadFile = currentUser.role !== 'pimpinan';

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Kembali ke Daftar Konten</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
          <span>Versi Aktif: v{content.currentVersion}</span>
          <span aria-hidden="true">·</span>
          <span>Diperbarui {formatDateTimeId(content.updatedAt)}</span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {actionNotice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Status-Specific Contextual Banners */}
      {content.status === 'Siap Publikasi' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-emerald-900">
              Status: Siap Publikasi (Manual oleh Tim Humas)
            </h3>
            <p className="mt-0.5 text-xs text-emerald-800">
              Seluruh jenjang pimpinan yang dipilih telah menyetujui materi ini. Silakan lakukan
              publikasi secara manual ke {content.platforms.join(', ')} sesuai jadwal{' '}
              <span className="font-medium tabular-nums">
                {formatDateId(content.publishDate)} · {content.publishTime} WIB
              </span>
              .
            </p>
          </div>
          <ContentStatusBadge status={content.status} />
        </div>
      )}

      {content.status === 'Perlu Revisi' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-900">
              Permintaan Revisi dari {content.currentApproverLevelLabel} ({content.currentApproverName})
            </h3>
            <p className="text-sm text-amber-900/90 whitespace-pre-wrap">{content.revisionNote}</p>
          </div>
          {canKreatorRevise && !editingRevision && (
            <button
              type="button"
              onClick={openRevisionForm}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-xs font-medium text-white hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Perbaiki & Ajukan Ulang</span>
            </button>
          )}
        </div>
      )}

      {content.status === 'Ditolak' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 space-y-1">
          <h3 className="text-sm font-semibold text-rose-900">
            Konten Ditolak · Proses Approval Dihentikan
          </h3>
          <p className="text-sm text-rose-800 whitespace-pre-wrap">
            Alasan penolakan: {content.rejectionReason}
          </p>
        </div>
      )}

      {/* Main Two-Column Content Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Media Preview, Caption, Revision Form, Version History */}
        <div className="lg:col-span-7 space-y-6">
          {/* Header & Metadata */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                  {displayedVersion.title}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Kreator: {content.creatorName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{content.platforms.join(', ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Jadwal: {formatDateId(content.publishDate)} {content.publishTime} WIB
                  </span>
                </div>
              </div>
              <ContentStatusBadge status={content.status} />
            </div>

            {/* Version Switcher Bar */}
            {content.versions.length > 1 && (
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">
                  Menampilkan materi Versi {displayedVersion.versionNumber}
                  {displayedVersion.versionNumber === content.currentVersion
                    ? ' (Terbaru)'
                    : ' (Arsip Versi Lama)'}
                </span>
                <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  {content.versions.map((ver) => (
                    <button
                      key={ver.id}
                      type="button"
                      onClick={() => setSelectedVersionNumber(ver.versionNumber)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md tabular-nums transition-colors ${
                        displayedVersion.versionNumber === ver.versionNumber
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      v{ver.versionNumber}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Protected Media Preview */}
            <div
              onContextMenu={currentUser.role === 'pimpinan' ? (e) => e.preventDefault() : undefined}
              className="rounded-xl border border-slate-200 bg-slate-950/5 overflow-hidden"
            >
              {displayedVersion.file.mediaType === 'video' ? (
                <video
                  key={displayedVersion.file.id}
                  src={displayedVersion.file.previewUrl}
                  controls
                  controlsList="nodownload"
                  disablePictureInPicture
                  className="w-full max-h-[460px] bg-slate-900"
                />
              ) : (
                <img
                  key={displayedVersion.file.id}
                  src={displayedVersion.file.previewUrl}
                  alt={displayedVersion.title}
                  draggable={currentUser.role !== 'pimpinan'}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[460px] object-contain mx-auto select-none"
                />
              )}
            </div>

            {/* File Metadata + Role-Restricted Download Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
              <div className="tabular-nums">
                <span>{displayedVersion.file.originalName}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{formatBytes(displayedVersion.file.sizeBytes)}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>Diunggah {formatDateTimeId(displayedVersion.createdAt)}</span>
              </div>

              {canDownloadFile && displayedVersion.file.downloadUrl && (
                <button
                  type="button"
                  disabled={downloadingFileId === displayedVersion.file.id}
                  onClick={() =>
                    handleDownload(
                      displayedVersion.file.id,
                      displayedVersion.file.downloadUrl,
                      displayedVersion.file.originalName
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-blue-400 hover:text-blue-700 transition-colors disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {downloadingFileId === displayedVersion.file.id
                      ? 'Mengunduh...'
                      : 'Unduh File'}
                  </span>
                </button>
              )}
            </div>

            {/* Caption */}
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Caption Publikasi
              </h3>
              <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {displayedVersion.caption}
              </p>
              {displayedVersion.revisionNoteReference && (
                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Terkait catatan revisi: </span>
                  {displayedVersion.revisionNoteReference}
                </div>
              )}
            </div>
          </div>

          {/* Revision & Resubmit Form for Kreator */}
          {editingRevision && canKreatorRevise && (
            <form
              onSubmit={handleSubmitRevision}
              className="bg-white border border-amber-300 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Perbaikan Konten (Akan Membuat Versi {content.currentVersion + 1})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Versi lama tetap tersimpan. Pengajuan ulang dikirim langsung ke{' '}
                    <span className="font-medium text-slate-700">
                      {content.currentApproverName} ({content.currentApproverLevelLabel})
                    </span>
                    .
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="rev-title" className="block text-sm font-medium text-slate-800">
                  Judul Konten
                </label>
                <input
                  id="rev-title"
                  type="text"
                  required
                  minLength={3}
                  maxLength={200}
                  value={revTitle}
                  onChange={(e) => setRevTitle(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="rev-file" className="block text-sm font-medium text-slate-800">
                  Unggah File Baru (Opsional jika hanya memperbaiki teks/jadwal)
                </label>
                <label
                  htmlFor="rev-file"
                  className="mt-1.5 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 cursor-pointer hover:border-blue-500"
                >
                  <Upload className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
                  <span className="text-xs text-slate-700">
                    {revFile
                      ? `${revFile.name} (${formatBytes(revFile.size)})`
                      : `Gunakan file versi sebelumnya (${content.latestVersion.file.originalName}) atau klik untuk ganti file`}
                  </span>
                  <input
                    id="rev-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    onChange={handleRevisionFileChange}
                    className="sr-only"
                  />
                </label>
              </div>

              <div>
                <label htmlFor="rev-caption" className="block text-sm font-medium text-slate-800">
                  Caption Terbaru
                </label>
                <textarea
                  id="rev-caption"
                  rows={4}
                  required
                  minLength={3}
                  maxLength={5000}
                  value={revCaption}
                  onChange={(e) => setRevCaption(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-1.5">Platform</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map((p) => {
                      const active = revPlatforms.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() =>
                            setRevPlatforms((prev) =>
                              prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                            )
                          }
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                            active
                              ? 'border-blue-600 bg-blue-50 text-blue-800'
                              : 'border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label htmlFor="rev-date" className="block text-xs font-medium text-slate-700">
                    Tanggal Publikasi
                  </label>
                  <input
                    id="rev-date"
                    type="date"
                    required
                    value={revDate}
                    onChange={(e) => setRevDate(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="rev-time" className="block text-xs font-medium text-slate-700">
                    Waktu Publikasi
                  </label>
                  <input
                    id="rev-time"
                    type="time"
                    required
                    value={revTime}
                    onChange={(e) => setRevTime(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingRevision(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingRevision}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {submittingRevision
                      ? 'Mengirim Perbaikan...'
                      : `Kirim Versi ${content.currentVersion + 1}`}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Version History Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">
                Riwayat Versi Konten ({content.versions.length})
              </h3>
            </div>

            <div className="divide-y divide-slate-100">
              {content.versions.map((ver) => (
                <div key={ver.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <span className="tabular-nums">Versi {ver.versionNumber}</span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span className="text-xs font-normal text-slate-600">
                        oleh {ver.createdByName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatDateTimeId(ver.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedVersionNumber(ver.versionNumber)}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {displayedVersion.versionNumber === ver.versionNumber
                          ? 'Sedang Ditampilkan'
                          : 'Lihat Preview'}
                      </button>
                      {canDownloadFile && ver.file.downloadUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            handleDownload(ver.file.id, ver.file.downloadUrl, ver.file.originalName)
                          }
                          className="rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Unduh
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{ver.caption}</p>
                  {ver.revisionNoteReference && (
                    <p className="text-xs text-amber-800">
                      Menindaklanjuti revisi: {ver.revisionNoteReference}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Approval Flow, Pimpinan Decision, Replace Approver, Audit Log */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pimpinan Decision Box */}
          {canPimpinanDecide && (
            <div className="bg-white border border-blue-300 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Keputusan Approval Anda ({currentUser.officialLevelLabel})
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tinjau preview materi dan caption di sebelah kiri, lalu pilih keputusan Anda.
                </p>
              </div>

              {!decisionMode ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDecisionMode('approve');
                      setDecisionNote('');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Setujui</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecisionMode('revise');
                      setDecisionNote('');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Revisi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecisionMode('reject');
                      setDecisionNote('');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Tolak</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitDecision} className="space-y-3">
                  <div>
                    <label
                      htmlFor="decision-note"
                      className="block text-xs font-medium text-slate-800"
                    >
                      {decisionMode === 'approve'
                        ? 'Catatan Persetujuan (Opsional)'
                        : decisionMode === 'revise'
                        ? 'Catatan Revisi (Wajib diisi)'
                        : 'Alasan Penolakan (Wajib diisi)'}
                    </label>
                    <textarea
                      id="decision-note"
                      rows={3}
                      required={decisionMode !== 'approve'}
                      minLength={decisionMode !== 'approve' ? 3 : 0}
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder={
                        decisionMode === 'approve'
                          ? 'Tambahkan arahan singkat jika diperlukan...'
                          : decisionMode === 'revise'
                          ? 'Jelaskan bagian desain atau caption yang harus diperbaiki...'
                          : 'Jelaskan alasan penghentian/penolakan konten...'
                      }
                      className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDecisionMode(null);
                        setDecisionNote('');
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submittingDecision}
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
                        decisionMode === 'approve'
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : decisionMode === 'revise'
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-rose-600 hover:bg-rose-700'
                      }`}
                    >
                      {submittingDecision
                        ? 'Menyimpan...'
                        : decisionMode === 'approve'
                        ? 'Konfirmasi Setujui'
                        : decisionMode === 'revise'
                        ? 'Kirim Permintaan Revisi'
                        : 'Konfirmasi Tolak Konten'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Approval Stepper */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">Alur Approval Berjenjang</h3>
            </div>

            <div className="space-y-3">
              {content.approvalSteps.map((step) => {
                const canReplaceThisStep =
                  canKreatorReplaceApprover &&
                  step.status !== 'Disetujui' &&
                  step.status !== 'Ditolak';

                const eligibleReplacements = allUsers.filter(
                  (u) =>
                    u.isActive &&
                    u.role === 'pimpinan' &&
                    u.officialLevel === step.officialLevel &&
                    u.id !== step.approverId
                );

                return (
                  <div
                    key={step.id}
                    className={`rounded-lg border p-3.5 space-y-2 ${
                      step.status === 'Menunggu'
                        ? 'border-blue-300 bg-blue-50/40'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-slate-500">
                          Tahap {step.stepOrder} · {step.officialLevelLabel}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {step.approverName}
                        </p>
                        <p className="text-xs text-slate-500">{step.approverJabatan}</p>
                      </div>
                      <StepStatusBadge status={step.status} />
                    </div>

                    {step.decisionNote && (
                      <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                        <span className="font-medium text-slate-900">Catatan: </span>
                        {step.decisionNote}
                      </div>
                    )}

                    {step.decidedAt && (
                      <p className="text-xs text-slate-500 tabular-nums">
                        Diputuskan {formatDateTimeId(step.decidedAt)}
                      </p>
                    )}

                    {canReplaceThisStep && replacingStep?.id !== step.id && (
                      <div className="pt-1">
                        {eligibleReplacements.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReplacingStep(step);
                              setReplacementApproverId(eligibleReplacements[0].id);
                              setReplacementReason('');
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
                          >
                            <RefreshCw className="h-3 w-3" aria-hidden="true" />
                            <span>Ganti Pejabat (Jika Berhalangan)</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Tidak ada pejabat aktif lain pada jenjang {step.officialLevelLabel}
                          </span>
                        )}
                      </div>
                    )}

                    {replacingStep?.id === step.id && (
                      <form
                        onSubmit={handleReplaceApprover}
                        className="mt-2 pt-2.5 border-t border-slate-200 space-y-2.5"
                      >
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Pilih Pejabat Pengganti ({step.officialLevelLabel})
                          </label>
                          <select
                            required
                            value={replacementApproverId}
                            onChange={(e) => setReplacementApproverId(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          >
                            {eligibleReplacements.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.jabatan})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700">
                            Keterangan Penggantian (Opsional)
                          </label>
                          <input
                            type="text"
                            maxLength={200}
                            value={replacementReason}
                            onChange={(e) => setReplacementReason(e.target.value)}
                            placeholder="Contoh: Pejabat sebelumnya sedang dinas luar"
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReplacingStep(null)}
                            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={submittingReplace}
                            className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                          >
                            {submittingReplace ? 'Menyimpan...' : 'Simpan Pengganti'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Immutable Activity & Audit History */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Riwayat Aktivitas & Persetujuan
              </h3>
              <p className="text-xs text-slate-500">
                Catatan audit permanen seluruh keputusan dan perubahan pejabat.
              </p>
            </div>

            <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
              {content.activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {log.actorName}{' '}
                      <span className="font-normal text-slate-500">
                        ({ROLE_LABELS[log.actorRole]})
                      </span>
                    </span>
                    <span className="text-slate-400 tabular-nums shrink-0">
                      {formatDateTimeId(log.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{log.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
