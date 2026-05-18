import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

export const curatorClient = axios.create({ baseURL: `${APP_API_BASE}/curator`, withCredentials: true });

attachBanInterceptor(curatorClient);

export interface CuratorJob {
  id: number;
  state: 'new' | 'in progress' | 'completed' | 'rejected';
  stage: 'annotation' | 'validation' | 'acceptance';
  assignee: { id: number; username: string } | null;
  start_frame?: number;
  stop_frame?: number;
}

export interface CuratorTask {
  id: number;
  name: string;
  status: string;
  created_date: string;
  updated_date: string;
  jobs: CuratorJob[];
  jobs_count: number;
  completed_count: number;
  annotations_count?: number;
  annotated_jobs_count?: number;
  assigned_to?: { id: number; username: string | null } | null;
  is_assigned_to_me?: boolean;
}

export interface CuratorTasksResponse {
  results: CuratorTask[];
  count: number;
  admin_view: boolean;
}

export interface QualityConflict {
  id: number;
  frame: number;
  type: string;
  severity: 'error' | 'warning';
  annotation_ids: number[];
}

export interface QualityReport {
  id: number;
  created_date: string;
  summary: {
    conflict_count: number;
    valid_count: number;
    ds_count: number;
    gt_count: number;
  };
}

export interface MergeStatus {
  id: number;
  status: 'queued' | 'started' | 'finished' | 'failed';
  target_job?: { id: number };
  task_id?: number;
}

export interface ProposalSpecies {
  id: number;
  name: string;
  scientific_name: string | null;
  usage_name: string | null;
  polynesian_name: string | null;
  tags: string[];
  status: 'pending' | 'approved' | 'rejected';
}

export interface Proposal {
  cvat_shape_id: number;
  cvat_job_id: number;
  annotator_id: number;
  annotator_username: string;
  annotator_actions_total?: number;
  points: number[];
  x: number; y: number; width: number; height: number;
  label_id: number;
  label_name: string | null;
  species: ProposalSpecies | null;
}

export interface ProposalsPayload {
  task: {
    id: number; name: string; status: string;
    created_date: string; size: number;
  };
  moderation: {
    uploader_id: number;
    status: string;
    created_at: string;
    curator_validated_at: string | null;
  } | null;
  metadata: {
    cvat_task_id: number;
    gps_latitude: number | null;
    gps_longitude: number | null;
    taken_at: string | null;
    camera_make: string | null;
    camera_model: string | null;
    image_width: number | null;
    image_height: number | null;
    source_video_id: number | null;
    source_frame_time_ms: number | null;
    source_video_filename: string | null;
    source_video_deleted: boolean | null;
  } | null;
  jobs: Array<{ id: number; state: string; stage: string; assignee: { id: number; username: string } }>;
  proposals: Proposal[];
}

export interface CertifyPayload {
  cvat_job_id: number;
  mode: 'review' | 'create';
  chosen_bbox_annotator_id?: number | null;
  shape: { points: number[] };
  species: {
    scientific_name: string;
    usage_name: string;
    polynesian_name: string;
    tags?: string[];
    source_name?: string;
  };
  comment?: string;
  rejected_proposals?: Array<{ annotator_id: number; cvat_shape_id: number; label_name: string | null }>;
}

export interface CertifyResult {
  ok: boolean;
  certification_id: number;
  certified_at: string;
  species: ProposalSpecies;
  cvat_shape_id: number | null;
}

export class CuratorService {
  async getTasks(): Promise<CuratorTasksResponse> {
    const resp = await curatorClient.get<CuratorTasksResponse>('/tasks');
    return resp.data;
  }

  async getTaskJobs(taskId: number): Promise<CuratorJob[]> {
    const resp = await curatorClient.get<{ results: CuratorJob[] }>(`/tasks/${taskId}/jobs`);
    return resp.data.results;
  }

  async generateQualityReport(taskId: number): Promise<{ id: number }> {
    const resp = await curatorClient.post<{ id: number }>(`/tasks/${taskId}/quality`);
    return resp.data;
  }

  async getQuality(taskId: number): Promise<{ report: QualityReport | null; conflicts: QualityConflict[]; conflicts_count: number }> {
    const resp = await curatorClient.get(`/tasks/${taskId}/quality`);
    return resp.data;
  }

  async triggerMerge(taskId: number): Promise<MergeStatus> {
    const resp = await curatorClient.post<MergeStatus>(`/tasks/${taskId}/merge`);
    return resp.data;
  }

  async getMergeStatus(mergeId: number): Promise<MergeStatus> {
    const resp = await curatorClient.get<MergeStatus>(`/merges/${mergeId}`);
    return resp.data;
  }

  async pollMergeUntilDone(mergeId: number, onProgress?: (status: string) => void): Promise<MergeStatus> {
    for (let i = 0; i < 60; i++) {
      const status = await this.getMergeStatus(mergeId);
      onProgress?.(status.status);
      if (status.status === 'finished' || status.status === 'failed') return status;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Timeout: le merge dépasse 2 minutes');
  }

  async getProposals(taskId: number): Promise<ProposalsPayload> {
    const resp = await curatorClient.get<ProposalsPayload>(`/tasks/${taskId}/proposals`);
    return resp.data;
  }

  async certify(taskId: number, payload: CertifyPayload): Promise<CertifyResult> {
    const resp = await curatorClient.post<CertifyResult>(`/tasks/${taskId}/certify`, payload);
    return resp.data;
  }
}
