import { useEffect, useState } from 'react';
import { studioClient } from '@/services/api/StudioService';
import { StudioShape } from '../types';

interface State {
	shapes: StudioShape[];
	loaded: boolean;
}

export function useInitialShapes(jobId: number): State {
	const [state, setState] = useState<State>({ shapes: [], loaded: false });

	useEffect(() => {
		let cancelled = false;
		setState({ shapes: [], loaded: false });

		studioClient
			.get(`/jobs/${jobId}/annotations`)
			.then((resp) => {
				if (cancelled) return;
				const shapes: StudioShape[] = (resp.data?.shapes ?? [])
					.filter((s: any) => s.type === 'rectangle' && Array.isArray(s.points) && s.points.length >= 4)
					.map((s: any) => {
						const [x1, y1, x2, y2] = s.points;
						return {
							id: `cvat-${s.id}`,
							x: Math.min(x1, x2),
							y: Math.min(y1, y2),
							width:  Math.abs(x2 - x1),
							height: Math.abs(y2 - y1),
							status: 'saved' as const,
							cvatClientId: s.id,
							speciesName: s.label_name ?? '?',
						};
					});
				setState({ shapes, loaded: true });
			})
			.catch(() => {
				if (!cancelled) setState({ shapes: [], loaded: true });
			});

		return () => { cancelled = true; };
	}, [jobId]);

	return state;
}
