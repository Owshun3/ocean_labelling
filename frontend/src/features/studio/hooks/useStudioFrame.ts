import { useEffect, useState } from 'react';
import { Image as RNImage } from 'react-native';
import type { AxiosInstance } from 'axios';
import { apiClient } from '@/services/api/axiosClient';

export interface StudioImage {
	uri: string;
	width: number;
	height: number;
}

interface State {
	image: StudioImage | null;
	loading: boolean;
	error: string | null;
}

interface FetchSpec {
	client: AxiosInstance;
	path: string;
	params?: Record<string, any>;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const slice = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
	}
	return globalThis.btoa(binary);
}

export function useStudioFrame(jobId: number, frameNumber: number, custom?: FetchSpec): State {
	const [image, setImage] = useState<StudioImage | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
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
			.get(path, { params, responseType: 'arraybuffer' })
			.then((resp) => {
				if (cancelled) return;
				const mime = (resp.headers?.['content-type'] as string | undefined) || 'image/jpeg';
				const b64 = arrayBufferToBase64(resp.data as ArrayBuffer);
				const uri = `data:${mime};base64,${b64}`;
				RNImage.getSize(
					uri,
					(width, height) => {
						if (cancelled) return;
						setImage({ uri, width, height });
						setLoading(false);
					},
					() => {
						if (cancelled) return;
						setError('Image illisible');
						setLoading(false);
					},
				);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err?.response?.data?.error ?? err.message);
				setLoading(false);
			});

		return () => { cancelled = true; };
	}, [jobId, frameNumber, custom?.client, custom?.path, JSON.stringify(custom?.params)]);

	return { image, loading, error };
}
