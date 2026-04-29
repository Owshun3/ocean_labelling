import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { AnnotationHubScreen } from '@/features/annotation/screens/AnnotationHubScreen';

export default function AnnotateRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole === 'guest') return <Redirect href="/(main)" />;
	return <AnnotationHubScreen />;
}
