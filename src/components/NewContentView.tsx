import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, Upload, AlertCircle, Check } from 'lucide-react';
import { api, formatBytes } from '../api.ts';
import {
  OFFICIAL_LEVEL_LABELS,
  type OfficialLevel,
  type PlatformType,
  type UserPublic,
} from '../types.ts';

interface NewContentViewProps {
  onCancel: () => void;
  onCreated: (contentId: string) => void;
}

const PLATFORMS: PlatformType[] = ['Instagram', 'Facebook', 'YouTube'];
const TIERS: OfficialLevel[] = [1, 2, 3];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function NewContentView({ onCancel, onCreated }: NewContentViewProps) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [platforms, setPlatforms] = useState<PlatformType[]>(['Instagram']);
  const [publishDate, setPublishDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [publishTime, setPublishTime] = useState('09:00');
  const [file, setFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);

  const [pimpinanUsers, setPimpinanUsers] = useState<UserPublic[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Selected approver ID per tier (1, 2, 3)
  const [selectedByTier, setSelectedByTier] = useState<Partial<Record<OfficialLevel, string>>>({});
  const [enabledTiers, setEnabledTiers] = useState<Record<OfficialLevel, boolean>>({
    1: true,
    2: true,
    3: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadApprovers() {
      try {
        const res = await api.getUsers();
        if (!active) return;
        const activePimpinan = res.users.filter((u) => u.role === 'pimpinan' && u.isActive);
        setPimpinanUsers(activePimpinan);

        // Preselect the first available active official in each tier if present
        const defaults: Partial<Record<OfficialLevel, string>> = {};
        const defaultEnabled: Record<OfficialLevel, boolean> = { 1: false, 2: false, 3: false };
        for (const tier of TIERS) {
          const match = activePimpinan.find((u) => u.officialLevel === tier);
          if (match) {
            defaults[tier] = match.id;
            defaultEnabled[tier] = true;
          }
        }
        setSelectedByTier(defaults);
        setEnabledTiers(defaultEnabled);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat daftar pejabat.');
        }
      } finally {
        if (active) setLoadingUsers(false);
      }
    }
    loadApprovers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [previewObjectUrl]);

  const usersByTier = useMemo(() => {
    const grouped: Record<OfficialLevel, UserPublic[]> = { 1: [], 2: [], 3: [] };
    for (const u of pimpinanUsers) {
      if (u.officialLevel === 1 || u.officialLevel === 2 || u.officialLevel === 3) {
        grouped[u.officialLevel].push(u);
      }
    }
    return grouped;
  }, [pimpinanUsers]);

  const orderedApproverChain = useMemo(() => {
    const list: UserPublic[] = [];
    for (const tier of TIERS) {
      if (!enabledTiers[tier]) continue;
      const uid = selectedByTier[tier];
      const user = usersByTier[tier].find((u) => u.id === uid);
      if (user) list.push(user);
    }
    return list;
  }, [enabledTiers, selectedByTier, usersByTier]);

  function togglePlatform(p: PlatformType) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
      return;
    }

    const validMime =
      picked.type.startsWith('image/') ||
      picked.type === 'video/mp4' ||
      picked.type === 'video/webm' ||
      picked.type === 'video/quicktime';

    if (!validMime) {
      setError('Format file harus berupa gambar (JPG, PNG, WEBP) atau video (MP4, WEBM, MOV).');
      e.target.value = '';
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      setError('Ukuran file maksimal 50 MB.');
      e.target.value = '';
      return;
    }

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    setFile(picked);
    setPreviewObjectUrl(URL.createObjectURL(picked));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError('File desain gambar atau video wajib diunggah.');
      return;
    }
    if (platforms.length === 0) {
      setError('Pilih minimal satu platform media sosial.');
      return;
    }
    if (orderedApproverChain.length === 0) {
      setError('Pilih minimal satu pejabat approval yang aktif.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createContent({
        title,
        caption,
        platforms,
        publishDate,
        publishTime,
        approverIds: orderedApproverChain.map((u) => u.id),
        file,
      });
      onCreated(res.content.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan konten baru.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Kembali</span>
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            Buat Konten Media Sosial Baru
          </h2>
          <p className="text-xs text-slate-500">
            Lengkapi materi desain, caption, jadwal tayang, serta jenjang pejabat approval.
          </p>
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

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div>
          <label htmlFor="content-title" className="block text-sm font-medium text-slate-800">
            Judul Konten
          </label>
          <input
            id="content-title"
            type="text"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Sosialisasi Layanan Administrasi Terpadu Triwulan IV"
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        {/* File Upload */}
        <div>
          <label htmlFor="content-file" className="block text-sm font-medium text-slate-800">
            Upload Desain Gambar atau Video
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Format didukung: JPG, PNG, WEBP, MP4, WEBM, MOV. Ukuran maksimal 50 MB.
          </p>

          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <label
              htmlFor="content-file"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/40 transition-colors"
            >
              <Upload className="h-6 w-6 text-blue-600 mb-2" aria-hidden="true" />
              <span className="text-sm font-medium text-slate-800">
                {file ? file.name : 'Pilih berkas desain atau video'}
              </span>
              <span className="mt-1 text-xs text-slate-500 tabular-nums">
                {file ? formatBytes(file.size) : 'Klik untuk memilih dari perangkat'}
              </span>
              <input
                id="content-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {previewObjectUrl && file && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                {file.type.startsWith('video/') ? (
                  <video
                    src={previewObjectUrl}
                    controls
                    className="w-full max-h-56 rounded-lg bg-slate-900"
                  />
                ) : (
                  <img
                    src={previewObjectUrl}
                    alt="Preview desain konten"
                    className="w-full max-h-56 object-contain rounded-lg"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Caption */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="content-caption" className="block text-sm font-medium text-slate-800">
              Caption
            </label>
            <span className="text-xs text-slate-400 tabular-nums">
              {caption.length} / 5000 karakter
            </span>
          </div>
          <textarea
            id="content-caption"
            rows={5}
            required
            minLength={3}
            maxLength={5000}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Tulis teks caption, ajakan tindak lanjut, dan tagar resmi instansi..."
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 leading-relaxed focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>

        {/* Platforms & Schedule */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <span className="block text-sm font-medium text-slate-800">
              Pilihan Platform Media Sosial
            </span>
            <p className="mt-0.5 text-xs text-slate-500">Dapat memilih lebih dari satu platform.</p>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {PLATFORMS.map((p) => {
                const checked = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    aria-pressed={checked}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                      checked
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        checked
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>
                    <span>{p}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="publish-date" className="block text-sm font-medium text-slate-800">
                Tanggal Publikasi
              </label>
              <input
                id="publish-date"
                type="date"
                required
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
            <div>
              <label htmlFor="publish-time" className="block text-sm font-medium text-slate-800">
                Waktu Publikasi
              </label>
              <input
                id="publish-time"
                type="time"
                required
                value={publishTime}
                onChange={(e) => setPublishTime(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
          </div>
        </div>

        {/* Approval Officials Hierarchy */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Daftar Pejabat Approval Berjenjang
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Pilih satu atau beberapa pejabat. Sistem otomatis mengurutkan dari jenjang terendah
              ke tertinggi (Kepala Seksi → Kepala Bagian → Pimpinan Terakhir).
            </p>
          </div>

          {loadingUsers ? (
            <div className="h-24 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <div className="space-y-3">
              {TIERS.map((tier) => {
                const candidates = usersByTier[tier];
                const isEnabled = enabledTiers[tier];
                return (
                  <div
                    key={tier}
                    className={`rounded-lg border p-3.5 transition-colors ${
                      isEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          disabled={candidates.length === 0}
                          onChange={(e) =>
                            setEnabledTiers((prev) => ({ ...prev, [tier]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <span className="text-sm font-medium text-slate-900">
                          {tier}. {OFFICIAL_LEVEL_LABELS[tier]}
                        </span>
                      </label>

                      <div className="sm:w-80">
                        {candidates.length === 0 ? (
                          <span className="text-xs text-slate-500">
                            Belum ada akun Pimpinan aktif pada jenjang ini.
                          </span>
                        ) : (
                          <select
                            disabled={!isEnabled}
                            value={selectedByTier[tier] || ''}
                            onChange={(e) =>
                              setSelectedByTier((prev) => ({ ...prev, [tier]: e.target.value }))
                            }
                            aria-label={`Pilih pejabat ${OFFICIAL_LEVEL_LABELS[tier]}`}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:border-blue-600 focus:outline-none"
                          >
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.jabatan})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {orderedApproverChain.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Urutan Approval Aktif: </span>
              {orderedApproverChain
                .map((u, idx) => `${idx + 1}. ${u.officialLevelLabel} (${u.name})`)
                .join('  →  ')}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting || orderedApproverChain.length === 0}
            className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Mengirim Konten...' : 'Ajukan Approval'}
          </button>
        </div>
      </form>
    </div>
  );
}
