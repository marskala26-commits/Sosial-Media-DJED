/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  FilePlus2,
  FlaskConical,
  History,
  LayoutList,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { api, formatDateTimeId, setAuthToken, type AuthResponse } from './api.ts';
import { ContentDetailView } from './components/ContentDetailView.tsx';
import { ContentListView } from './components/ContentListView.tsx';
import { LoginView } from './components/LoginView.tsx';
import { NewContentView } from './components/NewContentView.tsx';
import { UserManagementView } from './components/UserManagementView.tsx';
import {
  ROLE_LABELS,
  type NotificationItem,
  type UserPublic,
  type WorkspaceMode,
} from './types.ts';

type ActiveRoute =
  | { view: 'contents'; scope: 'all' | 'my_approvals' | 'my_history' }
  | { view: 'new_content' }
  | { view: 'detail'; contentId: string }
  | { view: 'users' };

function getDefaultRouteForRole(user: UserPublic): ActiveRoute {
  switch (user.role) {
    case 'admin_humas':
      return { view: 'users' };
    case 'pimpinan':
      return { view: 'contents', scope: 'my_approvals' };
    case 'kreator':
    default:
      return { view: 'contents', scope: 'all' };
  }
}

export default function App() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceMode>('prod');
  const [route, setRoute] = useState<ActiveRoute>({ view: 'contents', scope: 'all' });

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore transient polling failures
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    return () => clearInterval(interval);
  }, [user, loadNotifications]);

  function handleLoginSuccess(auth: AuthResponse) {
    setAuthToken(auth.token);
    setUser(auth.user);
    setWorkspace(auth.workspace);
    setRoute(getDefaultRouteForRole(auth.user));
    setNotifOpen(false);
  }

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
    setNotifOpen(false);
    setMobileMenuOpen(false);
  }

  async function handleNotificationClick(n: NotificationItem) {
    if (!n.isRead) {
      await api.markNotificationRead(n.id);
      await loadNotifications();
    }
    setNotifOpen(false);
    if (n.contentId) {
      setRoute({ view: 'detail', contentId: n.contentId });
    }
  }

  async function handleMarkAllRead() {
    await api.markAllNotificationsRead();
    await loadNotifications();
  }

  async function handleResetDemo() {
    if (workspace !== 'demo') return;
    setResettingDemo(true);
    try {
      await api.resetDemo();
      const me = await api.getMe();
      setUser(me.user);
      setRoute(getDefaultRouteForRole(me.user));
      await loadNotifications();
    } finally {
      setResettingDemo(false);
    }
  }

  if (!user) {
    return <LoginView onSuccess={handleLoginSuccess} />;
  }

  const navItems: Array<{
    key: string;
    label: string;
    icon: typeof LayoutList;
    active: boolean;
    onClick: () => void;
  }> = [];

  if (user.role === 'pimpinan') {
    navItems.push(
      {
        key: 'my_approvals',
        label: 'Menunggu Approval',
        icon: ShieldCheck,
        active: route.view === 'contents' && route.scope === 'my_approvals',
        onClick: () => setRoute({ view: 'contents', scope: 'my_approvals' }),
      },
      {
        key: 'my_history',
        label: 'Riwayat Approval',
        icon: History,
        active: route.view === 'contents' && route.scope === 'my_history',
        onClick: () => setRoute({ view: 'contents', scope: 'my_history' }),
      },
      {
        key: 'all_contents',
        label: 'Semua Konten',
        icon: LayoutList,
        active: route.view === 'contents' && route.scope === 'all',
        onClick: () => setRoute({ view: 'contents', scope: 'all' }),
      }
    );
  } else {
    navItems.push({
      key: 'all_contents',
      label: 'Daftar Konten',
      icon: LayoutList,
      active: route.view === 'contents' && route.scope === 'all',
      onClick: () => setRoute({ view: 'contents', scope: 'all' }),
    });
  }

  if (user.role === 'kreator') {
    navItems.push({
      key: 'new_content',
      label: 'Buat Konten Baru',
      icon: FilePlus2,
      active: route.view === 'new_content',
      onClick: () => setRoute({ view: 'new_content' }),
    });
  }

  if (user.role === 'admin_humas') {
    navItems.push({
      key: 'users',
      label: 'Manajemen Pengguna',
      icon: Users,
      active: route.view === 'users',
      onClick: () => setRoute({ view: 'users' }),
    });
  }

  const breadcrumbTitle =
    route.view === 'users'
      ? 'Manajemen Pengguna'
      : route.view === 'new_content'
      ? 'Buat Konten Baru'
      : route.view === 'detail'
      ? 'Detail Konten & Approval'
      : route.scope === 'my_approvals'
      ? 'Menunggu Approval'
      : route.scope === 'my_history'
      ? 'Riwayat Approval'
      : 'Daftar Konten';

  const SidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white border-r border-slate-200">
      <div>
        {/* Brand */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
          <span className="font-display text-base font-bold tracking-tight text-blue-900 whitespace-nowrap">
            Social Media Content Hub
          </span>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Tutup menu"
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Demo Mode Banner */}
        {workspace === 'demo' && (
          <div className="mx-3 mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
              <FlaskConical className="h-3.5 w-3.5 text-blue-700 shrink-0" aria-hidden="true" />
              <span>MODE DEMO (TERPISAH)</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-snug">
              Data ini berlabel DEMO untuk pengujian dan tidak tercampur data produksi.
            </p>
            <button
              type="button"
              disabled={resettingDemo}
              onClick={handleResetDemo}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100/50 disabled:opacity-60"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span>{resettingDemo ? 'Mereset...' : 'Reset Data Demo'}</span>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav aria-label="Navigasi Utama" className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  item.onClick();
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  item.active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    item.active ? 'text-blue-700' : 'text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Logout */}
      <div className="p-3 border-t border-slate-200">
        <div className="px-3 py-2 text-xs text-slate-500">
          <div className="font-medium text-slate-900 truncate">{user.name}</div>
          <div className="truncate">
            {ROLE_LABELS[user.role]}
            {user.officialLevelLabel ? ` · ${user.officialLevelLabel}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{SidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">
                Social Media Content Hub
              </span>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{breadcrumbTitle}</h1>
              {workspace === 'demo' && (
                <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">
                  · DEMO
                </span>
              )}
            </div>
          </div>

          {/* User Identity & Notifications */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
                className="relative inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-700 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 z-20 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">Notifikasi</span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-blue-700 hover:text-blue-800"
                        >
                          Tandai semua dibaca
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="py-8 px-4 text-center text-xs text-slate-500">
                          Belum ada notifikasi.
                        </p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleNotificationClick(n)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                              !n.isRead ? 'bg-blue-50/40' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`text-xs font-semibold ${
                                  !n.isRead ? 'text-blue-900' : 'text-slate-800'
                                }`}
                              >
                                {n.title}
                              </span>
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                {formatDateTimeId(n.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 leading-snug">{n.message}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Identity */}
            <div className="hidden sm:block text-right border-l border-slate-200 pl-3">
              <div className="text-sm font-medium text-slate-900 leading-tight">{user.name}</div>
              <div className="text-xs text-slate-500">
                {ROLE_LABELS[user.role]}
                {user.officialLevelLabel ? ` · ${user.officialLevelLabel}` : ''}
              </div>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {route.view === 'contents' && (
            <ContentListView
              currentUser={user}
              scope={route.scope}
              onSelectContent={(contentId) => setRoute({ view: 'detail', contentId })}
              onCreateNew={() => setRoute({ view: 'new_content' })}
            />
          )}

          {route.view === 'new_content' && user.role === 'kreator' && (
            <NewContentView
              onCancel={() => setRoute({ view: 'contents', scope: 'all' })}
              onCreated={(contentId) => {
                loadNotifications();
                setRoute({ view: 'detail', contentId });
              }}
            />
          )}

          {route.view === 'detail' && (
            <ContentDetailView
              contentId={route.contentId}
              currentUser={user}
              onBack={() =>
                setRoute(
                  user.role === 'pimpinan'
                    ? { view: 'contents', scope: 'my_approvals' }
                    : { view: 'contents', scope: 'all' }
                )
              }
              onNotificationsChanged={loadNotifications}
            />
          )}

          {route.view === 'users' && user.role === 'admin_humas' && (
            <UserManagementView currentUser={user} />
          )}
        </main>
      </div>
    </div>
  );
}
