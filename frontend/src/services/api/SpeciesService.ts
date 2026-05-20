import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

import { APP_API_BASE } from './runtimeUrls';

const speciesClient = axios.create({ baseURL: `${APP_API_BASE}/species`, withCredentials: true });

attachBanInterceptor(speciesClient);

export type SpeciesStatus = 'pending' | 'approved' | 'rejected';
export type SpeciesCategory = 'terrestrial_fauna' | 'marine_fauna' | 'flora' | 'other';
export type DescriptionSource = 'manual' | 'wikipedia' | 'annotator_proposal';

export interface SpeciesProposer {
	id: number;
	username: string | null;
	actions_validated_total: number;
}

export interface Species {
	id: number;
	name: string;
	scientific_name: string | null;
	usage_name?: string | null;
	polynesian_name: string | null;
	category: SpeciesCategory | null;
	tags?: string[];
	description: string | null;
	description_source: DescriptionSource | null;
	reference_image_url?: string | null;
	status: SpeciesStatus;
	usage_count: number;
	proposer?: SpeciesProposer | null;
	created_at?: string;
}

export interface WikipediaSummary {
	term: string;
	lang: string;
	title: string;
	extract: string;
	page_url: string | null;
	thumbnail: string | null;
}

export type SpeciesSearchField = 'scientific' | 'usage' | 'polynesian';

export interface SpeciesFullInput {
	scientific_name: string;
	usage_name: string;
	polynesian_name: string;
	tags?: string[];
	source_name?: string;
}

export interface SpeciesEditPayload {
	scientific_name?: string | null;
	usage_name?: string | null;
	polynesian_name?: string | null;
	category?: SpeciesCategory | null;
	description?: string | null;
	description_source?: DescriptionSource | null;
	reference_image_url?: string | null;
	tags?: string[];
}

export interface SpeciesEditRequestRow {
	id: number;
	species_id: number;
	proposed_by: number;
	proposed_at: string;
	proposed_payload: SpeciesEditPayload;
	status: 'pending' | 'approved' | 'rejected';
}

export class SpeciesService {
	async search(prefix: string, limit?: number): Promise<Species[]> {
		const params: Record<string, any> = { q: prefix };
		if (limit !== undefined) params.limit = limit;
		const resp = await speciesClient.get<{ results: Species[] }>('/', { params });
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

	async searchByField(field: SpeciesSearchField, q: string): Promise<Species[]> {
		const resp = await speciesClient.get<{ results: Species[] }>('/search', { params: { field, q } });
		return resp.data.results;
	}

	async createFull(payload: SpeciesFullInput): Promise<Species> {
		const resp = await speciesClient.post<Species>('/full', payload);
		return resp.data;
	}

	async getOne(id: number): Promise<Species> {
		const resp = await speciesClient.get<Species>(`/${id}`);
		return resp.data;
	}

	async fetchWikipedia(id: number, lang: 'fr' | 'en' = 'fr'): Promise<WikipediaSummary> {
		const resp = await speciesClient.get<WikipediaSummary>(`/${id}/wikipedia`, { params: { lang } });
		return resp.data;
	}

}
