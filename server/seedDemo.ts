import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { hashPassword } from './auth.ts';
import { getDb, getUploadsDir } from './db.ts';

export const DEMO_ASSET_FILES = {
  layananPublik: 'demo_poster_layanan_publik_1795492775867.jpg',
  literasiDigital: 'demo_poster_literasi_digital_1795492776553.jpg',
  konferensiPers: 'demo_banner_konferensi_pers_1795492776059.jpg',
} as const;

export function ensureDemoSeeded(): void {
  const db = getDb('demo');
  const existingCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (existingCount > 0) {
    return;
  }
  seedDemoData();
}

export function resetDemoDb(): void {
  const db = getDb('demo');
  const uploadsDir = getUploadsDir('demo');

  db.exec(`
    DELETE FROM notifications;
    DELETE FROM activity_logs;
    DELETE FROM approval_steps;
    DELETE FROM content_versions;
    DELETE FROM contents;
    DELETE FROM files;
    DELETE FROM users;
  `);

  if (fs.existsSync(uploadsDir)) {
    for (const file of fs.readdirSync(uploadsDir)) {
      const target = path.resolve(uploadsDir, file);
      if (target.startsWith(path.resolve(uploadsDir) + path.sep)) {
        fs.unlinkSync(target);
      }
    }
  }

  seedDemoData();
}

