import { useState, useEffect } from 'react';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { MediaEntity } from '@/core/types/media';

export interface MediaQueueState {
	readonly data: MediaEntity[] | null;
	readonly isLoading: boolean;
	readonly error: string | null;
}

export interface UseMediaQueueReturn {
	readonly state: MediaQueueState;
	readonly refreshMedia: () => void;
}

export const useMediaQueue = (): UseMediaQueueReturn => {
	const [state, setState] = useState<MediaQueueState>({
		data: null,
		isLoading: true,
		error: null,
	});

	const refreshMedia = () => {
		setState((prevState) => ({ ...prevState, isLoading: true, error: null }));
	};

	useEffect(() => {
		let isMounted = true;

		const loadQueue = async () => {
			try {
				const service = new CvatMediaService();
				const result = await service.getTasks();
				
				if (isMounted) {
					setState({ data: result, isLoading: false, error: null });
				}
			} catch (error) {
				if (isMounted) {
					setState({
						data: null,
						isLoading: false,
						error: error instanceof Error ? error.message : "Erreur de récupération des médias.",
					});
				}
			}
		};

		if (state.isLoading) {
			loadQueue();
		}

		return () => {
			isMounted = false;
		};
	}, [state.isLoading]);

	return { state, refreshMedia };
};