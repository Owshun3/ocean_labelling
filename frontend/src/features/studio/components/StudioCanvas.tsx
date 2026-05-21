import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import Svg, { G, Image as SvgImage, Rect as SvgRect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { useStudioFrame } from '../hooks/useStudioFrame';
import { StudioShape, StudioTool } from '../types';

export interface StudioCanvasHandle {
	zoomIn:    () => void;
	zoomOut:   () => void;
	resetZoom: () => void;
}

interface Props {
	jobId: number;
	frameNumber: number;
	tool: StudioTool;
	shapes: StudioShape[];
	selectedId: string | null;
	onAddShape:    (shape: StudioShape) => void;
	onSelectShape: (id: string | null) => void;
	onUpdateShape: (id: string, patch: Partial<StudioShape>) => void;
}

interface FitTransform {
	scale: number;
	offsetX: number;
	offsetY: number;
}

type DragMode =
	| { kind: 'draw'; startImg: { x: number; y: number } }
	| { kind: 'pan';  startPos: { x: number; y: number } }
	| { kind: 'move'; shapeId: string; startShape: { x: number; y: number }; startImg: { x: number; y: number } }
	| { kind: 'resize'; shapeId: string; handle: ResizeHandle; startShape: ShapeBox; startImg: { x: number; y: number } }
	| null;

// 4 coins + 4 milieux de côté. Les milieux contraignent le resize à une seule
// dimension (utile pour ajuster précisément hauteur OU largeur d'une bbox).
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';
const RESIZE_HANDLES: ResizeHandle[] = ['tl', 'tr', 'bl', 'br', 't', 'r', 'b', 'l'];
type ShapeBox = { x: number; y: number; width: number; height: number };

const ZOOM_STEP   = 1.25;
const ZOOM_MIN    = 0.2;
const ZOOM_MAX    = 8;
const MIN_RECT_PX = 4;
const HANDLE_SIZE = 10;

function computeFit(stageW: number, stageH: number, imgW: number, imgH: number): FitTransform {
	if (stageW <= 0 || stageH <= 0 || imgW <= 0 || imgH <= 0) {
		return { scale: 1, offsetX: 0, offsetY: 0 };
	}
	const scale = Math.min(stageW / imgW, stageH / imgH);
	return {
		scale,
		offsetX: (stageW - imgW * scale) / 2,
		offsetY: (stageH - imgH * scale) / 2,
	};
}

function newShapeId(): string {
	return Math.random().toString(36).slice(2, 11);
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): ShapeBox {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		width: Math.abs(a.x - b.x),
		height: Math.abs(a.y - b.y),
	};
}

function clampRect(r: ShapeBox, imgW: number, imgH: number): ShapeBox {
	const x = Math.max(0, Math.min(r.x, imgW));
	const y = Math.max(0, Math.min(r.y, imgH));
	const width  = Math.max(2, Math.min(r.width,  imgW - x));
	const height = Math.max(2, Math.min(r.height, imgH - y));
	return { x, y, width, height };
}

