import type {
  ContentDetail,
  ContentSummary,
  NotificationItem,
  OfficialLevel,
  PlatformType,
  UserPublic,
  UserRole,
  WorkspaceMode,
} from './types.ts';

// Hold Bearer session token strictly in JS memory (never localStorage/sessionStorage)
let memoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      `Terjadi kesalahan server (${res.status}).`;
    throw new Error(message);
  }

  return data as T;
}

export interface AuthResponse {
  token: string;
  workspace: WorkspaceMode;
  user: UserPublic;
}

export const api = {
  getBootstrapStatus(): Promise<{ needsBootstrap: boolean }> {
    return apiFetch('/api/auth/bootstrap-status');
  },

  bootstrapAdmin(payload: {
    name: string;
    email: string;
    password: string;
    jabatan: string;
  }): Promise<AuthResponse> {
    return apiFetch('/api/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(email: string, password: string): Promise<AuthResponse> {
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  adminRecovery(payload: {
    email: string;
    recoveryKey: string;
    newPassword: string;
  }): Promise<AuthResponse> {
    return apiFetch('/api/auth/admin-recovery', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getDemoAccounts(): Promise<{ accounts: UserPublic[] }> {
    return apiFetch('/api/auth/demo-accounts');
  },

  demoLogin(userId: string): Promise<AuthResponse> {
    return apiFetch('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  getMe(): Promise<{ user: UserPublic; workspace: WorkspaceMode }> {
    return apiFetch('/api/auth/me');
  },

  resetDemo(): Promise<{ ok: boolean }> {
    return apiFetch('/api/demo/reset', { method: 'POST' });
  },

  getUsers(): Promise<{ users: UserPublic[] }> {
    return apiFetch('/api/users');
  },

  createUser(payload: {
    name: string;
    email: string;
    password: string;
    jabatan: string;
    role: UserRole;
    officialLevel: OfficialLevel | null;
  }): Promise<{ user: UserPublic }> {
    return apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateUser(
    id: string,
    payload: {
      name?: string;
      jabatan?: string;
      role?: UserRole;
      officialLevel?: OfficialLevel | null;
      isActive?: boolean;
      newPassword?: string;
    }
  ): Promise<{ user: UserPublic }> {
    return apiFetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getContents(params?: {
    status?: string;
    platform?: string;
    search?: string;
    scope?: string;
  }): Promise<{ contents: ContentSummary[] }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.search) qs.set('search', params.search);
    if (params?.scope) qs.set('scope', params.scope);
    const query = qs.toString();
    return apiFetch(`/api/contents${query ? `?${query}` : ''}`);
  },

  getContentDetail(id: string): Promise<{ content: ContentDetail }> {
    return apiFetch(`/api/contents/${encodeURIComponent(id)}`);
  },

  createContent(payload: {
    title: string;
    caption: string;
    platforms: PlatformType[];
    publishDate: string;
    publishTime: string;
    approverIds: string[];
    file: File;
  }): Promise<{ content: ContentDetail }> {
    const form = new FormData();
    form.append('title', payload.title);
    form.append('caption', payload.caption);
    form.append('platformsJson', JSON.stringify(payload.platforms));
    form.append('publishDate', payload.publishDate);
    form.append('publishTime', payload.publishTime);
    form.append('approverIdsJson', JSON.stringify(payload.approverIds));
    form.append('file', payload.file);
    return apiFetch('/api/contents', {
      method: 'POST',
      body: form,
    });
  },

  resubmitContent(
    id: string,
    payload: {
      title: string;
      caption: string;
      platforms: PlatformType[];
      publishDate: string;
      publishTime: string;
      file?: File | null;
    }
  ): Promise<{ content: ContentDetail }> {
    const form = new FormData();
    form.append('title', payload.title);
    form.append('caption', payload.caption);
    form.append('platformsJson', JSON.stringify(payload.platforms));
    form.append('publishDate', payload.publishDate);
    form.append('publishTime', payload.publishTime);
    if (payload.file) {
      form.append('file', payload.file);
    }
    return apiFetch(`/api/contents/${encodeURIComponent(id)}/resubmit`, {
      method: 'POST',
      body: form,
    });
  },

  submitDecision(
    id: string,
    payload: { decision: 'approve' | 'revise' | 'reject'; note?: string }
  ): Promise<{ content: ContentDetail }> {
    return apiFetch(`/api/contents/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  replaceApprover(
    id: string,
    payload: { stepId: string; newApproverId: string; reason?: string }
  ): Promise<{ content: ContentDetail }> {
    return apiFetch(`/api/contents/${encodeURIComponent(id)}/replace-approver`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getNotifications(): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
    return apiFetch('/api/notifications');
  },

  markNotificationRead(id: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
  },

  markAllNotificationsRead(): Promise<{ ok: boolean }> {
    return apiFetch('/api/notifications/read-all', { method: 'POST' });
  },
};

export async function downloadProtectedFile(
  downloadUrl: string,
  filename: string
): Promise<void> {
  const headers = new Headers();
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  const res = await fetch(downloadUrl, { headers });
  if (!res.ok) {
    let msg = 'Gagal mengunduh berkas.';
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDateTimeId(iso: string): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateId(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(y, m - 1, d));
  } catch {
    return dateStr;
  }
}
