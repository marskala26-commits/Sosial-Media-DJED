import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Edit3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api.ts';
import {
  OFFICIAL_LEVEL_LABELS,
  ROLE_LABELS,
  type OfficialLevel,
  type UserPublic,
  type UserRole,
} from '../types.ts';

interface UserManagementViewProps {
  currentUser: UserPublic;
}

export function UserManagementView({ currentUser }: UserManagementViewProps) {
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add user modal/form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newJabatan, setNewJabatan] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('kreator');
  const [newLevel, setNewLevel] = useState<OfficialLevel>(1);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit user state
  const [editingUser, setEditingUser] = useState<UserPublic | null>(null);
  const [editName, setEditName] = useState('');
  const [editJabatan, setEditJabatan] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('kreator');
  const [editLevel, setEditLevel] = useState<OfficialLevel>(1);
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pengguna.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSubmittingAdd(true);
    try {
      await api.createUser({
        name: newName,
        email: newEmail,
        password: newPassword,
        jabatan: newJabatan,
        role: newRole,
        officialLevel: newRole === 'pimpinan' ? newLevel : null,
      });
      setShowAddForm(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewJabatan('');
      setNewRole('kreator');
      setNewLevel(1);
      setNotice('Akun pengguna baru berhasil ditambahkan.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambahkan pengguna.');
    } finally {
      setSubmittingAdd(false);
    }
  }

  function startEdit(user: UserPublic) {
    setEditingUser(user);
    setEditName(user.name);
    setEditJabatan(user.jabatan);
    setEditRole(user.role);
    setEditLevel(user.officialLevel ?? 1);
    setEditActive(user.isActive);
    setEditPassword('');
    setError(null);
    setNotice(null);
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    setNotice(null);
    setSubmittingEdit(true);
    try {
      await api.updateUser(editingUser.id, {
        name: editName,
        jabatan: editJabatan,
        role: editRole,
        officialLevel: editRole === 'pimpinan' ? editLevel : null,
        isActive: editActive,
        newPassword: editPassword.trim() ? editPassword : undefined,
      });
      setEditingUser(null);
      setNotice('Data pengguna berhasil diperbarui.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui pengguna.');
    } finally {
      setSubmittingEdit(false);
    }
  }

  async function handleToggleActive(user: UserPublic) {
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, { isActive: !user.isActive });
      setNotice(
        !user.isActive
          ? `Akun ${user.name} diaktifkan kembali.`
          : `Akun ${user.name} berhasil dinonaktifkan.`
      );
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status akun.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            Manajemen Akun Pengguna
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Kelola akun Admin Humas, Kreator / Editor, dan Pimpinan approval instansi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowAddForm((prev) => !prev);
            setEditingUser(null);
            setError(null);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span>{showAddForm ? 'Tutup Formulir' : 'Tambah Pengguna'}</span>
        </button>
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

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* Add User Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateUser}
          className="bg-white border border-blue-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900">Tambah Pengguna Baru</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="add-name" className="block text-sm font-medium text-slate-700">
                Nama Lengkap
              </label>
              <input
                id="add-name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="add-email" className="block text-sm font-medium text-slate-700">
                Email Resmi
              </label>
              <input
                id="add-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="add-jabatan" className="block text-sm font-medium text-slate-700">
                Jabatan
              </label>
              <input
                id="add-jabatan"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={newJabatan}
                onChange={(e) => setNewJabatan(e.target.value)}
                placeholder="Contoh: Kepala Seksi Publikasi Media"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="add-password" className="block text-sm font-medium text-slate-700">
                Password Awal (Minimal 8 Karakter)
              </label>
              <input
                id="add-password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="add-role" className="block text-sm font-medium text-slate-700">
                Peran Hak Akses
              </label>
              <select
                id="add-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
              >
                <option value="kreator">Kreator / Editor</option>
                <option value="pimpinan">Pimpinan (Approval)</option>
                <option value="admin_humas">Admin Humas</option>
              </select>
            </div>
            {newRole === 'pimpinan' && (
              <div>
                <label htmlFor="add-level" className="block text-sm font-medium text-slate-700">
                  Jenjang Approval Pimpinan
                </label>
                <select
                  id="add-level"
                  value={newLevel}
                  onChange={(e) => setNewLevel(Number(e.target.value) as OfficialLevel)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
                >
                  <option value={1}>1. Kepala Seksi</option>
                  <option value={2}>2. Kepala Bagian</option>
                  <option value={3}>3. Pimpinan Terakhir</option>
                </select>
              </div>
            )}
          </div>
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submittingAdd}
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submittingAdd ? 'Menyimpan...' : 'Simpan Pengguna'}
            </button>
          </div>
        </form>
      )}

      {/* Edit User Form */}
      {editingUser && (
        <form
          onSubmit={handleSaveEdit}
          className="bg-white border border-blue-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-900">
            Ubah Data Pengguna: {editingUser.email}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-slate-700">
                Nama Lengkap
              </label>
              <input
                id="edit-name"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-jabatan" className="block text-sm font-medium text-slate-700">
                Jabatan
              </label>
              <input
                id="edit-jabatan"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={editJabatan}
                onChange={(e) => setEditJabatan(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="edit-role" className="block text-sm font-medium text-slate-700">
                Peran
              </label>
              <select
                id="edit-role"
                value={editRole}
                disabled={editingUser.id === currentUser.id}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="kreator">Kreator / Editor</option>
                <option value="pimpinan">Pimpinan (Approval)</option>
                <option value="admin_humas">Admin Humas</option>
              </select>
            </div>
            {editRole === 'pimpinan' && (
              <div>
                <label htmlFor="edit-level" className="block text-sm font-medium text-slate-700">
                  Jenjang Approval Pimpinan
                </label>
                <select
                  id="edit-level"
                  value={editLevel}
                  onChange={(e) => setEditLevel(Number(e.target.value) as OfficialLevel)}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
                >
                  <option value={1}>1. Kepala Seksi</option>
                  <option value={2}>2. Kepala Bagian</option>
                  <option value={3}>3. Pimpinan Terakhir</option>
                </select>
              </div>
            )}
            <div>
              <label htmlFor="edit-pass" className="block text-sm font-medium text-slate-700">
                Reset Password (Opsional)
              </label>
              <input
                id="edit-pass"
                type="password"
                minLength={8}
                maxLength={128}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Kosongkan jika tidak diubah"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div className="flex items-center pt-6">
              <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editActive}
                  disabled={editingUser.id === currentUser.id}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                <span>Akun Aktif</span>
              </label>
            </div>
          </div>
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submittingEdit}
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {submittingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Nama & Email</th>
                <th className="py-3 px-4">Jabatan</th>
                <th className="py-3 px-4">Peran</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="py-4 px-4">
                      <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (
                users.map((u) => (
                  <tr key={u.id} className={!u.isActive ? 'bg-slate-50/60 opacity-75' : ''}>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{u.jabatan}</td>
                    <td className="py-3.5 px-4 text-slate-700">
                      <div>{ROLE_LABELS[u.role]}</div>
                      {u.officialLevel && (
                        <div className="text-xs text-slate-500">
                          Jenjang {u.officialLevel}: {OFFICIAL_LEVEL_LABELS[u.officialLevel]}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {u.isActive ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Edit3 className="h-3 w-3" aria-hidden="true" />
                          <span>Ubah</span>
                        </button>
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                              u.isActive
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        )}
                      </div>
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
