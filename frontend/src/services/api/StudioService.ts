import axios from 'axios';
import { Platform } from 'react-native';
import { SpeciesService } from './SpeciesService';
import { attachBanInterceptor } from './banInterceptor';
import { StudioShape } from '@/features/studio/types';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

export const studioClient = axios.create({ baseURL: `${APP_API_BASE}/studio` });

studioClient.interceptors.request.use((config) => {
	const token = Platform.OS === 'web'
		? (typeof window !== 'undefined' ? localStorage.getItem('cvat_token') : null)
		: null;
	if (token) config.headers.Authorization = `Token ${token}`;
	return config;
});

attachBanInterceptor(studioClient);

interface CvatShape {
	id?: number;
	type: string;
	points: number[];
	frame: number;
	label_id: number;
	occluded: boolean;
	outside: boolean;
	z_order: number;
	rotation: number;
	group: number;
	source: string;
	attributes: any[];
}

interface CvatAnnotationState {
	version: number;
	tags: any[];
	shapes: CvatShape[];
	tracks: any[];
}

const POINT_EPSILON = 0.5;

function pointsClose(a: number[], b: number[]): boolean {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (Math.abs(a[i] - b[i]) > POINT_EPSILON) return false;
	}
	return true;
}

export type ModerationStatus = 'pending' | 'validated' | 'rejected';
export type AnnotationState  = 'not_annotated' | 'annotated' | 'curator_validated';

export interface FeedTask {
	cvat_task_id:      number;
	name:              string;
	created_date:      string;
	moderation_status: ModerationStatus;
	jobs_count:        number;
	completed_count:   number;
	my_job_id:         number | null;
	my_job_state:      string | null;
	free_job_count:    number;
	annotation_state:  AnnotationState;
}

export interface StudioFeed {
	own:       FeedTask[];
	community: FeedTask[];
}

export class StudioService {
	private species = new SpeciesService();

	async getFeed(): Promise<StudioFeed> {
		const resp = await studioClient.get<StudioFeed>('/feed');
		return resp.data;
	}

	async claim(taskId: number): Promise<{ jobId: number; alreadyClaimed: boolean }> {
		const resp = await studioClient.post<{ jobId: number; alreadyClaimed: boolean }>(
			'/claim', { task_id: taskId },
		);
		return resp.data;
	}

	async contestAnnotation(taskId: number, message: string): Promise<{ id: number; created_at: string }> {
		const resp = await studioClient.post<{ id: number; created_at: string }>(
			'/contest-annotation', { cvat_task_id: taskId, message },
		);
		return resp.data;
	}

	async validateAll(
		taskId: number,
		jobId: number,
		shapes: StudioShape[],
		frameNumber = 0,
	): Promise<StudioShape[]> {
		if (shapes.length === 0) return shapes;

		for (const s of shapes) {
			if (!s.speciesName) throw new Error(`Le rectangle #${shapes.indexOf(s) + 1} n'a pas d'espèce.`);
		}

		const speciesByLocalId: Record<string, number> = {};
		for (const s of shapes) {
			if (s.speciesId) {
				speciesByLocalId[s.id] = s.speciesId;
				continue;
			}
			const created = await this.species.create(s.speciesName!);
			speciesByLocalId[s.id] = created.id;
		}

		const uniqueNames = Array.from(new Set(shapes.map((s) => s.speciesName!)));
		const labelResp = await studioClient.post<{ mapping: Record<string, number> }>('/labels/sync', {
			task_id: taskId,
			names: uniqueNames,
		});
		const labelByName = labelResp.data.mapping;

		const existingResp = await studioClient.get<CvatAnnotationState>(`/jobs/${jobId}/annotations`);
		const existing = existingResp.data;

		const cvatShapes: CvatShape[] = shapes.map((s) => {
			const shape: CvatShape = {
				type: 'rectangle',
				points: [s.x, s.y, s.x + s.width, s.y + s.height],
				frame: frameNumber,
				label_id: labelByName[s.speciesName!],
				occluded: false,
				outside: false,
				z_order: 0,
				rotation: 0,
				group: 0,
				source: 'manual',
				attributes: [],
			};
			if (s.cvatClientId) (shape as any).id = s.cvatClientId;
			return shape;
		});

		const fullState: CvatAnnotationState = {
			version: existing.version ?? 0,
			tags:    existing.tags    ?? [],
			shapes:  cvatShapes,
			tracks:  existing.tracks  ?? [],
		};

		const putResp = await studioClient.put<CvatAnnotationState>(`/jobs/${jobId}/annotations`, fullState);
		const returnedShapes = putResp.data.shapes ?? [];

		const cvatIdByLocalId = new Map<string, number>();
		for (const local of shapes) {
			let match: CvatShape | undefined;
			if (local.cvatClientId) {
				match = returnedShapes.find((rs) => rs.id === local.cvatClientId);
			}
			if (!match) {
				const expected = [local.x, local.y, local.x + local.width, local.y + local.height];
				const expectedLabel = labelByName[local.speciesName!];
				match = returnedShapes.find(
					(rs) => rs.label_id === expectedLabel && pointsClose(rs.points, expected),
				);
			}
			if (match?.id) cvatIdByLocalId.set(local.id, match.id);
		}

		const newlyCreated = shapes.filter((s) => !s.cvatClientId);
		await Promise.all(newlyCreated.map(async (s) => {
			const cvatId = cvatIdByLocalId.get(s.id);
			if (s.comment && cvatId) {
				try {
					await studioClient.post('/comments', {
						cvat_job_id:   jobId,
						cvat_shape_id: cvatId,
						comment:       s.comment,
					});
				} catch (err) {
					console.warn('[studio] save comment failed', err);
				}
			}
			const sid = speciesByLocalId[s.id];
			if (sid) {
				try { await this.species.incrementUsage(sid); } catch {}
			}
		}));

		return shapes.map((s) => ({
			...s,
			status: 'saved',
			speciesId: speciesByLocalId[s.id] ?? s.speciesId,
			cvatClientId: cvatIdByLocalId.get(s.id) ?? s.cvatClientId,
		}));
	}
}