function seedDemoData(): void {
  const db = getDb('demo');
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const placeholderHash = () => hashPassword(crypto.randomBytes(16).toString('hex'));

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, jabatan, role, official_level, is_active, is_demo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `);

  const demoUsers = [
    [
      'demo-admin',
      '[DEMO] Sari Rahmawati',
      'admin.demo@humas.internal',
      placeholderHash(),
      'Koordinator Tata Usaha Humas',
      'admin_humas',
      null,
      hoursAgo(120),
      hoursAgo(120),
    ],
    [
      'demo-kreator',
      '[DEMO] Dimas Pratama',
      'kreator.demo@humas.internal',
      placeholderHash(),
      'Pranata Humas Ahli Pertama',
      'kreator',
      null,
      hoursAgo(120),
      hoursAgo(120),
    ],
    [
      'demo-kasi-1',
      '[DEMO] Rina Kusuma',
      'kasi.publikasi@humas.internal',
      placeholderHash(),
      'Kepala Seksi Publikasi Media',
      'pimpinan',
      1,
      hoursAgo(120),
      hoursAgo(120),
    ],
    [
      'demo-kasi-2',
      '[DEMO] Teguh Santoso',
      'kasi.informasi@humas.internal',
      placeholderHash(),
      'Kepala Seksi Layanan Informasi',
      'pimpinan',
      1,
      hoursAgo(120),
      hoursAgo(120),
    ],
    [
      'demo-kabag',
      '[DEMO] Hendra Wijaya',
      'kabag.komunikasi@humas.internal',
      placeholderHash(),
      'Kepala Bagian Komunikasi Publik',
      'pimpinan',
      2,
      hoursAgo(120),
      hoursAgo(120),
    ],
    [
      'demo-pimpinan',
      '[DEMO] Dr. Ratna Dewi',
      'kepala.biro@humas.internal',
      placeholderHash(),
      'Kepala Biro Hubungan Masyarakat',
      'pimpinan',
      3,
      hoursAgo(120),
      hoursAgo(120),
    ],
  ] as const;

  const insertFile = db.prepare(`
    INSERT INTO files (id, storage_key, original_name, mime_type, size_bytes, media_type, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertContent = db.prepare(`
    INSERT INTO contents (
      id, title, platforms, publish_date, publish_time, status, creator_id,
      current_version, current_step_order, current_approver_id,
      revision_note, rejection_reason, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const insertVersion = db.prepare(`
    INSERT INTO content_versions (
      id, content_id, version_number, title, caption, file_id, created_by, revision_note_reference, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertStep = db.prepare(`
    INSERT INTO approval_steps (
      id, content_id, step_order, official_level, approver_id, status, decision_note, decided_at, decided_by_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLog = db.prepare(`
    INSERT INTO activity_logs (
      id, content_id, actor_id, actor_name, actor_role, action_type, description, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, content_id, type, title, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const u of demoUsers) {
      insertUser.run(...u);
    }

    // Demo files backed by generated assets
    insertFile.run(
      'demo-file-1',
      `asset:${DEMO_ASSET_FILES.layananPublik}`,
      'poster_portal_layanan_publik_v1.jpg',
      'image/jpeg',
      482310,
      'image',
      'demo-kreator',
      hoursAgo(24)
    );
    insertFile.run(
      'demo-file-2',
      `asset:${DEMO_ASSET_FILES.literasiDigital}`,
      'infografis_literasi_digital_v1.jpg',
      'image/jpeg',
      419200,
      'image',
      'demo-kreator',
      hoursAgo(18)
    );
    insertFile.run(
      'demo-file-3',
      `asset:${DEMO_ASSET_FILES.konferensiPers}`,
      'banner_konferensi_pers_v1.jpg',
      'image/jpeg',
      512400,
      'image',
      'demo-kreator',
      hoursAgo(72)
    );
    insertFile.run(
      'demo-file-4',
      `asset:${DEMO_ASSET_FILES.konferensiPers}`,
      'banner_konferensi_pers_v2_revisi.jpg',
      'image/jpeg',
      534800,
      'image',
      'demo-kreator',
      hoursAgo(48)
    );

    // 1. Menunggu Approval (Step 1 approved by Kasi, currently waiting for Kabag)
    insertContent.run(
      'demo-content-1',
      '[DEMO] Sosialisasi Portal Layanan Publik Digital 24/7',
      JSON.stringify(['Instagram', 'Facebook']),
      '2026-11-28',
      '09:00',
      'Menunggu Approval',
      'demo-kreator',
      1,
      2,
      'demo-kabag',
      null,
      null,
      hoursAgo(24),
      hoursAgo(12)
    );
    insertVersion.run(
      'demo-ver-1-1',
      'demo-content-1',
      1,
      '[DEMO] Sosialisasi Portal Layanan Publik Digital 24/7',
      'Kini pengurusan administrasi publik lebih cepat dan transparan melalui Portal Layanan Publik Digital.\n\nAkses layanan 24/7 dari mana saja dengan verifikasi NIK yang aman.\n\n#LayananPublikDigital #TransformasiDigital #HumasPemerintah',
      'demo-file-1',
      'demo-kreator',
      null,
      hoursAgo(24)
    );
    insertStep.run(
      'demo-step-1-1',
      'demo-content-1',
      1,
      1,
      'demo-kasi-1',
      'Disetujui',
      'Materi grafis dan informasi tautan portal sudah sesuai pedoman.',
      hoursAgo(12),
      'demo-kasi-1'
    );
    insertStep.run('demo-step-1-2', 'demo-content-1', 2, 2, 'demo-kabag', 'Menunggu', null, null, null);
    insertStep.run('demo-step-1-3', 'demo-content-1', 3, 3, 'demo-pimpinan', 'Menunggu Antrean', null, null, null);

    insertLog.run(
      'demo-log-1-1',
      'demo-content-1',
      'demo-kreator',
      '[DEMO] Dimas Pratama',
      'kreator',
      'CREATE_CONTENT',
      'Membuat konten baru versi 1 dan mengajukan approval berjenjang (Kepala Seksi -> Kepala Bagian -> Pimpinan Terakhir).',
      JSON.stringify({ version: 1 }),
      hoursAgo(24)
    );
    insertLog.run(
      'demo-log-1-2',
      'demo-content-1',
      'demo-kasi-1',
      '[DEMO] Rina Kusuma',
      'pimpinan',
      'APPROVE',
      'Menyetujui konten pada jenjang Kepala Seksi dan meneruskan ke Kepala Bagian.',
      JSON.stringify({ stepOrder: 1, note: 'Materi grafis dan informasi tautan portal sudah sesuai pedoman.' }),
      hoursAgo(12)
    );

    // 2. Perlu Revisi (Requested by Kasi)
    insertContent.run(
      'demo-content-2',
      '[DEMO] Kampanye Literasi Media & Cek Fakta Resmi',
      JSON.stringify(['Instagram']),
      '2026-11-30',
      '14:00',
      'Perlu Revisi',
      'demo-kreator',
      1,
      1,
      'demo-kasi-1',
      'Mohon sesuaikan bahasa pengantar pada caption agar menggunakan Bahasa Indonesia baku dan tambahkan nomor kanal pengaduan resmi.',
      null,
      hoursAgo(18),
      hoursAgo(6)
    );
    insertVersion.run(
      'demo-ver-2-1',
      'demo-content-2',
      1,
      '[DEMO] Kampanye Literasi Media & Cek Fakta Resmi',
      'Mari saring sebelum sharing! Pastikan setiap informasi yang diterima berasal dari sumber resmi pemerintah dan media terverifikasi.\n\n#LiterasiDigital #CekFakta #AntiHoaks',
      'demo-file-2',
      'demo-kreator',
      null,
      hoursAgo(18)
    );
    insertStep.run(
      'demo-step-2-1',
      'demo-content-2',
      1,
      1,
      'demo-kasi-1',
      'Revisi',
      'Mohon sesuaikan bahasa pengantar pada caption agar menggunakan Bahasa Indonesia baku dan tambahkan nomor kanal pengaduan resmi.',
      hoursAgo(6),
      'demo-kasi-1'
    );
    insertStep.run('demo-step-2-2', 'demo-content-2', 2, 2, 'demo-kabag', 'Menunggu Antrean', null, null, null);

    insertLog.run(
      'demo-log-2-1',
      'demo-content-2',
      'demo-kreator',
      '[DEMO] Dimas Pratama',
      'kreator',
      'CREATE_CONTENT',
      'Membuat konten baru versi 1 dan mengajukan approval (Kepala Seksi -> Kepala Bagian).',
      JSON.stringify({ version: 1 }),
      hoursAgo(18)
    );
    insertLog.run(
      'demo-log-2-2',
      'demo-content-2',
      'demo-kasi-1',
      '[DEMO] Rina Kusuma',
      'pimpinan',
      'REQUEST_REVISION',
      'Meminta revisi pada jenjang Kepala Seksi.',
      JSON.stringify({
        stepOrder: 1,
        note: 'Mohon sesuaikan bahasa pengantar pada caption agar menggunakan Bahasa Indonesia baku dan tambahkan nomor kanal pengaduan resmi.',
      }),
      hoursAgo(6)
    );

    // 3. Siap Publikasi (Full 2-version cycle + all steps approved)
    insertContent.run(
      'demo-content-3',
      '[DEMO] Ringkasan Konferensi Pers Layanan Terpadu',
      JSON.stringify(['YouTube', 'Facebook']),
      '2026-11-25',
      '10:30',
      'Siap Publikasi',
      'demo-kreator',
      2,
      null,
      null,
      null,
      null,
      hoursAgo(72),
      hoursAgo(20)
    );
    insertVersion.run(
      'demo-ver-3-1',
      'demo-content-3',
      1,
      '[DEMO] Ringkasan Konferensi Pers Layanan Terpadu',
      'Simak rangkuman konferensi pers terkait perluasan layanan terpadu satu pintu tahun anggaran berjalan.',
      'demo-file-3',
      'demo-kreator',
      null,
      hoursAgo(72)
    );
    insertVersion.run(
      'demo-ver-3-2',
      'demo-content-3',
      2,
      '[DEMO] Ringkasan Konferensi Pers Layanan Terpadu',
      'Simak rangkuman lengkap Konferensi Pers Perluasan Layanan Terpadu Satu Pintu.\n\nSeluruh materi paparan resmi dapat diakses melalui situs informasi publik instansi.',
      'demo-file-4',
      'demo-kreator',
      'Tambahkan keterangan tautan akses materi paparan resmi pada paragraf kedua caption.',
      hoursAgo(48)
    );
    insertStep.run(
      'demo-step-3-1',
      'demo-content-3',
      1,
      1,
      'demo-kasi-1',
      'Disetujui',
      'Disetujui setelah perbaikan caption versi 2.',
      hoursAgo(40),
      'demo-kasi-1'
    );
    insertStep.run(
      'demo-step-3-2',
      'demo-content-3',
      2,
      2,
      'demo-kabag',
      'Disetujui',
      'Substansi dan dokumentasi foto sudah akurat.',
      hoursAgo(30),
      'demo-kabag'
    );
    insertStep.run(
      'demo-step-3-3',
      'demo-content-3',
      3,
      3,
      'demo-pimpinan',
      'Disetujui',
      'Disetujui untuk publikasi manual sesuai jadwal.',
      hoursAgo(20),
      'demo-pimpinan'
    );

    insertLog.run(
      'demo-log-3-1',
      'demo-content-3',
      'demo-kreator',
      '[DEMO] Dimas Pratama',
      'kreator',
      'CREATE_CONTENT',
      'Membuat konten baru versi 1.',
      JSON.stringify({ version: 1 }),
      hoursAgo(72)
    );
    insertLog.run(
      'demo-log-3-2',
      'demo-content-3',
      'demo-kasi-1',
      '[DEMO] Rina Kusuma',
      'pimpinan',
      'REQUEST_REVISION',
      'Meminta revisi pada jenjang Kepala Seksi.',
      JSON.stringify({ note: 'Tambahkan keterangan tautan akses materi paparan resmi pada paragraf kedua caption.' }),
      hoursAgo(60)
    );
    insertLog.run(
      'demo-log-3-3',
      'demo-content-3',
      'demo-kreator',
      '[DEMO] Dimas Pratama',
      'kreator',
      'RESUBMIT',
      'Mengunggah perbaikan konten versi 2 dan mengajukan ulang ke Kepala Seksi.',
      JSON.stringify({ version: 2 }),
      hoursAgo(48)
    );
    insertLog.run(
      'demo-log-3-4',
      'demo-content-3',
      'demo-kasi-1',
      '[DEMO] Rina Kusuma',
      'pimpinan',
      'APPROVE',
      'Menyetujui konten pada jenjang Kepala Seksi.',
      JSON.stringify({ stepOrder: 1 }),
      hoursAgo(40)
    );
    insertLog.run(
      'demo-log-3-5',
      'demo-content-3',
      'demo-kabag',
      '[DEMO] Hendra Wijaya',
      'pimpinan',
      'APPROVE',
      'Menyetujui konten pada jenjang Kepala Bagian.',
      JSON.stringify({ stepOrder: 2 }),
      hoursAgo(30)
    );
    insertLog.run(
      'demo-log-3-6',
      'demo-content-3',
      'demo-pimpinan',
      '[DEMO] Dr. Ratna Dewi',
      'pimpinan',
      'APPROVE',
      'Menyetujui konten pada jenjang Pimpinan Terakhir. Status berubah menjadi Siap Publikasi.',
      JSON.stringify({ stepOrder: 3 }),
      hoursAgo(20)
    );

    // 4. Ditolak
    insertContent.run(
      'demo-content-4',
      '[DEMO] Pengumuman Pemeliharaan Server Akhir Pekan',
      JSON.stringify(['Instagram']),
      '2026-11-26',
      '18:00',
      'Ditolak',
      'demo-kreator',
      1,
      null,
      null,
      null,
      'Jadwal pemeliharaan infrastruktur ditunda ke bulan depan sesuai surat edaran teknis terbaru.',
      hoursAgo(36),
      hoursAgo(28)
    );
    insertVersion.run(
      'demo-ver-4-1',
      'demo-content-4',
      1,
      '[DEMO] Pengumuman Pemeliharaan Server Akhir Pekan',
      'Pemberitahuan pemeliharaan sistem layanan elektronik pada akhir pekan ini pukul 22.00–02.00 WIB.',
      'demo-file-1',
      'demo-kreator',
      null,
      hoursAgo(36)
    );
    insertStep.run(
      'demo-step-4-1',
      'demo-content-4',
      1,
      1,
      'demo-kasi-1',
      'Disetujui',
      'Format pengumuman baik.',
      hoursAgo(32),
      'demo-kasi-1'
    );
    insertStep.run(
      'demo-step-4-2',
      'demo-content-4',
      2,
      2,
      'demo-kabag',
      'Ditolak',
      'Jadwal pemeliharaan infrastruktur ditunda ke bulan depan sesuai surat edaran teknis terbaru.',
      hoursAgo(28),
      'demo-kabag'
    );
    insertLog.run(
      'demo-log-4-1',
      'demo-content-4',
      'demo-kreator',
      '[DEMO] Dimas Pratama',
      'kreator',
      'CREATE_CONTENT',
      'Membuat konten baru versi 1.',
      JSON.stringify({ version: 1 }),
      hoursAgo(36)
    );
    insertLog.run(
      'demo-log-4-2',
      'demo-content-4',
      'demo-kasi-1',
      '[DEMO] Rina Kusuma',
      'pimpinan',
      'APPROVE',
      'Menyetujui konten pada jenjang Kepala Seksi.',
      JSON.stringify({ stepOrder: 1 }),
      hoursAgo(32)
    );
    insertLog.run(
      'demo-log-4-3',
      'demo-content-4',
      'demo-kabag',
      '[DEMO] Hendra Wijaya',
      'pimpinan',
      'REJECT',
      'Menolak konten pada jenjang Kepala Bagian.',
      JSON.stringify({
        reason: 'Jadwal pemeliharaan infrastruktur ditunda ke bulan depan sesuai surat edaran teknis terbaru.',
      }),
      hoursAgo(28)
    );

    // Notifications for DEMO users
    insertNotif.run(
      'demo-notif-1',
      'demo-kabag',
      'demo-content-1',
      'NEW_APPROVAL',
      'Konten Menunggu Approval Anda',
      '[DEMO] Sosialisasi Portal Layanan Publik Digital 24/7 telah disetujui Kepala Seksi dan menunggu keputusan Anda.',
      0,
      hoursAgo(12)
    );
    insertNotif.run(
      'demo-notif-2',
      'demo-kreator',
      'demo-content-2',
      'REVISION_REQUESTED',
      'Permintaan Revisi Konten',
      '[DEMO] Rina Kusuma meminta revisi pada konten "[DEMO] Kampanye Literasi Media & Cek Fakta Resmi".',
      0,
      hoursAgo(6)
    );
    insertNotif.run(
      'demo-notif-3',
      'demo-kreator',
      'demo-content-3',
      'APPROVED',
      'Konten Siap Publikasi',
      '[DEMO] Ringkasan Konferensi Pers Layanan Terpadu telah disetujui Pimpinan Terakhir dan berstatus Siap Publikasi.',
      1,
      hoursAgo(20)
    );
    insertNotif.run(
      'demo-notif-4',
      'demo-kreator',
      'demo-content-4',
      'REJECTED',
      'Konten Ditolak',
      '[DEMO] Pengumuman Pemeliharaan Server Akhir Pekan ditolak oleh Kepala Bagian.',
      0,
      hoursAgo(28)
    );
    insertNotif.run(
      'demo-notif-5',
      'demo-admin',
      'demo-content-3',
      'APPROVED',
      'Konten Siap Publikasi Manual',
      '[DEMO] Ringkasan Konferensi Pers Layanan Terpadu telah mendapat persetujuan akhir dan siap dipublikasikan.',
      0,
      hoursAgo(20)
    );
  });

  tx();
}
