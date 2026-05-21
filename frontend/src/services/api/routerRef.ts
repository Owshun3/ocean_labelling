// Untyped on purpose: this module is consumed by axios interceptors which
// can't depend on expo-router's strongly-typed Href without dragging the
// whole route table into runtime code. The router is set once from the root
// layout via setRouterRef(useRouter()) — see app/_layout.tsx.
type RouterLike = { replace: (href: any) => void };

let ref: RouterLike | null = null;

export function setRouterRef(r: RouterLike | null): void {
	ref = r;
}

export function getRouterRef(): RouterLike | null {
	return ref;
}
