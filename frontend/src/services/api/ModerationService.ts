import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

import { APP_API_BASE } from './runtimeUrls';

const moderationClient = axios.create({ baseURL: `${APP_API_BASE}/moderation`, withCredentials: true });

attachBanInterceptor(moderationClient);

export type MediaKind = 'image' | 'video';

export interface ModerationQueueEntry {
  uploader_id: number;
  username: string | null;
  role: string;
  pending_count: number;
  image_count?: number;
  video_count?: number;
  oldest: string;
}

export interface ModerationUploader {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  is_superuser?: boolean;
  is_staff?: boolean;
  date_joined: string | null;
  actions_validated_total: number;
}

export interface CvatTaskSummary {
  id: number;
  name: string;
  size: number;
  status: string;
  created_date: string;
  updated_date: string;
  [k: string]: any;
}

export interface ModerationVideoSummary {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  has_poster: boolean;
  uploaded_at: string;
}

export type ModerationMediaEntry =
  | { kind: 'image'; cvat_task_id: number; submitted_at: string; task: CvatTaskSummary }
  | { kind: 'video'; video_id: number; submitted_at: string; video: ModerationVideoSummary };

export interface ModerationMediaDetail {
  moderation: {
    cvat_task_id: number;
    uploader_id: number;
    status: 'pending' | 'validated' | 'rejected';
    reviewed_by: number | null;
    review_comment: string | null;
    created_at: string;
    reviewed_at: string | null;
  };
  task: CvatTaskSummary;
  uploader: ModerationUploader;
}

export interface ModerationVideoDetail {
  moderation: {
    video_id: number;
    uploader_id: number;
    status: 'pending' | 'validated' | 'rejected';
    reviewed_by: number | null;
    review_comment: string | null;
    created_at: string;
    reviewed_at: string | null;
  };
  video: ModerationVideoSummary;
  uploader: ModerationUploader;
}

export interface ModerationItem { kind: MediaKind; id: number; }

export interface BanPayload {
  duration_days?: number | null;
  reason?: string;
}

export interface BanResult {
  ok: boolean;
  expires_at: string | null;
  cvat_deactivated: boolean;
}

export class ModerationService {
  async getQueue(): Promise<ModerationQueueEntry[]> {
    const resp = await moderationClient.get<{ results: ModerationQueueEntry[] }>('/queue');
    return resp.data.results;
  }

  async getUserMedia(userId: number): Promise<{ user: ModerationUploader; results: ModerationMediaEntry[] }> {
    const resp = await moderationClient.get<{ user: ModerationUploader; results: ModerationMediaEntry[] }>(
      `/users/${userId}/media`
    );
    return resp.data;
  }

  async getMediaDetail(taskId: number): Promise<ModerationMediaDetail> {
    const resp = await moderationClient.get<ModerationMediaDetail>(`/media/${taskId}`);
    return resp.data;
  }

  async getVideoDetail(videoId: number): Promise<ModerationVideoDetail> {
    const resp = await moderationClient.get<ModerationVideoDetail>(`/video/${videoId}`);
    return resp.data;
  }

  async validateMedia(items: ModerationItem[]): Promise<{ updated: number }> {
    const resp = await moderationClient.post<{ updated: number }>('/media/validate', { items });
    return resp.data;
  }

  async rejectMedia(items: ModerationItem[], comment?: string): Promise<{ updated: number }> {
    const body: { items: ModerationItem[]; comment?: string } = { items };
    if (comment) body.comment = comment;
    const resp = await moderationClient.post<{ updated: number }>('/media/reject', body);
    return resp.data;
  }

  async banUser(userId: number, payload: BanPayload): Promise<BanResult> {
    const body: BanPayload = {};
    if (payload.duration_days !== undefined) body.duration_days = payload.duration_days;
    if (payload.reason !== undefined) body.reason = payload.reason;
    const resp = await moderationClient.post<BanResult>(`/users/${userId}/ban`, body);
    return resp.data;
  }
}
