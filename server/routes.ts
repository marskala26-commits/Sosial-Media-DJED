import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import {
  createMediaPreviewToken,
  createSessionToken,
  hashPassword,
  verifyMediaPreviewToken,
  verifyPassword,
  verifySessionToken,
} from './auth.ts';
import { getDb, getUploadsDir } from './db.ts';
import { DEMO_ASSET_FILES, ensureDemoSeeded, resetDemoDb } from './seedDemo.ts';
import {
  OFFICIAL_LEVEL_LABELS,
  type ActivityLogItem,
  type ApprovalStep,
  type ContentDetail,
  type ContentSummary,
  type ContentVersion,
  type NotificationItem,
  type OfficialLevel,
  type PlatformType,
  type UserPublic,
  type UserRole,
  type WorkspaceMode,
} from '../src/types.ts';

interface DbUserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  jabatan: string;
  role: UserRole;
  official_level: OfficialLevel | null;
  is_active: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
}

interface AuthContext {
  user: UserPublic;
  workspace: WorkspaceMode;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const ALLOWED_PLATFORMS: PlatformType[] = ['Instagram', 'Facebook', 'YouTube'];
const ALLOWED_ROLES: UserRole[] = ['admin_humas', 'kreator', 'pimpinan'];
const ALLOWED_MIME_TO_MEDIA: Record<string, 'image' | 'video'> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
};
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm', '.mov']);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_DEMO_ASSET_SET = new Set<string>(Object.values(DEMO_ASSET_FILES));

function toUserPublic(row: DbUserRow): UserPublic {
  const level = row.official_level;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    jabatan: row.jabatan,
    role: row.role,
    officialLevel: level,
    officialLevelLabel: level ? OFFICIAL_LEVEL_LABELS[level] : null,
    isActive: row.is_active === 1,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi tidak valid atau belum masuk.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesi telah berakhir. Silakan masuk kembali.' });
    return;
  }

  const db = getDb(payload.workspace);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as
    | DbUserRow
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Akun pengguna tidak ditemukan.' });
    return;
  }
  if (row.is_active !== 1) {
    res.status(403).json({ error: 'Akun Anda telah dinonaktifkan oleh Admin Humas.' });
    return;
  }

  req.auth = {
    user: toUserPublic(row),
    workspace: payload.workspace,
  };
  next();
}

function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }
    if (!roles.includes(req.auth.user.role)) {
      res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk tindakan ini.' });
      return;
    }
    next();
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'file');
  return base.replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'file';
}

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const workspace = req.auth?.workspace ?? 'prod';
    cb(null, getUploadsDir(workspace));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const uploadMiddleware = multer({
  storage: uploadStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TO_MEDIA[file.mimetype] || !ALLOWED_EXTENSIONS.has(ext)) {
      cb(
        new Error(
          'Format file tidak didukung. Gunakan JPG, PNG, WEBP untuk gambar atau MP4, WEBM, MOV untuk video.'
        )
      );
      return;
    }
    cb(null, true);
  },
});

function handleUploadSingle(req: Request, res: Response, next: NextFunction): void {
  uploadMiddleware.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Ukuran file melebihi batas maksimal 50 MB.' });
        return;
      }
      const message = err instanceof Error ? err.message : 'Gagal mengunggah file.';
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

