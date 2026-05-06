import axios from 'axios';
import { Platform } from 'react-native';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const curatorClient = axios.create({ baseURL: `${APP_API_BASE}/curator` });

curatorClient.interceptors.request.use((config) => {
  const token = Platform.OS === 'web'
    ? (typeof window !== 'undefined' ? localStorage.getItem('cvat_token') : null)
    : null;
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

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

export class CuratorService {
  async getTasks(): Promise<CuratorTask[]> {
    const resp = await curatorClient.get<{ results: CuratorTask[] }>('/tasks');
    return resp.data.results;
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
}
