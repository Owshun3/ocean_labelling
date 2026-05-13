import { useCallback, useEffect, useState } from 'react';
import { CuratorService, ProposalsPayload } from '@/services/api/CuratorService';

interface State {
	data: ProposalsPayload | null;
	loading: boolean;
	error: string | null;
}

export function useProposals(taskId: number): State & { reload: () => void } {
	const [state, setState] = useState<State>({ data: null, loading: true, error: null });

	const load = useCallback(() => {
		const service = new CuratorService();
		setState({ data: null, loading: true, error: null });
		service.getProposals(taskId)
			.then((data) => setState({ data, loading: false, error: null }))
			.catch((err) => setState({
				data: null, loading: false,
				error: err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.',
			}));
	}, [taskId]);

	useEffect(() => { load(); }, [load]);

	return { ...state, reload: load };
}
