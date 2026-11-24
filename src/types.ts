export type WorkspaceMode = 'prod' | 'demo';

export type UserRole = 'admin_humas' | 'kreator' | 'pimpinan';

export type OfficialLevel = 1 | 2 | 3;

export type PlatformType = 'Instagram' | 'Facebook' | 'YouTube';

export type ContentStatus =
  | 'Menunggu Approval'
  | 'Perlu Revisi'
  | 'Ditolak'
  | 'Siap Publikasi';

export type ApprovalStepStatus =
  | 'Menunggu'
  | 'Menunggu Antrean'
  | 'Disetujui'
  | 'Revisi'
  | 'Ditolak';

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  jabatan: string;
  role: UserRole;
  officialLevel: OfficialLevel | null;
  officialLevelLabel: string | null;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileAsset {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: 'image' | 'video';
  previewUrl: string;
  downloadUrl: string | null;
  createdAt: string;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  versionNumber: number;
  title: string;
  caption: string;
  file: FileAsset;
  createdById: string;
  createdByName: string;
  revisionNoteReference: string | null;
  createdAt: string;
}

export interface ApprovalStep {
  id: string;
  contentId: string;
  stepOrder: number;
  officialLevel: OfficialLevel;
  officialLevelLabel: string;
  approverId: string;
  approverName: string;
  approverJabatan: string;
  status: ApprovalStepStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
}

export interface ActivityLogItem {
  id: string;
  contentId: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  actionType:
    | 'CREATE_CONTENT'
    | 'APPROVE'
    | 'REQUEST_REVISION'
    | 'REJECT'
    | 'RESUBMIT'
    | 'REPLACE_APPROVER';
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ContentSummary {
  id: string;
  title: string;
  platforms: PlatformType[];
  publishDate: string;
  publishTime: string;
  status: ContentStatus;
  creatorId: string;
  creatorName: string;
  creatorJabatan: string;
  currentVersion: number;
  currentStepOrder: number | null;
  currentApproverId: string | null;
  currentApproverName: string | null;
  currentApproverJabatan: string | null;
  currentApproverLevelLabel: string | null;
  revisionNote: string | null;
  rejectionReason: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentDetail extends ContentSummary {
  latestVersion: ContentVersion;
  versions: ContentVersion[];
  approvalSteps: ApprovalStep[];
  activityLogs: ActivityLogItem[];
}

export interface NotificationItem {
  id: string;
  userId: string;
  contentId: string | null;
  type:
    | 'NEW_APPROVAL'
    | 'APPROVED'
    | 'REVISION_REQUESTED'
    | 'REJECTED'
    | 'RESUBMITTED'
    | 'APPROVER_REPLACED';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const OFFICIAL_LEVEL_LABELS: Record<OfficialLevel, string> = {
  1: 'Kepala Seksi',
  2: 'Kepala Bagian',
  3: 'Pimpinan Terakhir',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin_humas: 'Admin Humas',
  kreator: 'Kreator / Editor',
  pimpinan: 'Pimpinan',
};
