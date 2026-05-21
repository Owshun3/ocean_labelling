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

// Shape normalisé par kind : text→string, chips→string[] (single = len 1),
// date-range→{from,to} en ISO yyyy-mm-dd, bool→true|false|null (null = ignoré),
// number-range→{min,max}.
export type FilterValue =
	| string
	| string[]
	| { from?: string; to?: string }
	| boolean | null
	| { min?: number; max?: number };

export type FilterValueMap = Record<string, FilterValue | undefined>;

export interface FilterSortState {
	filters: FilterValueMap;
	sort: SortValue | null;
}

export type FieldExtractor<T> = (item: T) => unknown;
export type FieldExtractors<T> = Record<string, FieldExtractor<T>>;