function removeUploadedFileSafely(workspace: WorkspaceMode, filename?: string): void {
  if (!filename) return;
  const baseDir = path.resolve(getUploadsDir(workspace));
  const resolved = path.resolve(baseDir, filename);
  if (resolved.startsWith(baseDir + path.sep) && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
}

function resolveStoredFilePath(workspace: WorkspaceMode, storageKey: string): string | null {
  if (storageKey.startsWith('asset:')) {
    const assetName = storageKey.slice('asset:'.length);
    if (!ALLOWED_DEMO_ASSET_SET.has(assetName)) return null;
    const assetsDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
    const resolved = path.resolve(assetsDir, assetName);
    if (!resolved.startsWith(assetsDir + path.sep)) return null;
    return resolved;
  }

  const baseDir = path.resolve(getUploadsDir(workspace));
  const resolved = path.resolve(baseDir, storageKey);
  if (!resolved.startsWith(baseDir + path.sep)) return null;
  return resolved;
}

function buildContentSummaryRow(row: {
  id: string;
  title: string;
  platforms: string;
  publish_date: string;
  publish_time: string;
  status: ContentSummary['status'];
  creator_id: string;
  creator_name: string;
  creator_jabatan: string;
  current_version: number;
  current_step_order: number | null;
  current_approver_id: string | null;
  current_approver_name: string | null;
  current_approver_jabatan: string | null;
  current_approver_level: OfficialLevel | null;
  revision_note: string | null;
  rejection_reason: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
}): ContentSummary {
  return {
    id: row.id,
    title: row.title,
    platforms: JSON.parse(row.platforms) as PlatformType[],
    publishDate: row.publish_date,
    publishTime: row.publish_time,
    status: row.status,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    creatorJabatan: row.creator_jabatan,
    currentVersion: row.current_version,
    currentStepOrder: row.current_step_order,
    currentApproverId: row.current_approver_id,
    currentApproverName: row.current_approver_name,
    currentApproverJabatan: row.current_approver_jabatan,
    currentApproverLevelLabel: row.current_approver_level
      ? OFFICIAL_LEVEL_LABELS[row.current_approver_level]
      : null,
    revisionNote: row.revision_note,
    rejectionReason: row.rejection_reason,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getContentDetail(
  workspace: WorkspaceMode,
  contentId: string,
  viewer: UserPublic
): ContentDetail | null {
  const db = getDb(workspace);
  const contentRow = db
    .prepare(
      `
      SELECT
        c.*,
        u.name AS creator_name,
        u.jabatan AS creator_jabatan,
        a.name AS current_approver_name,
        a.jabatan AS current_approver_jabatan,
        a.official_level AS current_approver_level
      FROM contents c
      JOIN users u ON u.id = c.creator_id
      LEFT JOIN users a ON a.id = c.current_approver_id
      WHERE c.id = ?
      `
    )
    .get(contentId) as Parameters<typeof buildContentSummaryRow>[0] | undefined;

  if (!contentRow) return null;

  const summary = buildContentSummaryRow(contentRow);

  const versionRows = db
    .prepare(
      `
      SELECT
        cv.*,
        u.name AS created_by_name,
        f.original_name,
        f.mime_type,
        f.size_bytes,
        f.media_type,
        f.created_at AS file_created_at
      FROM content_versions cv
      JOIN users u ON u.id = cv.created_by
      JOIN files f ON f.id = cv.file_id
      WHERE cv.content_id = ?
      ORDER BY cv.version_number DESC
      `
    )
    .all(contentId) as Array<{
    id: string;
    content_id: string;
    version_number: number;
    title: string;
    caption: string;
    file_id: string;
    created_by: string;
    created_by_name: string;
    revision_note_reference: string | null;
    created_at: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    media_type: 'image' | 'video';
    file_created_at: string;
  }>;

  const versions: ContentVersion[] = versionRows.map((v) => {
    const previewToken = createMediaPreviewToken(v.file_id, viewer.id, workspace);
    return {
      id: v.id,
      contentId: v.content_id,
      versionNumber: v.version_number,
      title: v.title,
      caption: v.caption,
      file: {
        id: v.file_id,
        originalName: v.original_name,
        mimeType: v.mime_type,
        sizeBytes: v.size_bytes,
        mediaType: v.media_type,
        previewUrl: `/api/files/${encodeURIComponent(v.file_id)}/preview?token=${encodeURIComponent(previewToken)}`,
        downloadUrl:
          viewer.role === 'pimpinan' ? null : `/api/files/${encodeURIComponent(v.file_id)}/download`,
        createdAt: v.file_created_at,
      },
      createdById: v.created_by,
      createdByName: v.created_by_name,
      revisionNoteReference: v.revision_note_reference,
      createdAt: v.created_at,
    };
  });

  const stepRows = db
    .prepare(
      `
      SELECT
        s.*,
        u.name AS approver_name,
        u.jabatan AS approver_jabatan,
        d.name AS decided_by_name
      FROM approval_steps s
      JOIN users u ON u.id = s.approver_id
      LEFT JOIN users d ON d.id = s.decided_by_id
      WHERE s.content_id = ?
      ORDER BY s.step_order ASC
      `
    )
    .all(contentId) as Array<{
    id: string;
    content_id: string;
    step_order: number;
    official_level: OfficialLevel;
    approver_id: string;
    approver_name: string;
    approver_jabatan: string;
    status: ApprovalStep['status'];
    decision_note: string | null;
    decided_at: string | null;
    decided_by_name: string | null;
  }>;

  const approvalSteps: ApprovalStep[] = stepRows.map((s) => ({
    id: s.id,
    contentId: s.content_id,
    stepOrder: s.step_order,
    officialLevel: s.official_level,
    officialLevelLabel: OFFICIAL_LEVEL_LABELS[s.official_level],
    approverId: s.approver_id,
    approverName: s.approver_name,
    approverJabatan: s.approver_jabatan,
    status: s.status,
    decisionNote: s.decision_note,
    decidedAt: s.decided_at,
    decidedByName: s.decided_by_name,
  }));

  const logRows = db
    .prepare(
      `
      SELECT * FROM activity_logs
      WHERE content_id = ?
      ORDER BY created_at DESC
      `
    )
    .all(contentId) as Array<{
    id: string;
    content_id: string;
    actor_id: string;
    actor_name: string;
    actor_role: UserRole;
    action_type: ActivityLogItem['actionType'];
    description: string;
    metadata_json: string | null;
    created_at: string;
  }>;

  const activityLogs: ActivityLogItem[] = logRows.map((l) => ({
    id: l.id,
    contentId: l.content_id,
    actorId: l.actor_id,
    actorName: l.actor_name,
    actorRole: l.actor_role,
    actionType: l.action_type,
    description: l.description,
    metadata: l.metadata_json ? (JSON.parse(l.metadata_json) as Record<string, unknown>) : null,
    createdAt: l.created_at,
  }));

  return {
    ...summary,
    latestVersion: versions[0],
    versions,
    approvalSteps,
    activityLogs,
  };
}

export function createApiRouter(): express.Router {
  const router = express.Router();
  ensureDemoSeeded();

  // --- AUTH & BOOTSTRAP ---

  router.get('/auth/bootstrap-status', (_req, res) => {
    const prodDb = getDb('prod');
    const count = (prodDb.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
    res.json({ needsBootstrap: count === 0 });
  });

  router.post('/auth/bootstrap-admin', (req, res) => {
    const { name, email, password, jabatan } = req.body ?? {};
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof jabatan !== 'string'
    ) {
      res.status(400).json({ error: 'Semua kolom wajib diisi.' });
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanJabatan = jabatan.trim();

    if (cleanName.length < 2 || cleanName.length > 100) {
      res.status(400).json({ error: 'Nama harus antara 2–100 karakter.' });
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password minimal 8 karakter.' });
      return;
    }
    if (cleanJabatan.length < 2 || cleanJabatan.length > 120) {
      res.status(400).json({ error: 'Jabatan harus antara 2–120 karakter.' });
      return;
    }

    const prodDb = getDb('prod');
    const now = new Date().toISOString();
    const userId = `usr-${crypto.randomUUID()}`;

    const result = prodDb.transaction(() => {
      const count = (prodDb.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number })
        .cnt;
      if (count > 0) {
        return { locked: true as const };
      }
      prodDb
        .prepare(
          `INSERT INTO users (id, name, email, password_hash, jabatan, role, official_level, is_active, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'admin_humas', NULL, 1, 0, ?, ?)`
        )
        .run(userId, cleanName, cleanEmail, hashPassword(password), cleanJabatan, now, now);
      const created = prodDb.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow;
      return { locked: false as const, user: toUserPublic(created) };
    })();

    if (result.locked) {
      res.status(403).json({
        error: 'Admin Humas pertama sudah terdaftar. Hubungi Admin Humas untuk pembuatan akun.',
      });
      return;
    }

    const token = createSessionToken(result.user.id, 'prod');
    res.status(201).json({ token, workspace: 'prod', user: result.user });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email dan password wajib diisi.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail) || !password) {
      res.status(400).json({ error: 'Email atau password tidak valid.' });
      return;
    }

    const prodDb = getDb('prod');
    const row = prodDb.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as
      | DbUserRow
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Email atau password salah.' });
      return;
    }

    if (row.is_active !== 1) {
      res.status(403).json({
        error: 'Akun Anda telah dinonaktifkan. Silakan hubungi Admin Humas.',
      });
      return;
    }

    const token = createSessionToken(row.id, 'prod');
    res.json({ token, workspace: 'prod', user: toUserPublic(row) });
  });

  router.get('/auth/demo-accounts', (_req, res) => {
    ensureDemoSeeded();
    const demoDb = getDb('demo');
    const rows = demoDb
      .prepare('SELECT * FROM users WHERE is_demo = 1 ORDER BY role ASC, official_level ASC, name ASC')
      .all() as DbUserRow[];
    res.json({ accounts: rows.map(toUserPublic) });
  });

  router.post('/auth/demo-login', (req, res) => {
    const { userId } = req.body ?? {};
    if (typeof userId !== 'string' || !userId.trim()) {
      res.status(400).json({ error: 'Pilih akun demo terlebih dahulu.' });
      return;
    }
    ensureDemoSeeded();
    const demoDb = getDb('demo');
    const row = demoDb
      .prepare('SELECT * FROM users WHERE id = ? AND is_demo = 1')
      .get(userId.trim()) as DbUserRow | undefined;

    if (!row) {
      res.status(404).json({ error: 'Akun demo tidak ditemukan.' });
      return;
    }
    if (row.is_active !== 1) {
      res.status(403).json({ error: 'Akun demo ini sedang dinonaktifkan.' });
      return;
    }

    const token = createSessionToken(row.id, 'demo');
    res.json({ token, workspace: 'demo', user: toUserPublic(row) });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.auth!.user, workspace: req.auth!.workspace });
  });

  router.post('/demo/reset', requireAuth, (req, res) => {
    if (req.auth!.workspace !== 'demo') {
      res.status(403).json({ error: 'Reset hanya tersedia di Mode Demo.' });
      return;
    }
    resetDemoDb();
    res.json({ ok: true });
  });

  // --- USERS MANAGEMENT ---

  router.get('/users', requireAuth, (req, res) => {
    const db = getDb(req.auth!.workspace);
    const isAdmin = req.auth!.user.role === 'admin_humas';
    const rows = (
      isAdmin
        ? db.prepare('SELECT * FROM users ORDER BY is_active DESC, role ASC, official_level ASC, name ASC').all()
        : db
            .prepare(
              'SELECT * FROM users WHERE is_active = 1 ORDER BY role ASC, official_level ASC, name ASC'
            )
            .all()
    ) as DbUserRow[];
    res.json({ users: rows.map(toUserPublic) });
  });

  router.post('/users', requireAuth, requireRole('admin_humas'), (req, res) => {
    const { name, email, password, jabatan, role, officialLevel } = req.body ?? {};
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof jabatan !== 'string' ||
      typeof role !== 'string'
    ) {
      res.status(400).json({ error: 'Semua kolom pengguna wajib diisi.' });
      return;
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanJabatan = jabatan.trim();

    if (cleanName.length < 2 || cleanName.length > 100) {
      res.status(400).json({ error: 'Nama harus antara 2–100 karakter.' });
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password minimal 8 karakter.' });
      return;
    }
    if (cleanJabatan.length < 2 || cleanJabatan.length > 120) {
      res.status(400).json({ error: 'Jabatan harus antara 2–120 karakter.' });
      return;
    }
    if (!ALLOWED_ROLES.includes(role as UserRole)) {
      res.status(400).json({ error: 'Peran pengguna tidak valid.' });
      return;
    }

    let parsedLevel: OfficialLevel | null = null;
    if (role === 'pimpinan') {
      if (officialLevel !== 1 && officialLevel !== 2 && officialLevel !== 3) {
        res.status(400).json({
          error: 'Pejabat Pimpinan wajib memiliki jenjang jabatan (1: Kepala Seksi, 2: Kepala Bagian, atau 3: Pimpinan Terakhir).',
        });
        return;
      }
      parsedLevel = officialLevel;
    }

    const db = getDb(req.auth!.workspace);
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'Email tersebut sudah terdaftar.' });
      return;
    }

    const now = new Date().toISOString();
    const isDemo = req.auth!.workspace === 'demo' ? 1 : 0;
    const displayName =
      isDemo && !cleanName.startsWith('[DEMO]') ? `[DEMO] ${cleanName}` : cleanName;
    const id = `usr-${crypto.randomUUID()}`;

    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, jabatan, role, official_level, is_active, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
      id,
      displayName,
      cleanEmail,
      hashPassword(password),
      cleanJabatan,
      role,
      parsedLevel,
      isDemo,
      now,
      now
    );

    const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUserRow;
    res.status(201).json({ user: toUserPublic(created) });
  });

  router.patch('/users/:id', requireAuth, requireRole('admin_humas'), (req, res) => {
    const targetId = req.params.id;
    const db = getDb(req.auth!.workspace);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as
      | DbUserRow
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    const { name, jabatan, role, officialLevel, isActive, newPassword } = req.body ?? {};
    const nextName = typeof name === 'string' ? name.trim() : existing.name;
    const nextJabatan = typeof jabatan === 'string' ? jabatan.trim() : existing.jabatan;
    const nextRole = (typeof role === 'string' ? role : existing.role) as UserRole;
    const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active;

    if (nextName.length < 2 || nextName.length > 100) {
      res.status(400).json({ error: 'Nama harus antara 2–100 karakter.' });
      return;
    }
    if (nextJabatan.length < 2 || nextJabatan.length > 120) {
      res.status(400).json({ error: 'Jabatan harus antara 2–120 karakter.' });
      return;
    }
    if (!ALLOWED_ROLES.includes(nextRole)) {
      res.status(400).json({ error: 'Peran pengguna tidak valid.' });
      return;
    }
    if (targetId === req.auth!.user.id && nextActive === 0) {
      res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
      return;
    }
    if (targetId === req.auth!.user.id && nextRole !== 'admin_humas') {
      res.status(400).json({ error: 'Anda tidak dapat menurunkan peran Admin Humas milik sendiri.' });
      return;
    }

    let nextLevel: OfficialLevel | null = null;
    if (nextRole === 'pimpinan') {
      const candidateLevel =
        officialLevel !== undefined ? officialLevel : existing.official_level;
      if (candidateLevel !== 1 && candidateLevel !== 2 && candidateLevel !== 3) {
        res.status(400).json({ error: 'Jenjang jabatan Pimpinan wajib dipilih.' });
        return;
      }
      nextLevel = candidateLevel;
    }

    let nextHash = existing.password_hash;
    if (typeof newPassword === 'string' && newPassword.length > 0) {
      if (newPassword.length < 8 || newPassword.length > 128) {
        res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
        return;
      }
      nextHash = hashPassword(newPassword);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users
       SET name = ?, jabatan = ?, role = ?, official_level = ?, is_active = ?, password_hash = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextName, nextJabatan, nextRole, nextLevel, nextActive, nextHash, now, targetId);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as DbUserRow;
    res.json({ user: toUserPublic(updated) });
  });

  // --- CONTENTS & APPROVAL WORKFLOW ---

  router.get('/contents', requireAuth, (req, res) => {
    const db = getDb(req.auth!.workspace);
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
    const platformFilter = typeof req.query.platform === 'string' ? req.query.platform : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';

    const rows = db
      .prepare(
        `
        SELECT
          c.*,
          u.name AS creator_name,
          u.jabatan AS creator_jabatan,
          a.name AS current_approver_name,
          a.jabatan AS current_approver_jabatan,
          a.official_level AS current_approver_level
        FROM contents c
        JOIN users u ON u.id = c.creator_id
        LEFT JOIN users a ON a.id = c.current_approver_id
        ORDER BY c.updated_at DESC
        `
      )
      .all() as Array<Parameters<typeof buildContentSummaryRow>[0]>;

    let items = rows.map(buildContentSummaryRow);

    if (scope === 'my_approvals') {
      items = items.filter(
        (c) =>
          c.status === 'Menunggu Approval' && c.currentApproverId === req.auth!.user.id
      );
    } else if (scope === 'my_history' && req.auth!.user.role === 'pimpinan') {
      const participatedIds = new Set(
        (
          db
            .prepare(
              `SELECT DISTINCT content_id FROM approval_steps WHERE approver_id = ? OR decided_by_id = ?`
            )
            .all(req.auth!.user.id, req.auth!.user.id) as Array<{ content_id: string }>
        ).map((r) => r.content_id)
      );
      items = items.filter((c) => participatedIds.has(c.id));
    }

    if (statusFilter) {
      items = items.filter((c) => c.status === statusFilter);
    }
    if (platformFilter) {
      items = items.filter((c) => c.platforms.includes(platformFilter as PlatformType));
    }
    if (search) {
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(search) ||
          c.creatorName.toLowerCase().includes(search) ||
          (c.currentApproverName?.toLowerCase().includes(search) ?? false)
      );
    }

    res.json({ contents: items });
  });

  router.get('/contents/:id', requireAuth, (req, res) => {
    const detail = getContentDetail(req.auth!.workspace, req.params.id, req.auth!.user);
    if (!detail) {
      res.status(404).json({ error: 'Konten tidak ditemukan.' });
      return;
    }
    res.json({ content: detail });
  });

  router.post(
    '/contents',
    requireAuth,
    requireRole('kreator'),
    handleUploadSingle,
    (req, res) => {
      const workspace = req.auth!.workspace;
      const uploadedFile = req.file;
      const cleanup = () => removeUploadedFileSafely(workspace, uploadedFile?.filename);

      if (!uploadedFile) {
        res.status(400).json({ error: 'File desain gambar atau video wajib diunggah.' });
        return;
      }

      const { title, caption, platformsJson, publishDate, publishTime, approverIdsJson } =
        req.body ?? {};

      if (
        typeof title !== 'string' ||
        typeof caption !== 'string' ||
        typeof platformsJson !== 'string' ||
        typeof publishDate !== 'string' ||
        typeof publishTime !== 'string' ||
        typeof approverIdsJson !== 'string'
      ) {
        cleanup();
        res.status(400).json({ error: 'Semua kolom formulir konten wajib dilengkapi.' });
        return;
      }

      const cleanTitle = title.trim();
      const cleanCaption = caption.trim();

      if (cleanTitle.length < 3 || cleanTitle.length > 200) {
        cleanup();
        res.status(400).json({ error: 'Judul konten harus antara 3–200 karakter.' });
        return;
      }
      if (cleanCaption.length < 3 || cleanCaption.length > 5000) {
        cleanup();
        res.status(400).json({ error: 'Caption wajib diisi (maksimal 5.000 karakter).' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate) || !/^\d{2}:\d{2}$/.test(publishTime)) {
        cleanup();
        res.status(400).json({ error: 'Tanggal dan waktu publikasi tidak valid.' });
        return;
      }

      let platforms: PlatformType[];
      let approverIds: string[];
      try {
        platforms = JSON.parse(platformsJson) as PlatformType[];
        approverIds = JSON.parse(approverIdsJson) as string[];
      } catch {
        cleanup();
        res.status(400).json({ error: 'Format platform atau daftar pejabat tidak valid.' });
        return;
      }

      if (
        !Array.isArray(platforms) ||
        platforms.length === 0 ||
        platforms.some((p) => !ALLOWED_PLATFORMS.includes(p))
      ) {
        cleanup();
        res.status(400).json({ error: 'Pilih minimal satu platform (Instagram, Facebook, YouTube).' });
        return;
      }
      const uniquePlatforms = Array.from(new Set(platforms));

      if (!Array.isArray(approverIds) || approverIds.length === 0 || approverIds.length > 3) {
        cleanup();
        res.status(400).json({ error: 'Pilih minimal 1 dan maksimal 3 pejabat approval.' });
        return;
      }

      const db = getDb(workspace);
      const uniqueApproverIds = Array.from(new Set(approverIds));
      const placeholders = uniqueApproverIds.map(() => '?').join(',');
      const approverRows = db
        .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
        .all(...uniqueApproverIds) as DbUserRow[];

      if (approverRows.length !== uniqueApproverIds.length) {
        cleanup();
        res.status(400).json({ error: 'Salah satu pejabat approval tidak ditemukan.' });
        return;
      }

      for (const a of approverRows) {
        if (a.is_active !== 1 || a.role !== 'pimpinan' || !a.official_level) {
          cleanup();
          res.status(400).json({
            error: `Pejabat ${a.name} tidak aktif atau tidak memiliki peran Pimpinan yang valid.`,
          });
          return;
        }
      }

      // Check distinct levels and enforce lowest-to-highest ordering (1 -> 2 -> 3)
      const levelSet = new Set(approverRows.map((a) => a.official_level));
      if (levelSet.size !== approverRows.length) {
        cleanup();
        res.status(400).json({
          error: 'Pilih maksimal satu pejabat untuk setiap jenjang jabatan (Kepala Seksi, Kepala Bagian, Pimpinan Terakhir).',
        });
        return;
      }

      const sortedApprovers = [...approverRows].sort(
        (a, b) => (a.official_level ?? 99) - (b.official_level ?? 99)
      );

      const mediaType = ALLOWED_MIME_TO_MEDIA[uploadedFile.mimetype];
      if (!mediaType) {
        cleanup();
        res.status(400).json({ error: 'Tipe media file tidak valid.' });
        return;
      }

      const now = new Date().toISOString();
      const isDemo = workspace === 'demo' ? 1 : 0;
      const finalTitle =
        isDemo && !cleanTitle.startsWith('[DEMO]') ? `[DEMO] ${cleanTitle}` : cleanTitle;
      const contentId = `cnt-${crypto.randomUUID()}`;
      const fileId = `fil-${crypto.randomUUID()}`;
      const versionId = `ver-${crypto.randomUUID()}`;
      const firstApprover = sortedApprovers[0];

      db.transaction(() => {
        db.prepare(
          `INSERT INTO files (id, storage_key, original_name, mime_type, size_bytes, media_type, uploaded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          fileId,
          uploadedFile.filename,
          sanitizeFilename(uploadedFile.originalname),
          uploadedFile.mimetype,
          uploadedFile.size,
          mediaType,
          req.auth!.user.id,
          now
        );

        db.prepare(
          `INSERT INTO contents (
            id, title, platforms, publish_date, publish_time, status, creator_id,
            current_version, current_step_order, current_approver_id,
            revision_note, rejection_reason, is_demo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'Menunggu Approval', ?, 1, 1, ?, NULL, NULL, ?, ?, ?)`
        ).run(
          contentId,
          finalTitle,
          JSON.stringify(uniquePlatforms),
          publishDate,
          publishTime,
          req.auth!.user.id,
          firstApprover.id,
          isDemo,
          now,
          now
        );

        db.prepare(
          `INSERT INTO content_versions (
            id, content_id, version_number, title, caption, file_id, created_by, revision_note_reference, created_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL, ?)`
        ).run(versionId, contentId, finalTitle, cleanCaption, fileId, req.auth!.user.id, now);

        sortedApprovers.forEach((approver, idx) => {
          const stepOrder = idx + 1;
          const stepStatus = stepOrder === 1 ? 'Menunggu' : 'Menunggu Antrean';
          db.prepare(
            `INSERT INTO approval_steps (
              id, content_id, step_order, official_level, approver_id, status, decision_note, decided_at, decided_by_id
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
          ).run(
            `stp-${crypto.randomUUID()}`,
            contentId,
            stepOrder,
            approver.official_level,
            approver.id,
            stepStatus
          );
        });

        const chainLabel = sortedApprovers
          .map((a) => `${OFFICIAL_LEVEL_LABELS[a.official_level!]} (${a.name})`)
          .join(' -> ');

        db.prepare(
          `INSERT INTO activity_logs (
            id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, 'CREATE_CONTENT', ?, ?, ?)`
        ).run(
          `log-${crypto.randomUUID()}`,
          contentId,
          req.auth!.user.id,
          req.auth!.user.name,
          req.auth!.user.role,
          `Membuat konten baru versi 1 dan mengajukan approval berjenjang: ${chainLabel}.`,
          JSON.stringify({ version: 1, platforms: uniquePlatforms }),
          now
        );

        db.prepare(
          `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
           VALUES (?, ?, ?, 'NEW_APPROVAL', ?, ?, 0, ?)`
        ).run(
          `ntf-${crypto.randomUUID()}`,
          firstApprover.id,
          contentId,
          'Konten Baru Menunggu Approval',
          `${req.auth!.user.name} mengajukan konten "${finalTitle}" untuk persetujuan Anda (${OFFICIAL_LEVEL_LABELS[firstApprover.official_level!]}).`,
          now
        );
      })();

      const detail = getContentDetail(workspace, contentId, req.auth!.user);
      res.status(201).json({ content: detail });
    }
  );

  router.post(
    '/contents/:id/resubmit',
    requireAuth,
    requireRole('kreator'),
    handleUploadSingle,
    (req, res) => {
      const workspace = req.auth!.workspace;
      const contentId = req.params.id;
      const uploadedFile = req.file;
      const cleanup = () => removeUploadedFileSafely(workspace, uploadedFile?.filename);

      const db = getDb(workspace);
      const contentRow = db.prepare('SELECT * FROM contents WHERE id = ?').get(contentId) as
        | {
            id: string;
            title: string;
            status: string;
            current_version: number;
            current_step_order: number | null;
            current_approver_id: string | null;
            revision_note: string | null;
            is_demo: number;
          }
        | undefined;

      if (!contentRow) {
        cleanup();
        res.status(404).json({ error: 'Konten tidak ditemukan.' });
        return;
      }

      if (contentRow.status !== 'Perlu Revisi' || !contentRow.current_step_order) {
        cleanup();
        res.status(400).json({ error: 'Konten hanya dapat diajukan ulang jika berstatus Perlu Revisi.' });
        return;
      }

      const { title, caption, platformsJson, publishDate, publishTime } = req.body ?? {};
      if (
        typeof title !== 'string' ||
        typeof caption !== 'string' ||
        typeof platformsJson !== 'string' ||
        typeof publishDate !== 'string' ||
        typeof publishTime !== 'string'
      ) {
        cleanup();
        res.status(400).json({ error: 'Semua kolom perbaikan wajib diisi.' });
        return;
      }

      const cleanTitle = title.trim();
      const cleanCaption = caption.trim();
      if (cleanTitle.length < 3 || cleanTitle.length > 200) {
        cleanup();
        res.status(400).json({ error: 'Judul konten harus antara 3–200 karakter.' });
        return;
      }
      if (cleanCaption.length < 3 || cleanCaption.length > 5000) {
        cleanup();
        res.status(400).json({ error: 'Caption wajib diisi.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate) || !/^\d{2}:\d{2}$/.test(publishTime)) {
        cleanup();
        res.status(400).json({ error: 'Tanggal dan waktu publikasi tidak valid.' });
        return;
      }

      let platforms: PlatformType[];
      try {
        platforms = JSON.parse(platformsJson) as PlatformType[];
      } catch {
        cleanup();
        res.status(400).json({ error: 'Format platform tidak valid.' });
        return;
      }
      if (
        !Array.isArray(platforms) ||
        platforms.length === 0 ||
        platforms.some((p) => !ALLOWED_PLATFORMS.includes(p))
      ) {
        cleanup();
        res.status(400).json({ error: 'Pilih minimal satu platform yang valid.' });
        return;
      }
      const uniquePlatforms = Array.from(new Set(platforms));

      const latestVersion = db
        .prepare(
          'SELECT * FROM content_versions WHERE content_id = ? ORDER BY version_number DESC LIMIT 1'
        )
        .get(contentId) as { file_id: string } | undefined;

      if (!latestVersion && !uploadedFile) {
        cleanup();
        res.status(400).json({ error: 'File desain wajib tersedia.' });
        return;
      }

      const targetStep = db
        .prepare('SELECT * FROM approval_steps WHERE content_id = ? AND step_order = ?')
        .get(contentId, contentRow.current_step_order) as
        | { id: string; approver_id: string; official_level: OfficialLevel }
        | undefined;

      if (!targetStep) {
        cleanup();
        res.status(400).json({ error: 'Tahapan approval peminta revisi tidak ditemukan.' });
        return;
      }

      const targetApprover = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(targetStep.approver_id) as DbUserRow | undefined;

      if (!targetApprover || targetApprover.is_active !== 1) {
        cleanup();
        res.status(400).json({
          error: 'Pejabat approval tujuan sedang nonaktif. Silakan ganti pejabat terlebih dahulu sebelum mengajukan ulang.',
        });
        return;
      }

      const now = new Date().toISOString();
      const nextVersionNumber = contentRow.current_version + 1;
      const finalTitle =
        contentRow.is_demo === 1 && !cleanTitle.startsWith('[DEMO]')
          ? `[DEMO] ${cleanTitle}`
          : cleanTitle;

      db.transaction(() => {
        let nextFileId = latestVersion!.file_id;
        if (uploadedFile) {
          nextFileId = `fil-${crypto.randomUUID()}`;
          const mediaType = ALLOWED_MIME_TO_MEDIA[uploadedFile.mimetype];
          db.prepare(
            `INSERT INTO files (id, storage_key, original_name, mime_type, size_bytes, media_type, uploaded_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            nextFileId,
            uploadedFile.filename,
            sanitizeFilename(uploadedFile.originalname),
            uploadedFile.mimetype,
            uploadedFile.size,
            mediaType,
            req.auth!.user.id,
            now
          );
        }

        // Append new immutable version — never overwrite previous versions
        db.prepare(
          `INSERT INTO content_versions (
            id, content_id, version_number, title, caption, file_id, created_by, revision_note_reference, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `ver-${crypto.randomUUID()}`,
          contentId,
          nextVersionNumber,
          finalTitle,
          cleanCaption,
          nextFileId,
          req.auth!.user.id,
          contentRow.revision_note,
          now
        );

        // Return ONLY to the step that requested revision; prior Disetujui steps stay intact
        db.prepare(
          `UPDATE approval_steps
           SET status = 'Menunggu', decision_note = NULL, decided_at = NULL, decided_by_id = NULL
           WHERE id = ?`
        ).run(targetStep.id);

        db.prepare(
          `UPDATE contents
           SET title = ?, platforms = ?, publish_date = ?, publish_time = ?,
               status = 'Menunggu Approval', current_version = ?,
               current_approver_id = ?, revision_note = NULL, updated_at = ?
           WHERE id = ?`
        ).run(
          finalTitle,
          JSON.stringify(uniquePlatforms),
          publishDate,
          publishTime,
          nextVersionNumber,
          targetStep.approver_id,
          now,
          contentId
        );

        db.prepare(
          `INSERT INTO activity_logs (
            id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, 'RESUBMIT', ?, ?, ?)`
        ).run(
          `log-${crypto.randomUUID()}`,
          contentId,
          req.auth!.user.id,
          req.auth!.user.name,
          req.auth!.user.role,
          `Mengajukan ulang perbaikan konten versi ${nextVersionNumber} langsung ke ${OFFICIAL_LEVEL_LABELS[targetStep.official_level]} (${targetApprover.name}) tanpa mengulang persetujuan sebelumnya.`,
          JSON.stringify({
            version: nextVersionNumber,
            targetStepOrder: contentRow.current_step_order,
            targetApproverId: targetApprover.id,
            revisionNoteReference: contentRow.revision_note,
          }),
          now
        );

        db.prepare(
          `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
           VALUES (?, ?, ?, 'RESUBMITTED', ?, ?, 0, ?)`
        ).run(
          `ntf-${crypto.randomUUID()}`,
          targetApprover.id,
          contentId,
          'Pengajuan Ulang Setelah Revisi',
          `${req.auth!.user.name} telah memperbaiki konten "${finalTitle}" (Versi ${nextVersionNumber}) dan mengirimkannya kembali kepada Anda.`,
          now
        );
      })();

      const detail = getContentDetail(workspace, contentId, req.auth!.user);
      res.json({ content: detail });
    }
  );

  router.post(
    '/contents/:id/decision',
    requireAuth,
    requireRole('pimpinan'),
    (req, res) => {
      const workspace = req.auth!.workspace;
      const contentId = req.params.id;
      const { decision, note } = req.body ?? {};

      if (decision !== 'approve' && decision !== 'revise' && decision !== 'reject') {
        res.status(400).json({ error: 'Keputusan approval tidak valid.' });
        return;
      }

      const cleanNote = typeof note === 'string' ? note.trim() : '';
      if ((decision === 'revise' || decision === 'reject') && cleanNote.length < 3) {
        res.status(400).json({
          error:
            decision === 'revise'
              ? 'Catatan revisi wajib diisi (minimal 3 karakter).'
              : 'Alasan penolakan wajib diisi (minimal 3 karakter).',
        });
        return;
      }

      const db = getDb(workspace);
      const contentRow = db.prepare('SELECT * FROM contents WHERE id = ?').get(contentId) as
        | {
            id: string;
            title: string;
            status: string;
            creator_id: string;
            current_step_order: number | null;
            current_approver_id: string | null;
          }
        | undefined;

      if (!contentRow) {
        res.status(404).json({ error: 'Konten tidak ditemukan.' });
        return;
      }

      if (contentRow.status !== 'Menunggu Approval' || !contentRow.current_step_order) {
        res.status(400).json({ error: 'Konten ini tidak sedang menunggu keputusan approval.' });
        return;
      }

      if (contentRow.current_approver_id !== req.auth!.user.id) {
        res.status(403).json({
          error: 'Anda tidak berwenang mengubah atau memberikan keputusan approval untuk pejabat lain.',
        });
        return;
      }

      const activeStep = db
        .prepare('SELECT * FROM approval_steps WHERE content_id = ? AND step_order = ?')
        .get(contentId, contentRow.current_step_order) as
        | {
            id: string;
            step_order: number;
            official_level: OfficialLevel;
            approver_id: string;
            status: string;
          }
        | undefined;

      if (!activeStep || activeStep.status !== 'Menunggu' || activeStep.approver_id !== req.auth!.user.id) {
        res.status(403).json({ error: 'Tahapan approval ini tidak aktif untuk akun Anda.' });
        return;
      }

      const now = new Date().toISOString();
      const levelLabel = OFFICIAL_LEVEL_LABELS[activeStep.official_level];

      db.transaction(() => {
        if (decision === 'approve') {
          db.prepare(
            `UPDATE approval_steps
             SET status = 'Disetujui', decision_note = ?, decided_at = ?, decided_by_id = ?
             WHERE id = ?`
          ).run(cleanNote || null, now, req.auth!.user.id, activeStep.id);

          const nextStep = db
            .prepare(
              `SELECT s.*, u.name AS approver_name, u.official_level
               FROM approval_steps s
               JOIN users u ON u.id = s.approver_id
               WHERE s.content_id = ? AND s.step_order = ?`
            )
            .get(contentId, activeStep.step_order + 1) as
            | {
                id: string;
                step_order: number;
                approver_id: string;
                approver_name: string;
                official_level: OfficialLevel;
              }
            | undefined;

          if (nextStep) {
            db.prepare(`UPDATE approval_steps SET status = 'Menunggu' WHERE id = ?`).run(
              nextStep.id
            );
            db.prepare(
              `UPDATE contents
               SET status = 'Menunggu Approval', current_step_order = ?, current_approver_id = ?, updated_at = ?
               WHERE id = ?`
            ).run(nextStep.step_order, nextStep.approver_id, now, contentId);

            db.prepare(
              `INSERT INTO activity_logs (
                id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
              ) VALUES (?, ?, ?, ?, ?, 'APPROVE', ?, ?, ?)`
            ).run(
              `log-${crypto.randomUUID()}`,
              contentId,
              req.auth!.user.id,
              req.auth!.user.name,
              req.auth!.user.role,
              `Menyetujui konten pada jenjang ${levelLabel} dan meneruskan ke ${OFFICIAL_LEVEL_LABELS[nextStep.official_level]} (${nextStep.approver_name}).`,
              JSON.stringify({
                stepOrder: activeStep.step_order,
                officialLevel: activeStep.official_level,
                note: cleanNote || null,
                nextApproverId: nextStep.approver_id,
              }),
              now
            );

            // Notify creator & next approver
            db.prepare(
              `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
               VALUES (?, ?, ?, 'APPROVED', ?, ?, 0, ?)`
            ).run(
              `ntf-${crypto.randomUUID()}`,
              contentRow.creator_id,
              contentId,
              'Persetujuan Tahap Selesai',
              `${req.auth!.user.name} (${levelLabel}) menyetujui "${contentRow.title}". Diteruskan ke ${OFFICIAL_LEVEL_LABELS[nextStep.official_level]}.`,
              now
            );
            db.prepare(
              `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
               VALUES (?, ?, ?, 'NEW_APPROVAL', ?, ?, 0, ?)`
            ).run(
              `ntf-${crypto.randomUUID()}`,
              nextStep.approver_id,
              contentId,
              'Konten Menunggu Approval Anda',
              `"${contentRow.title}" telah disetujui ${levelLabel} dan kini menunggu keputusan Anda.`,
              now
            );
          } else {
            // Final approver approved -> Siap Publikasi
            db.prepare(
              `UPDATE contents
               SET status = 'Siap Publikasi', current_step_order = NULL, current_approver_id = NULL, updated_at = ?
               WHERE id = ?`
            ).run(now, contentId);

            db.prepare(
              `INSERT INTO activity_logs (
                id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
              ) VALUES (?, ?, ?, ?, ?, 'APPROVE', ?, ?, ?)`
            ).run(
              `log-${crypto.randomUUID()}`,
              contentId,
              req.auth!.user.id,
              req.auth!.user.name,
              req.auth!.user.role,
              `Menyetujui konten pada jenjang ${levelLabel} (pejabat terakhir). Status konten berubah menjadi Siap Publikasi.`,
              JSON.stringify({
                stepOrder: activeStep.step_order,
                officialLevel: activeStep.official_level,
                note: cleanNote || null,
                finalStatus: 'Siap Publikasi',
              }),
              now
            );

            db.prepare(
              `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
               VALUES (?, ?, ?, 'APPROVED', ?, ?, 0, ?)`
            ).run(
              `ntf-${crypto.randomUUID()}`,
              contentRow.creator_id,
              contentId,
              'Konten Siap Publikasi',
              `${req.auth!.user.name} (${levelLabel}) memberikan persetujuan akhir untuk "${contentRow.title}". Konten siap dipublikasikan secara manual.`,
              now
            );

            // Also notify active Admin Humas
            const admins = db
              .prepare(`SELECT id FROM users WHERE role = 'admin_humas' AND is_active = 1`)
              .all() as Array<{ id: string }>;
            for (const adm of admins) {
              db.prepare(
                `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
                 VALUES (?, ?, ?, 'APPROVED', ?, ?, 0, ?)`
              ).run(
                `ntf-${crypto.randomUUID()}`,
                adm.id,
                contentId,
                'Konten Siap Publikasi Manual',
                `"${contentRow.title}" telah mendapat persetujuan akhir dan siap dipublikasikan oleh Tim Humas.`,
                now
              );
            }
          }
        } else if (decision === 'revise') {
          db.prepare(
            `UPDATE approval_steps
             SET status = 'Revisi', decision_note = ?, decided_at = ?, decided_by_id = ?
             WHERE id = ?`
          ).run(cleanNote, now, req.auth!.user.id, activeStep.id);

          db.prepare(
            `UPDATE contents
             SET status = 'Perlu Revisi', revision_note = ?, updated_at = ?
             WHERE id = ?`
          ).run(cleanNote, now, contentId);

          db.prepare(
            `INSERT INTO activity_logs (
              id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, 'REQUEST_REVISION', ?, ?, ?)`
          ).run(
            `log-${crypto.randomUUID()}`,
            contentId,
            req.auth!.user.id,
            req.auth!.user.name,
            req.auth!.user.role,
            `Meminta revisi pada jenjang ${levelLabel}.`,
            JSON.stringify({
              stepOrder: activeStep.step_order,
              officialLevel: activeStep.official_level,
              note: cleanNote,
            }),
            now
          );

          db.prepare(
            `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
             VALUES (?, ?, ?, 'REVISION_REQUESTED', ?, ?, 0, ?)`
          ).run(
            `ntf-${crypto.randomUUID()}`,
            contentRow.creator_id,
            contentId,
            'Permintaan Revisi Konten',
            `${req.auth!.user.name} (${levelLabel}) meminta revisi pada "${contentRow.title}": ${cleanNote}`,
            now
          );
        } else if (decision === 'reject') {
          db.prepare(
            `UPDATE approval_steps
             SET status = 'Ditolak', decision_note = ?, decided_at = ?, decided_by_id = ?
             WHERE id = ?`
          ).run(cleanNote, now, req.auth!.user.id, activeStep.id);

          db.prepare(
            `UPDATE contents
             SET status = 'Ditolak', rejection_reason = ?, current_step_order = NULL, current_approver_id = NULL, updated_at = ?
             WHERE id = ?`
          ).run(cleanNote, now, contentId);

          db.prepare(
            `INSERT INTO activity_logs (
              id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, 'REJECT', ?, ?, ?)`
          ).run(
            `log-${crypto.randomUUID()}`,
            contentId,
            req.auth!.user.id,
            req.auth!.user.name,
            req.auth!.user.role,
            `Menolak konten pada jenjang ${levelLabel}. Alur approval dihentikan.`,
            JSON.stringify({
              stepOrder: activeStep.step_order,
              officialLevel: activeStep.official_level,
              reason: cleanNote,
            }),
            now
          );

          db.prepare(
            `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
             VALUES (?, ?, ?, 'REJECTED', ?, ?, 0, ?)`
          ).run(
            `ntf-${crypto.randomUUID()}`,
            contentRow.creator_id,
            contentId,
            'Konten Ditolak',
            `${req.auth!.user.name} (${levelLabel}) menolak "${contentRow.title}": ${cleanNote}`,
            now
          );
        }
      })();

      const detail = getContentDetail(workspace, contentId, req.auth!.user);
      res.json({ content: detail });
    }
  );

  router.post(
    '/contents/:id/replace-approver',
    requireAuth,
    requireRole('kreator'),
    (req, res) => {
      const workspace = req.auth!.workspace;
      const contentId = req.params.id;
      const { stepId, newApproverId, reason } = req.body ?? {};

      if (typeof stepId !== 'string' || typeof newApproverId !== 'string') {
        res.status(400).json({ error: 'Tahap approval dan pejabat pengganti wajib dipilih.' });
        return;
      }

      const db = getDb(workspace);
      const contentRow = db.prepare('SELECT * FROM contents WHERE id = ?').get(contentId) as
        | {
            id: string;
            title: string;
            status: string;
            current_step_order: number | null;
          }
        | undefined;

      if (!contentRow) {
        res.status(404).json({ error: 'Konten tidak ditemukan.' });
        return;
      }

      if (contentRow.status === 'Siap Publikasi' || contentRow.status === 'Ditolak') {
        res.status(400).json({
          error: 'Penggantian pejabat tidak dapat dilakukan pada konten yang sudah selesai atau ditolak.',
        });
        return;
      }

      const stepRow = db
        .prepare('SELECT * FROM approval_steps WHERE id = ? AND content_id = ?')
        .get(stepId, contentId) as
        | {
            id: string;
            step_order: number;
            official_level: OfficialLevel;
            approver_id: string;
            status: string;
          }
        | undefined;

      if (!stepRow) {
        res.status(404).json({ error: 'Tahap approval tidak ditemukan.' });
        return;
      }

      if (stepRow.status === 'Disetujui' || stepRow.status === 'Ditolak') {
        res.status(400).json({
          error: 'Pejabat yang sudah memberikan keputusan persetujuan atau penolakan tidak dapat diganti.',
        });
        return;
      }

      if (stepRow.approver_id === newApproverId) {
        res.status(400).json({ error: 'Pejabat pengganti tidak boleh sama dengan pejabat saat ini.' });
        return;
      }

      const oldApprover = db.prepare('SELECT * FROM users WHERE id = ?').get(stepRow.approver_id) as
        | DbUserRow
        | undefined;
      const newApprover = db.prepare('SELECT * FROM users WHERE id = ?').get(newApproverId) as
        | DbUserRow
        | undefined;

      if (!newApprover || newApprover.is_active !== 1 || newApprover.role !== 'pimpinan') {
        res.status(400).json({
          error: 'Pejabat pengganti harus memiliki akun aktif dengan peran Pimpinan.',
        });
        return;
      }

      if (newApprover.official_level !== stepRow.official_level) {
        res.status(400).json({
          error: `Pejabat pengganti harus memiliki jenjang jabatan yang sesuai (${OFFICIAL_LEVEL_LABELS[stepRow.official_level]}).`,
        });
        return;
      }

      const now = new Date().toISOString();
      const cleanReason = typeof reason === 'string' ? reason.trim() : '';

      db.transaction(() => {
        db.prepare('UPDATE approval_steps SET approver_id = ? WHERE id = ?').run(
          newApprover.id,
          stepRow.id
        );

        if (contentRow.current_step_order === stepRow.step_order) {
          db.prepare(
            'UPDATE contents SET current_approver_id = ?, updated_at = ? WHERE id = ?'
          ).run(newApprover.id, now, contentId);
        } else {
          db.prepare('UPDATE contents SET updated_at = ? WHERE id = ?').run(now, contentId);
        }

        const oldName = oldApprover?.name ?? stepRow.approver_id;
        db.prepare(
          `INSERT INTO activity_logs (
            id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, 'REPLACE_APPROVER', ?, ?, ?)`
        ).run(
          `log-${crypto.randomUUID()}`,
          contentId,
          req.auth!.user.id,
          req.auth!.user.name,
          req.auth!.user.role,
          `Mengganti pejabat approval jenjang ${OFFICIAL_LEVEL_LABELS[stepRow.official_level]} dari ${oldName} menjadi ${newApprover.name}.`,
          JSON.stringify({
            stepOrder: stepRow.step_order,
            officialLevel: stepRow.official_level,
            oldApproverId: stepRow.approver_id,
            oldApproverName: oldName,
            newApproverId: newApprover.id,
            newApproverName: newApprover.name,
            changedById: req.auth!.user.id,
            changedByName: req.auth!.user.name,
            reason: cleanReason || null,
          }),
          now
        );

        db.prepare(
          `INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
           VALUES (?, ?, ?, 'APPROVER_REPLACED', ?, ?, 0, ?)`
        ).run(
          `ntf-${crypto.randomUUID()}`,
          newApprover.id,
          contentId,
          'Penunjukan Sebagai Pejabat Approval Pengganti',
          `${req.auth!.user.name} menunjuk Anda sebagai pejabat pengganti (${OFFICIAL_LEVEL_LABELS[stepRow.official_level]}) untuk konten "${contentRow.title}".`,
          now
        );
      })();

      const detail = getContentDetail(workspace, contentId, req.auth!.user);
      res.json({ content: detail });
    }
  );

  // --- PROTECTED FILE PREVIEW & DOWNLOAD ---

  router.get('/files/:id/preview', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const payload = verifyMediaPreviewToken(token);
    if (!payload || payload.fileId !== req.params.id) {
      res.status(401).json({ error: 'Token preview tidak valid atau sudah kedaluwarsa.' });
      return;
    }

    const db = getDb(payload.workspace);
    const userRow = db.prepare('SELECT is_active FROM users WHERE id = ?').get(payload.userId) as
      | { is_active: number }
      | undefined;
    if (!userRow || userRow.is_active !== 1) {
      res.status(403).json({ error: 'Akses ditolak.' });
      return;
    }

    const fileRow = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id) as
      | {
          id: string;
          storage_key: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
        }
      | undefined;

    if (!fileRow) {
      res.status(404).json({ error: 'File tidak ditemukan.' });
      return;
    }

    const resolvedPath = resolveStoredFilePath(payload.workspace, fileRow.storage_key);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Berkas fisik tidak ditemukan.' });
      return;
    }

    const stat = fs.statSync(resolvedPath);
    res.setHeader('Content-Type', fileRow.mime_type);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= stat.size) {
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(resolvedPath, { start, end }).pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(resolvedPath).pipe(res);
  });

  router.get('/files/:id/download', requireAuth, (req, res) => {
    if (req.auth!.user.role === 'pimpinan') {
      res.status(403).json({
        error: 'Pimpinan hanya diperbolehkan melihat preview tanpa mengunduh file.',
      });
      return;
    }

    const db = getDb(req.auth!.workspace);
    const fileRow = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id) as
      | {
          id: string;
          storage_key: string;
          original_name: string;
          mime_type: string;
        }
      | undefined;

    if (!fileRow) {
      res.status(404).json({ error: 'File tidak ditemukan.' });
      return;
    }

    const resolvedPath = resolveStoredFilePath(req.auth!.workspace, fileRow.storage_key);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'Berkas fisik tidak ditemukan.' });
      return;
    }

    const safeName = sanitizeFilename(fileRow.original_name);
    res.setHeader('Content-Type', fileRow.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(resolvedPath).pipe(res);
  });

  // --- NOTIFICATIONS ---

  router.get('/notifications', requireAuth, (req, res) => {
    const db = getDb(req.auth!.workspace);
    const rows = db
      .prepare(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(req.auth!.user.id) as Array<{
      id: string;
      user_id: string;
      content_id: string | null;
      type: NotificationItem['type'];
      title: string;
      message: string;
      is_read: number;
      created_at: string;
    }>;

    const notifications: NotificationItem[] = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      contentId: r.content_id,
      type: r.type,
      title: r.title,
      message: r.message,
      isRead: r.is_read === 1,
      createdAt: r.created_at,
    }));

    const unreadCount = notifications.filter((n) => !n.isRead).length;
    res.json({ notifications, unreadCount });
  });

  router.post('/notifications/:id/read', requireAuth, (req, res) => {
    const db = getDb(req.auth!.workspace);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(
      req.params.id,
      req.auth!.user.id
    );
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', requireAuth, (req, res) => {
    const db = getDb(req.auth!.workspace);
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.auth!.user.id);
    res.json({ ok: true });
  });

  return router;
}
