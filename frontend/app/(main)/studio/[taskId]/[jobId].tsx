import { Redirect, useLocalSearchParams } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { StudioScreen } from '@/features/studio/screens/StudioScreen';

export default function StudioRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole === 'guest') return <Redirect href="/(main)" />;

	const params = useLocalSearchParams<{ taskId: string; jobId: string }>();
	const taskId = Number(params.taskId);
	const jobId  = Number(params.jobId);
	if (!Number.isFinite(taskId) || !Number.isFinite(jobId)) {
		return <Redirect href="/(main)" />;
	}

	return <StudioScreen taskId={taskId} jobId={jobId} />;
}
