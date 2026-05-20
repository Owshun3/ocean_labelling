/**
 * Schéma déclaratif pour la barre filtres/tris réutilisable.
 *
 * Chaque page définit un tableau de FilterField + un tableau de SortOption ;
 * le composant FilterSortBar rend l'UI adaptée à chaque type et `useFilteredAndSorted`
 * applique les valeurs sur une liste en mémoire.
 *
 * Évolutif : pour passer plus tard à un filtrage serveur, on conserve le même
 * schéma côté front et on POST les FilterValue au backend au lieu de filtrer
 * côté client.
 */

export type FilterField =
	| { kind: 'text';         key: string; label: string; placeholder?: string }
	| { kind: 'chips';        key: string; label: string; options: { value: string; label: string }[]; multi: boolean }
	| { kind: 'date-range';   key: string; label: string }
	| { kind: 'bool';         key: string; label: string; trueLabel?: string; falseLabel?: string }
	| { kind: 'number-range'; key: string; label: string; min?: number; max?: number };

export interface SortOption {
	key: string;
	label: string;
	defaultDirection?: 'asc' | 'desc';
}

export type SortDirection = 'asc' | 'desc';

export interface SortValue {
	key: string;
	direction: SortDirection;
}

// Valeur normalisée d'un filtre selon son `kind`.
export type FilterValue =
	| string                              // text
	| string[]                            // chips multi (ou single = array longueur 1)
	| { from?: string; to?: string }      // date-range (ISO yyyy-mm-dd)
	| boolean | null                      // bool (null = "peu importe")
	| { min?: number; max?: number };     // number-range

export type FilterValueMap = Record<string, FilterValue | undefined>;

export interface FilterSortState {
	filters: FilterValueMap;
	sort: SortValue | null;
}

// Extracteurs : pour chaque clé déclarée dans le schéma, comment lire la valeur
// correspondante sur un item de la liste. Permet au hook de rester agnostique
// du shape métier.
export type FieldExtractor<T> = (item: T) => unknown;
export type FieldExtractors<T> = Record<string, FieldExtractor<T>>;