function pointInRect(p: { x: number; y: number }, r: ShapeBox): boolean {
	return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function handleCenter(box: ShapeBox, handle: ResizeHandle): { x: number; y: number } {
	const midX = box.x + box.width  / 2;
	const midY = box.y + box.height / 2;
	const rx = box.x + box.width;
	const by = box.y + box.height;
	switch (handle) {
		case 'tl': return { x: box.x, y: box.y };
		case 'tr': return { x: rx,    y: box.y };
		case 'bl': return { x: box.x, y: by };
		case 'br': return { x: rx,    y: by };
		case 't':  return { x: midX,  y: box.y };
		case 'b':  return { x: midX,  y: by };
		case 'l':  return { x: box.x, y: midY };
		case 'r':  return { x: rx,    y: midY };
	}
}

function resizeFromHandle(start: ShapeBox, handle: ResizeHandle, dx: number, dy: number): ShapeBox {
	const movesLeft   = handle === 'tl' || handle === 'bl' || handle === 'l';
	const movesRight  = handle === 'tr' || handle === 'br' || handle === 'r';
	const movesTop    = handle === 'tl' || handle === 'tr' || handle === 't';
	const movesBottom = handle === 'bl' || handle === 'br' || handle === 'b';

	let x = start.x;
	let y = start.y;
	let w = start.width;
	let h = start.height;
	if (movesLeft)   { x += dx; w -= dx; }
	if (movesRight)  { w += dx; }
	if (movesTop)    { y += dy; h -= dy; }
	if (movesBottom) { h += dy; }

	if (w < 4) { if (movesLeft) x = start.x + start.width  - 4; w = 4; }
	if (h < 4) { if (movesTop)  y = start.y + start.height - 4; h = 4; }
	return { x, y, width: w, height: h };
}

export const StudioCanvas = forwardRef<StudioCanvasHandle, Props>(({
	jobId, frameNumber, tool, shapes, selectedId, onAddShape, onSelectShape, onUpdateShape,
}, ref) => {
	const { image, loading, error } = useStudioFrame(jobId, frameNumber);
	const [size, setSize] = useState({ width: 0, height: 0 });

	const [stageScale, setStageScale] = useState(1);
	const [stagePos,   setStagePos]   = useState({ x: 0, y: 0 });
	const [ghost, setGhost] = useState<ShapeBox | null>(null);

	const dragRef = useRef<DragMode>(null);
	const pinchStartRef = useRef<{ scale: number; pos: { x: number; y: number }; focal: { x: number; y: number } } | null>(null);

	const fit = useMemo(
		() => computeFit(size.width, size.height, image?.width ?? 0, image?.height ?? 0),
		[size, image],
	);

	const screenToImage = useCallback((sx: number, sy: number): { x: number; y: number } | null => {
		if (!image || fit.scale === 0) return null;
		const groupX = (sx - stagePos.x) / stageScale;
		const groupY = (sy - stagePos.y) / stageScale;
		const imgX = (groupX - fit.offsetX) / fit.scale;
		const imgY = (groupY - fit.offsetY) / fit.scale;
		return { x: imgX, y: imgY };
	}, [fit, image, stagePos, stageScale]);

	const zoomTo = useCallback((newScale: number, focus: { x: number; y: number }) => {
		const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
		setStagePos((prev) => {
			const pointX = (focus.x - prev.x) / stageScale;
			const pointY = (focus.y - prev.y) / stageScale;
			return { x: focus.x - pointX * clamped, y: focus.y - pointY * clamped };
		});
		setStageScale(clamped);
	}, [stageScale]);

	useImperativeHandle(ref, () => ({
		zoomIn:    () => zoomTo(stageScale * ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }),
		zoomOut:   () => zoomTo(stageScale / ZOOM_STEP, { x: size.width / 2, y: size.height / 2 }),
		resetZoom: () => { setStageScale(1); setStagePos({ x: 0, y: 0 }); },
	}), [stageScale, size, zoomTo]);

	useEffect(() => {
		if (tool !== 'rectangle') setGhost(null);
		if (tool !== 'select')    onSelectShape(null);
		dragRef.current = null;
	}, [tool, onSelectShape]);

	useEffect(() => {
		if (Platform.OS !== 'web' || typeof window === 'undefined') return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setGhost(null);
				onSelectShape(null);
				dragRef.current = null;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onSelectShape]);

	const handleBeginAt = useCallback((sx: number, sy: number) => {
		if (!image) return;
		const imgPt = screenToImage(sx, sy);
		if (tool === 'pan') {
			dragRef.current = { kind: 'pan', startPos: { x: stagePos.x - sx, y: stagePos.y - sy } };
			return;
		}
		if (tool === 'rectangle') {
			if (!imgPt) return;
			dragRef.current = { kind: 'draw', startImg: imgPt };
			setGhost({ x: imgPt.x, y: imgPt.y, width: 0, height: 0 });
			return;
		}
		if (tool === 'select') {
			if (!imgPt) { onSelectShape(null); return; }
			const selected = shapes.find((s) => s.id === selectedId) ?? null;
			if (selected) {
				const handleHit = hitTestHandle(imgPt, selected, fit.scale * stageScale);
				if (handleHit) {
					dragRef.current = { kind: 'resize', shapeId: selected.id, handle: handleHit, startShape: { x: selected.x, y: selected.y, width: selected.width, height: selected.height }, startImg: imgPt };
					return;
				}
				if (pointInRect(imgPt, selected)) {
					dragRef.current = { kind: 'move', shapeId: selected.id, startShape: { x: selected.x, y: selected.y }, startImg: imgPt };
					return;
				}
			}
			const hit = [...shapes].reverse().find((s) => pointInRect(imgPt, s));
			if (hit) {
				onSelectShape(hit.id);
				dragRef.current = { kind: 'move', shapeId: hit.id, startShape: { x: hit.x, y: hit.y }, startImg: imgPt };
			} else {
				onSelectShape(null);
			}
		}
	}, [image, screenToImage, tool, stagePos, shapes, selectedId, onSelectShape, fit.scale, stageScale]);

	const handleUpdateAt = useCallback((sx: number, sy: number) => {
		const drag = dragRef.current;
		if (!drag || !image) return;
		if (drag.kind === 'pan') {
			setStagePos({ x: drag.startPos.x + sx, y: drag.startPos.y + sy });
			return;
		}
		const imgPt = screenToImage(sx, sy);
		if (!imgPt) return;
		if (drag.kind === 'draw') {
			setGhost(normalizeRect(drag.startImg, imgPt));
			return;
		}
		if (drag.kind === 'move') {
			const dx = imgPt.x - drag.startImg.x;
			const dy = imgPt.y - drag.startImg.y;
			const next = clampRect({ x: drag.startShape.x + dx, y: drag.startShape.y + dy, width: shapeWidth(shapes, drag.shapeId), height: shapeHeight(shapes, drag.shapeId) }, image.width, image.height);
			onUpdateShape(drag.shapeId, { ...next, status: 'unsaved' });
			return;
		}
		if (drag.kind === 'resize') {
			const dx = imgPt.x - drag.startImg.x;
			const dy = imgPt.y - drag.startImg.y;
			const next = clampRect(resizeFromHandle(drag.startShape, drag.handle, dx, dy), image.width, image.height);
			onUpdateShape(drag.shapeId, { ...next, status: 'unsaved' });
		}
	}, [image, screenToImage, shapes, onUpdateShape]);

	const handleEnd = useCallback(() => {
		const drag = dragRef.current;
		if (drag?.kind === 'draw' && ghost && image) {
			if (ghost.width >= MIN_RECT_PX && ghost.height >= MIN_RECT_PX) {
				const clamped = clampRect(ghost, image.width, image.height);
				onAddShape({ id: newShapeId(), ...clamped, status: 'unsaved' });
			}
		}
		dragRef.current = null;
		setGhost(null);
	}, [ghost, image, onAddShape]);

	const handlePinchBegin = useCallback((focalX: number, focalY: number) => {
		pinchStartRef.current = { scale: stageScale, pos: { ...stagePos }, focal: { x: focalX, y: focalY } };
	}, [stageScale, stagePos]);

	const handlePinchUpdate = useCallback((delta: number, focalX: number, focalY: number) => {
		const start = pinchStartRef.current;
		if (!start) return;
		const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, start.scale * delta));
		const pointX = (start.focal.x - start.pos.x) / start.scale;
		const pointY = (start.focal.y - start.pos.y) / start.scale;
		setStageScale(newScale);
		setStagePos({ x: focalX - pointX * newScale, y: focalY - pointY * newScale });
	}, []);

	const handlePinchEnd = useCallback(() => {
		pinchStartRef.current = null;
	}, []);

	const panGesture = useMemo(() => Gesture.Pan()
		.minDistance(0)
		.onBegin((e) => { runOnJS(handleBeginAt)(e.x, e.y); })
		.onUpdate((e) => { runOnJS(handleUpdateAt)(e.x, e.y); })
		.onEnd(() => { runOnJS(handleEnd)(); })
		.onFinalize(() => { runOnJS(handleEnd)(); })
	, [handleBeginAt, handleUpdateAt, handleEnd]);

	const pinchGesture = useMemo(() => Gesture.Pinch()
		.onBegin((e) => { runOnJS(handlePinchBegin)(e.focalX, e.focalY); })
		.onUpdate((e) => { runOnJS(handlePinchUpdate)(e.scale, e.focalX, e.focalY); })
		.onEnd(() => { runOnJS(handlePinchEnd)(); })
	, [handlePinchBegin, handlePinchUpdate, handlePinchEnd]);

	const composedGesture = useMemo(() => Gesture.Simultaneous(pinchGesture, panGesture), [pinchGesture, panGesture]);

	const onWheelWeb = Platform.OS === 'web'
		? (e: any) => {
			e?.preventDefault?.();
			const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect?.();
			const localX = rect ? e.clientX - rect.left : size.width / 2;
			const localY = rect ? e.clientY - rect.top  : size.height / 2;
			const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
			zoomTo(stageScale * factor, { x: localX, y: localY });
		}
		: undefined;

	const stroke = (s: StudioShape) => s.status === 'saved' ? COLORS.status.validated : COLORS.warning;
	const strokeWidth = 1.25 / (fit.scale * stageScale);
	const handleW = HANDLE_SIZE / (fit.scale * stageScale);

	return (
		<View
			style={styles.container}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				setSize({ width, height });
			}}
			{...(Platform.OS === 'web' ? { onWheel: onWheelWeb } as any : {})}
		>
			{loading && (
				<View style={styles.overlay} pointerEvents="none">
					<ActivityIndicator size="large" color={COLORS.primary} />
				</View>
			)}
			{error && (
				<View style={styles.overlay} pointerEvents="none">
					<Text style={styles.errorText}>Erreur : {error}</Text>
				</View>
			)}
			{size.width > 0 && size.height > 0 && image && (
				<GestureDetector gesture={composedGesture}>
					<View style={StyleSheet.absoluteFill}>
						<Svg width={size.width} height={size.height}>
							<G transform={`translate(${stagePos.x}, ${stagePos.y}) scale(${stageScale})`}>
								<G transform={`translate(${fit.offsetX}, ${fit.offsetY}) scale(${fit.scale})`}>
									<SvgImage href={image.uri} width={image.width} height={image.height} preserveAspectRatio="none" />
									{shapes.map((s) => {
										const isSelected = tool === 'select' && selectedId === s.id;
										return (
											<React.Fragment key={s.id}>
												<SvgRect
													x={s.x}
													y={s.y}
													width={s.width}
													height={s.height}
													stroke={stroke(s)}
													strokeWidth={strokeWidth}
													fill={`${stroke(s)}22`}
												/>
												{isSelected ? (
													<>
														{RESIZE_HANDLES.map((handle) => {
															const c = handleCenter(s, handle);
															return (
																<SvgRect
																	key={handle}
																	x={c.x - handleW / 2}
																	y={c.y - handleW / 2}
																	width={handleW}
																	height={handleW}
																	fill={COLORS.background.card}
																	stroke={COLORS.primary}
																	strokeWidth={strokeWidth}
																/>
															);
														})}
													</>
												) : null}
											</React.Fragment>
										);
									})}
									{ghost && (
										<SvgRect
											x={ghost.x}
											y={ghost.y}
											width={ghost.width}
											height={ghost.height}
											stroke={COLORS.warning}
											strokeWidth={strokeWidth}
											strokeDasharray={`${6 / (fit.scale * stageScale)},${4 / (fit.scale * stageScale)}`}
											fill="transparent"
										/>
									)}
								</G>
							</G>
						</Svg>
					</View>
				</GestureDetector>
			)}
		</View>
	);
});

StudioCanvas.displayName = 'StudioCanvas';

function shapeWidth(shapes: StudioShape[], id: string): number {
	return shapes.find((s) => s.id === id)?.width ?? 0;
}
function shapeHeight(shapes: StudioShape[], id: string): number {
	return shapes.find((s) => s.id === id)?.height ?? 0;
}

function hitTestHandle(imgPt: { x: number; y: number }, shape: StudioShape, screenScale: number): ResizeHandle | null {
	const tol = HANDLE_SIZE / screenScale;
	// Tester les coins d'abord (priorité), puis les milieux : si on clique exactement
	// à la jonction coin/milieu, le coin gagne (resize 2D plus probable que 1D).
	for (const h of RESIZE_HANDLES) {
		const c = handleCenter(shape, h);
		if (Math.abs(imgPt.x - c.x) <= tol && Math.abs(imgPt.y - c.y) <= tol) return h;
	}
	return null;
}

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative', backgroundColor: COLORS.background.imagePlaceholder, overflow: 'hidden' },
	overlay: {
		...StyleSheet.absoluteFillObject,
		alignItems: 'center',
		justifyContent: 'center',
	},
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
});
