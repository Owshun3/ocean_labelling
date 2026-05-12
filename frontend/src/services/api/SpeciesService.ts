import axios from 'axios';
import { Platform } from 'react-native';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const speciesClient = axios.create({ baseURL: `${APP_API_BASE}/species` });

speciesClient.interceptors.request.use((config) => {
	const token = Platform.OS === 'web'
		? (typeof window !== 'undefined' ? localStorage.getItem('cvat_token') : null)
		: null;
	if (token) config.headers.Authorization = `Token ${token}`;
	return config;
});

attachBanInterceptor(speciesClient);

export type SpeciesStatus = 'pending' | 'approved' | 'rejected';
export type SpeciesCategory = 'terrestrial_fauna' | 'marine_fauna' | 'flora' | 'other';
export type DescriptionSource = 'manual' | 'wikipedia' | 'annotator_proposal';

export interface Species {
	id: number;
	name: string;
	scientific_name: string | null;
	polynesian_name: string | null;
	category: SpeciesCategory | null;
	description: string | null;
	description_source: DescriptionSource | null;
	status: SpeciesStatus;
	usage_count: number;
}

export interface SpeciesEditPayload {
	scientific_name?: string | null;
	polynesian_name?: string | null;
	category?: SpeciesCategory | null;
	description?: string | null;
	description_source?: DescriptionSource | null;
}

export class SpeciesService {
	async search(prefix: string): Promise<Species[]> {
		const resp = await speciesClient.get<{ results: Species[] }>('/', { params: { q: prefix } });
		return resp.data.results;
	}

	async create(name: string): Promise<Species> {
		const resp = await speciesClient.post<Species>('/', { name });
		return resp.data;
	}

	async update(id: number, payload: SpeciesEditPayload): Promise<Species> {
		const resp = await speciesClient.patch<Species>(`/${id}`, payload);
		return resp.data;
	}

	async incrementUsage(id: number): Promise<void> {
		await speciesClient.post(`/${id}/increment-usage`);
	}
}
