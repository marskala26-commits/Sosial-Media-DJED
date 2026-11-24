import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck, FlaskConical, ArrowRight, AlertCircle } from 'lucide-react';
import { api, type AuthResponse } from '../api.ts';
import { ROLE_LABELS, type UserPublic } from '../types.ts';

interface LoginViewProps {
  onSuccess: (auth: AuthResponse) => void;
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [mode, setMode] = useState<'prod' | 'demo'>('prod');
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean>(false);
  const [checkingBootstrap, setCheckingBootstrap] = useState<boolean>(true);

  // Login / Bootstrap state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [bootstrapName, setBootstrapName] = useState('');
  const [bootstrapJabatan, setBootstrapJabatan] = useState('Koordinator Tata Usaha Humas');

  // Demo accounts
  const [demoAccounts, setDemoAccounts] = useState<UserPublic[]>([]);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [bootRes, demoRes] = await Promise.all([
          api.getBootstrapStatus(),
          api.getDemoAccounts(),
        ]);
        if (!active) return;
        setNeedsBootstrap(bootRes.needsBootstrap);
        setDemoAccounts(demoRes.accounts);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat status sistem.');
        }
      } finally {
        if (active) setCheckingBootstrap(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  async function handleProdSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const auth = needsBootstrap
        ? await api.bootstrapAdmin({
            name: bootstrapName,
            email,
            password,
            jabatan: bootstrapJabatan,
          })
        : recoveryMode
        ? await api.adminRecovery({
            email,
            recoveryKey,
            newPassword,
          })
        : await api.login(email, password);
      onSuccess(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke aplikasi.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin(userId: string) {
    setError(null);
    setLoadingDemo(true);
    try {
      const auth = await api.demoLogin(userId);
      onSuccess(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke mode demo.');
    } finally {
      setLoadingDemo(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Left Institutional Context Panel */}
        <div className="lg:col-span-5 bg-blue-900 text-white p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-blue-200">
              Portal Internal Tim Humas
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white leading-snug">
              Social Media Content Hub
            </h1>
            <p className="mt-3 text-sm text-blue-100 leading-relaxed">
              Sistem koordinasi materi publikasi Instagram, Facebook, dan YouTube dengan alur
              persetujuan pimpinan berjenjang serta dokumentasi revisi yang terstruktur.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-blue-800 space-y-3 text-xs text-blue-100">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-blue-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Akses internal terbatas. Akun pengguna dikelola langsung oleh Admin Humas tanpa
                registrasi publik.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <FlaskConical className="h-4 w-4 text-blue-300 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Tersedia Mode Demo terpisah untuk pengujian alur kerja seluruh peran tanpa
                memengaruhi data produksi.
              </span>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-7 p-8">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => {
                setMode('prod');
                setError(null);
              }}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'prod'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Masuk Akun Resmi
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('demo');
                setError(null);
              }}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'demo'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mode Demo (DEMO)
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800"
            >
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'prod' ? (
            checkingBootstrap ? (
              <div className="mt-8 space-y-4">
                <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
                <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ) : (
              <form onSubmit={handleProdSubmit} className="mt-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {needsBootstrap
                      ? 'Aktivasi Admin Humas Pertama'
                      : recoveryMode
                      ? 'Atur Ulang Password Admin Humas'
                      : 'Masuk ke Sistem'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {needsBootstrap
                      ? 'Belum ada akun terdaftar pada lingkungan produksi. Daftarkan Admin Humas pertama untuk mulai mengelola pengguna.'
                      : recoveryMode
                      ? 'Masukkan email Admin Humas, kunci pemulihan (ADMIN_RECOVERY_KEY dari Secrets server), dan password baru.'
                      : 'Masukkan email dan kata sandi akun instansi Anda.'}
                  </p>
                </div>

                {needsBootstrap && (
                  <>
                    <div>
                      <label htmlFor="bootstrap-name" className="block text-sm font-medium text-slate-700">
                        Nama Lengkap
                      </label>
                      <input
                        id="bootstrap-name"
                        type="text"
                        required
                        minLength={2}
                        maxLength={100}
                        value={bootstrapName}
                        onChange={(e) => setBootstrapName(e.target.value)}
                        placeholder="Contoh: Budi Santoso"
                        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="bootstrap-jabatan" className="block text-sm font-medium text-slate-700">
                        Jabatan
                      </label>
                      <input
                        id="bootstrap-jabatan"
                        type="text"
                        required
                        minLength={2}
                        maxLength={120}
                        value={bootstrapJabatan}
                        onChange={(e) => setBootstrapJabatan(e.target.value)}
                        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@instansi.go.id"
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>

                {recoveryMode ? (
                  <>
                    <div>
                      <label
                        htmlFor="recovery-key"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Kunci Pemulihan (ADMIN_RECOVERY_KEY)
                      </label>
                      <input
                        id="recovery-key"
                        type="password"
                        required
                        value={recoveryKey}
                        onChange={(e) => setRecoveryKey(e.target.value)}
                        placeholder="Sesuai nilai ADMIN_RECOVERY_KEY di Secrets"
                        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="recovery-new-pass"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Password Baru (Minimal 8 Karakter)
                      </label>
                      <input
                        id="recovery-new-pass"
                        type="password"
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 8 karakter"
                        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={needsBootstrap ? 8 : 1}
                        autoComplete={needsBootstrap ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={needsBootstrap ? 'Minimal 8 karakter' : 'Masukkan password'}
                        className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60 transition-colors"
                  >
                    <span>
                      {submitting
                        ? 'Memproses...'
                        : needsBootstrap
                        ? 'Aktifkan Admin Humas & Masuk'
                        : recoveryMode
                        ? 'Simpan Password Baru & Masuk'
                        : 'Masuk'}
                    </span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {!needsBootstrap && (
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Tidak tersedia pendaftaran mandiri. Akun dikelola oleh Admin Humas.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryMode((prev) => !prev);
                        setError(null);
                      }}
                      className="text-blue-700 font-medium hover:text-blue-800 whitespace-nowrap shrink-0 text-left"
                    >
                      {recoveryMode ? 'Kembali ke Login' : 'Lupa password Admin?'}
                    </button>
                  </div>
                )}
              </form>
            )
          ) : (
            <div className="mt-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5">
                <p className="text-xs font-semibold text-blue-900">
                  DEMO · Lingkungan Pengujian Awal
                </p>
                <p className="mt-0.5 text-xs text-blue-800">
                  Data demo tersimpan terpisah dari data produksi dan diberi label DEMO. Pilih
                  salah satu peran di bawah untuk menguji alur aplikasi.
                </p>
              </div>

              <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    disabled={loadingDemo}
                    onClick={() => handleDemoLogin(acc.id)}
                    className="w-full text-left flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 hover:border-blue-400 hover:bg-blue-50/40 transition-colors disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{acc.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {ROLE_LABELS[acc.role]}
                        {acc.officialLevelLabel ? ` · ${acc.officialLevelLabel}` : ''} ·{' '}
                        {acc.jabatan}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
                      Masuk DEMO
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
