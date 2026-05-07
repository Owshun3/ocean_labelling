import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api/axiosClient';

interface State {
	image: HTMLImageElement | null;
	loading: boolean;
	error: string | null;
}

export function useStudioFrame(jobId: number, frameNumber: number): State {
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let objectUrl: string | null = null;
		setLoading(true);
		setError(null);
		setImage(null);

		apiClient
			.get(`/jobs/${jobId}/data`, {
				params: { type: 'frame', number: frameNumber, quality: 'compressed' },
				responseType: 'blob',
			})
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
