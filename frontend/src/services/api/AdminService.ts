import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const adminClient = axios.create({ baseURL: `${APP_API_BASE}/admin`, withCredentials: true });
attachBanInterceptor(adminClient);

export interface DashboardSummary {
	contestations: { media: number; annotation: number; total: number };
	curation: { media_awaiting: number };
	accounts: { active_sessions: number; active_bans: number };
	species: { pending: number };
	settings: { upload_max_bytes: number | null };
}

export class AdminService {
	async getDashboardSummary(): Promise<DashboardSummary> {
		const resp = await adminClient.get<DashboardSummary>('/dashboard/summary');
		return resp.data;
	}
}
