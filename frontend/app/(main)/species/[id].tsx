import { useLocalSearchParams } from 'expo-router';
import { SpeciesSheetScreen } from '@/features/species/screens/SpeciesSheetScreen';

export default function SpeciesSheetRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const numId = Number(id);
	if (!Number.isFinite(numId)) return null;
	return <SpeciesSheetScreen speciesId={numId} />;
}
