import { useLocalSearchParams } from 'expo-router';
import { StudioCertifiedViewScreen } from '@/features/studio/screens/StudioCertifiedViewScreen';

export default function StudioCertifiedViewRoute() {
	const { taskId } = useLocalSearchParams<{ taskId: string }>();
	const id = Number(taskId);
	if (!Number.isFinite(id)) return null;
	return <StudioCertifiedViewScreen taskId={id} />;
}
