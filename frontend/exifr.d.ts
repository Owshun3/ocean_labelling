declare module 'exifr/dist/full.esm.js' {
	export function parse(input: unknown, options?: unknown): Promise<any>;
	export function gps(input: unknown): Promise<any>;
	export function orientation(input: unknown): Promise<number | undefined>;
	export function thumbnail(input: unknown): Promise<ArrayBuffer | undefined>;
	const _default: { parse: typeof parse };
	export default _default;
}
