import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { apiClient } from '@/services/api/axiosClient';

interface State {
	image: HTMLImageElement | null;
	loading: boolean;
	error: string | null;
}

interface FetchSpec {
	client: AxiosInstance;
	path: string;
	params?: Record<string, any>;
}

export function useStudioFrame(jobId: number, frameNumber: number, custom?: FetchSpec): State {
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;
		setLoading(true);
		setError(null);
		setImage(null);

		// Sentinel: callers pass jobId <= 0 when the real id n'est pas encore résolu
		// (chargement async). On bail out — sinon /jobs/-1/data 404 polue la console.
		if (!Number.isFinite(jobId) || jobId <= 0) {
			setLoading(false);
			return () => { cancelled = true; };
		}

		const client = custom?.client ?? apiClient;
		const path   = custom?.path   ?? `/jobs/${jobId}/data`;
		const params = custom?.params ?? { type: 'frame', number: frameNumber, quality: 'compressed' };

		client
			.get(path, { params, responseType: 'blob' })
			.then((resp) => {
				if (cancelled) return;
				objectUrl = URL.createObjectURL(resp.data);
				const img = new Image();
				img.onload = () => {
					if (cancelled) return;
					setImage(img);
					setLoading(false);
				};
				img.onerror = () => {
					if (cancelled) return;
					setError('Image illisible');
					setLoading(false);
				};
				img.src = objectUrl;
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err?.response?.data?.error ?? err.message);
				setLoading(false);
			});

		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [jobId, frameNumber]);

	return { image, loading, error };
}
