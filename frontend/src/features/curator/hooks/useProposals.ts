import { useCallback, useEffect, useState } from 'react';
import { CuratorService, ProposalsPayload } from '@/services/api/CuratorService';

interface State {
	data: ProposalsPayload | null;
	loading: boolean;
	error: string | null;
}

export function useProposals(taskId: number): State & { reload: () => void } {
	const [state, setState] = useState<State>({ data: null, loading: true, error: null });

	const fetchOnce = useCallback((soft: boolean) => {
		const service = new CuratorService();
		if (!soft) setState({ data: null, loading: true, error: null });
		service.getProposals(taskId)
			.then((data) => setState((prev) => ({ data, loading: false, error: null })))
			.catch((err) => setState((prev) => ({
				data: soft ? prev.data : null,
				loading: false,
				error: err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.',
			})));
	}, [taskId]);

	useEffect(() => { fetchOnce(false); }, [fetchOnce]);

	const reload = useCallback(() => fetchOnce(true), [fetchOnce]);
	return { ...state, reload };
}
