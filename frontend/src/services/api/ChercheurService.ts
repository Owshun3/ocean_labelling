import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';
import type { ExportFilters, ExportPreview } from './AdminService';

import { APP_API_BASE } from './runtimeUrls';
const client = axios.create({ baseURL: `${APP_API_BASE}/chercheur`, withCredentials: true });
attachBanInterceptor(client);

export type ExportRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface ChercheurExportRequest {
	id: number;
	message: string;
	organization: string | null;
	scope: ExportFilters;
	status: ExportRequestStatus;
	reviewed_by: number | null;
	reviewed_at: string | null;
	review_comment: string | null;
	expires_at: string | null;
	created_at: string;
}

export interface ChercheurExportFacets { tags: string[]; }

export class ChercheurService {
	async getFacets(): Promise<ChercheurExportFacets> {
		const resp = await client.get<ChercheurExportFacets>('/export/facets');
		return resp.data;
	}

	async preview(filters: ExportFilters): Promise<ExportPreview> {
		const resp = await client.post<ExportPreview>('/export/preview', filters);
		return resp.data;
	}

	async listMyRequests(): Promise<ChercheurExportRequest[]> {
		const resp = await client.get<{ results: ChercheurExportRequest[] }>('/export-requests');
		return resp.data.results;
	}

	async submitRequest(input: { scope: ExportFilters; message: string; organization?: string }): Promise<ChercheurExportRequest> {
		const resp = await client.post<ChercheurExportRequest>('/export-requests', input);
		return resp.data;
	}

	async withdraw(id: number): Promise<void> {
		await client.delete(`/export-requests/${id}`);
	}

	async download(id: number): Promise<{ filename: string; data: ArrayBuffer }> {
		const resp = await client.post(`/export-requests/${id}/download`, {}, { responseType: 'arraybuffer' });
		const disposition = (resp.headers['content-disposition'] as string | undefined) || '';
		const match = /filename="([^"]+)"/.exec(disposition);
		return { filename: match?.[1] || `export-${id}.zip`, data: resp.data as ArrayBuffer };
	}
}
