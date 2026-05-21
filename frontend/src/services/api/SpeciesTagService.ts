import axios from 'axios';
import { attachBanInterceptor } from './banInterceptor';

import { APP_API_BASE } from './runtimeUrls';

const publicClient = axios.create({ baseURL: `${APP_API_BASE}/species-tags`,   withCredentials: true });
const adminClient  = axios.create({ baseURL: `${APP_API_BASE}/admin/species-tags`, withCredentials: true });
attachBanInterceptor(publicClient);
attachBanInterceptor(adminClient);

export interface SpeciesTagDefinition {
	id: number;
	group_id: number;
	value: string;
	label: string;
	sort_order: number;
	archived_at: string | null;
}

export interface SpeciesTagGroup {
	id: number;
	key: string;
	label: string;
	is_required: boolean;
	is_exclusive: boolean;
	sort_order: number;
	definitions: SpeciesTagDefinition[];
}

export class SpeciesTagService {
	async list(): Promise<SpeciesTagGroup[]> {
		const resp = await publicClient.get<{ groups: SpeciesTagGroup[] }>('/');
		return resp.data.groups;
	}

	async listAdmin(): Promise<SpeciesTagGroup[]> {
		const resp = await adminClient.get<{ groups: SpeciesTagGroup[] }>('/');
		return resp.data.groups;
	}

	async createGroup(input: { key: string; label: string; is_required?: boolean; is_exclusive?: boolean; sort_order?: number }): Promise<SpeciesTagGroup> {
		const resp = await adminClient.post<SpeciesTagGroup>('/groups', input);
		return resp.data;
	}
	async updateGroup(id: number, input: Partial<{ label: string; is_required: boolean; is_exclusive: boolean; sort_order: number }>): Promise<SpeciesTagGroup> {
		const resp = await adminClient.patch<SpeciesTagGroup>(`/groups/${id}`, input);
		return resp.data;
	}
	async deleteGroup(id: number): Promise<void> {
		await adminClient.delete(`/groups/${id}`);
	}

	async createDefinition(input: { group_id: number; value: string; label: string; sort_order?: number }): Promise<SpeciesTagDefinition> {
		const resp = await adminClient.post<SpeciesTagDefinition>('/definitions', input);
		return resp.data;
	}
	async updateDefinition(id: number, input: Partial<{ label: string; sort_order: number; archived: boolean }>): Promise<SpeciesTagDefinition> {
		const resp = await adminClient.patch<SpeciesTagDefinition>(`/definitions/${id}`, input);
		return resp.data;
	}
	async deleteDefinition(id: number): Promise<void> {
		await adminClient.delete(`/definitions/${id}`);
	}
}

// Miroir de app-api/src/lib/speciesTagValidation.js — bloque le submit avant l'aller-retour.
export interface SpeciesTagValidation { ok: boolean; error?: string; }

export function validateSpeciesTags(tags: string[], groups: SpeciesTagGroup[]): SpeciesTagValidation {
	const valueToGroup = new Map<string, SpeciesTagGroup>();
	for (const g of groups) for (const d of g.definitions) if (!d.archived_at) valueToGroup.set(d.value, g);

	const unknown = tags.filter((t) => !valueToGroup.has(t));
	if (unknown.length > 0) return { ok: false, error: `Tags inconnus : ${unknown.join(', ')}` };

	const countByGroup = new Map<number, number>();
	for (const t of tags) {
		const g = valueToGroup.get(t)!;
		countByGroup.set(g.id, (countByGroup.get(g.id) || 0) + 1);
	}
	for (const g of groups) {
		const n = countByGroup.get(g.id) || 0;
		if (g.is_required && n === 0)  return { ok: false, error: `« ${g.label} » est obligatoire.` };
		if (g.is_exclusive && n > 1)   return { ok: false, error: `« ${g.label} » est exclusif — une seule valeur.` };
	}
	return { ok: true };
}
