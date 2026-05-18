import { Redirect, useLocalSearchParams } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { VideoExtractorScreen } from '@/features/studio/screens/VideoExtractorScreen';

export default function VideoExtractorRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole === 'guest') return <Redirect href="/(main)" />;
	const { videoId } = useLocalSearchParams<{ videoId: string }>();
	const id = Number(videoId);
	if (!Number.isFinite(id)) return <Redirect href="/(main)/media" />;
	return <VideoExtractorScreen videoId={id} />;
}
