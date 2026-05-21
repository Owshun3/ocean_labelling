import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import Svg, { G, Image as SvgImage, Rect as SvgRect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { useStudioFrame } from '@/features/studio/hooks/useStudioFrame';
import type { StudioTool } from '@/features/studio/types';
import { curatorClient, type Proposal } from '@/services/api/CuratorService';
import type { CuratorBbox, CuratorMode, CuratorOpacity } from '../hooks/useCuratorMode';
import { opacityToFloat } from '../hooks/useCuratorMode';
import { CURATOR_COLOR, CURATOR_STROKE_WIDTH, ANNOTATOR_STROKE_WIDTH } from '../utils/annotatorColors';

export interface CuratorCanvasHandle {
	zoomIn:    () => void;
	zoomOut:   () => void;
	resetZoom: () => void;
}

export interface HoveredProposal {
	proposal: Proposal;
	x: number;
	y: number;
}

interface Props {
	jobId: number;
	mode: CuratorMode;
	tool: StudioTool;
	proposals: Proposal[];
	selectedIds: Set<number>;
	annotatorColor: string;
	opacity: CuratorOpacity;
	curatorBbox: CuratorBbox | null;
	onToggleSelect:  (proposalId: number, kind: 'single' | 'toggle' | 'range', ordered: number[]) => void;
	onSetCuratorBbox: (bbox: CuratorBbox | null) => void;
	onHover:         (h: HoveredProposal | null) => void;
}

type DragMode =
	| { kind: 'draw'; startImg: { x: number; y: number } }
	| { kind: 'pan';  startPos: { x: number; y: number } }
	| { kind: 'move'; startShape: { x: number; y: number }; startImg: { x: number; y: number } }
	| { kind: 'resize'; handle: ResizeHandle; startShape: CuratorBbox; startImg: { x: number; y: number } }
	| null;

// 4 coins + 4 milieux de côté. Les milieux contraignent le resize à une seule
// dimension (utile pour ajuster précisément hauteur OU largeur d'une bbox).
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';
const RESIZE_HANDLES: ResizeHandle[] = ['tl', 'tr', 'bl', 'br', 't', 'r', 'b', 'l'];

const ZOOM_STEP   = 1.25;
const ZOOM_MIN    = 0.2;
const ZOOM_MAX    = 8;
const MIN_RECT    = 4;
const HANDLE_SIZE = 10;

function computeFit(stageW: number, stageH: number, imgW: number, imgH: number) {
	if (stageW <= 0 || stageH <= 0 || imgW <= 0 || imgH <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
	const scale = Math.min(stageW / imgW, stageH / imgH);
	return { scale, offsetX: (stageW - imgW * scale) / 2, offsetY: (stageH - imgH * scale) / 2 };
}

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): CuratorBbox {
	return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function clamp(r: CuratorBbox, imgW: number, imgH: number): CuratorBbox {
	const x = Math.max(0, Math.min(r.x, imgW));
	const y = Math.max(0, Math.min(r.y, imgH));
	return { x, y, width: Math.max(2, Math.min(r.width, imgW - x)), height: Math.max(2, Math.min(r.height, imgH - y)) };
}

function pointInRect(p: { x: number; y: number }, r: CuratorBbox): boolean {
	return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function handleCenter(box: CuratorBbox, handle: ResizeHandle): { x: number; y: number } {
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

function resizeFromHandle(start: CuratorBbox, handle: ResizeHandle, dx: number, dy: number): CuratorBbox {
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

function hitTestHandle(imgPt: { x: number; y: number }, b: CuratorBbox, screenScale: number): ResizeHandle | null {
	const tol = HANDLE_SIZE / screenScale;
	for (const h of RESIZE_HANDLES) {
		const c = handleCenter(b, h);
		if (Math.abs(imgPt.x - c.x) <= tol && Math.abs(imgPt.y - c.y) <= tol) return h;
	}
	return null;
}

export const CuratorCanvas = forwardRef<CuratorCanvasHandle, Props>(({
	jobId, mode, tool, proposals, selectedIds, annotatorColor, opacity, curatorBbox,
	onToggleSelect, onSetCuratorBbox, onHover,
}, ref) => {
	const frameSpec = useMemo(() => ({
		client: curatorClient,
		path:   `/jobs/${jobId}/frame`,
		params: { number: 0, quality: 'compressed' },
	}), [jobId]);
	const { image, loading, error } = useStudioFrame(jobId, 0, frameSpec);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [stageScale, setStageScale] = useState(1);
	const [stagePos,   setStagePos]   = useState({ x: 0, y: 0 });
	const [ghost, setGhost] = useState<CuratorBbox | null>(null);
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
		if (mode === 'review') { setGhost(null); }
		dragRef.current = null;
	}, [mode]);

	const handleBeginAt = useCallback((sx: number, sy: number) => {
		if (!image) return;
		if (tool === 'pan') {
			dragRef.current = { kind: 'pan', startPos: { x: stagePos.x - sx, y: stagePos.y - sy } };
			return;
		}
		const imgPt = screenToImage(sx, sy);
		if (!imgPt) return;

		if (mode === 'drawing') {
			if (curatorBbox) {
				const handleHit = hitTestHandle(imgPt, curatorBbox, fit.scale * stageScale);
				if (handleHit && tool === 'select') {
					dragRef.current = { kind: 'resize', handle: handleHit, startShape: { ...curatorBbox }, startImg: imgPt };
					return;
				}
				if (tool === 'select' && pointInRect(imgPt, curatorBbox)) {
					dragRef.current = { kind: 'move', startShape: { x: curatorBbox.x, y: curatorBbox.y }, startImg: imgPt };
					return;
				}
				// Already a curator bbox + rectangle tool: ignore (must clear first)
				return;
			}
			if (tool === 'rectangle') {
				dragRef.current = { kind: 'draw', startImg: imgPt };
				setGhost({ x: imgPt.x, y: imgPt.y, width: 0, height: 0 });
			}
			return;
		}

		// Review mode: click proposal to select
		const ordered = proposals.map((p) => p.cvat_shape_id);
		const hit = [...proposals].reverse().find((p) => pointInRect(imgPt, p as any));
		if (hit) {
			onToggleSelect(hit.cvat_shape_id, 'single', ordered);
		}
	}, [image, tool, mode, screenToImage, stagePos, curatorBbox, fit.scale, stageScale, proposals, onToggleSelect]);

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
			setGhost(normalize(drag.startImg, imgPt));
			return;
		}
		if (drag.kind === 'move' && curatorBbox) {
			const dx = imgPt.x - drag.startImg.x;
			const dy = imgPt.y - drag.startImg.y;
			onSetCuratorBbox(clamp({ x: drag.startShape.x + dx, y: drag.startShape.y + dy, width: curatorBbox.width, height: curatorBbox.height }, image.width, image.height));
			return;
		}
		if (drag.kind === 'resize') {
			const dx = imgPt.x - drag.startImg.x;
			const dy = imgPt.y - drag.startImg.y;
			onSetCuratorBbox(clamp(resizeFromHandle(drag.startShape, drag.handle, dx, dy), image.width, image.height));
		}
	}, [image, screenToImage, curatorBbox, onSetCuratorBbox]);

	const handleEnd = useCallback(() => {
		const drag = dragRef.current;
		if (drag?.kind === 'draw' && ghost && image) {
			if (ghost.width >= MIN_RECT && ghost.height >= MIN_RECT) {
				onSetCuratorBbox(clamp(ghost, image.width, image.height));
			}
		}
		dragRef.current = null;
		setGhost(null);
	}, [ghost, image, onSetCuratorBbox]);

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

	const handlePinchEnd = useCallback(() => { pinchStartRef.current = null; }, []);

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

	const onPointerMoveWeb = Platform.OS === 'web'
		? (e: any) => {
			if (!image) return;
			const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect?.();
			if (!rect) return;
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const imgPt = screenToImage(sx, sy);
			if (!imgPt) { onHover(null); return; }
			const hit = [...proposals].reverse().find((p) => pointInRect(imgPt, p as any));
			if (hit) onHover({ proposal: hit, x: sx, y: sy }); else onHover(null);
		}
		: undefined;

	const annotatorStrokeWidth = ANNOTATOR_STROKE_WIDTH / (fit.scale * stageScale);
	const curatorStrokeWidth   = CURATOR_STROKE_WIDTH   / (fit.scale * stageScale);
	const dashUnit = 6 / (fit.scale * stageScale);
	const handleW  = HANDLE_SIZE / (fit.scale * stageScale);
	const opFloat  = opacityToFloat(opacity);

	return (
		<View
			style={styles.container}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				setSize({ width, height });
			}}
			{...(Platform.OS === 'web' ? { onWheel: onWheelWeb, onPointerMove: onPointerMoveWeb, onPointerLeave: () => onHover(null) } as any : {})}
		>
			{loading && <View style={styles.overlay} pointerEvents="none"><ActivityIndicator size="large" color={COLORS.primary} /></View>}
			{error && <View style={styles.overlay} pointerEvents="none"><Text style={styles.errorText}>Erreur : {error}</Text></View>}

			{size.width > 0 && size.height > 0 && image && (
				<GestureDetector gesture={composedGesture}>
					<View style={StyleSheet.absoluteFill}>
						<Svg width={size.width} height={size.height}>
							<G transform={`translate(${stagePos.x}, ${stagePos.y}) scale(${stageScale})`}>
								<G transform={`translate(${fit.offsetX}, ${fit.offsetY}) scale(${fit.scale})`}>
									<SvgImage href={image.uri} width={image.width} height={image.height} preserveAspectRatio="none" />
									{proposals.map((p) => {
										const isSelected = selectedIds.has(p.cvat_shape_id);
										const op = isSelected ? 1 : opFloat;
										if (op === 0) return null;
										return (
											<SvgRect
												key={p.cvat_shape_id}
												x={p.x}
												y={p.y}
												width={p.width}
												height={p.height}
												stroke={annotatorColor}
												strokeWidth={annotatorStrokeWidth}
												fill={`${annotatorColor}22`}
												opacity={op}
											/>
										);
									})}
									{curatorBbox && (
										<>
											<SvgRect
												x={curatorBbox.x}
												y={curatorBbox.y}
												width={curatorBbox.width}
												height={curatorBbox.height}
												stroke={CURATOR_COLOR}
												strokeWidth={curatorStrokeWidth}
												fill={`${CURATOR_COLOR}33`}
											/>
											{mode === 'drawing' && tool === 'select' ? (
												<>
													{RESIZE_HANDLES.map((handle) => {
														const c = handleCenter(curatorBbox, handle);
														return (
															<SvgRect
																key={handle}
																x={c.x - handleW / 2}
																y={c.y - handleW / 2}
																width={handleW}
																height={handleW}
																fill={COLORS.background.card}
																stroke={CURATOR_COLOR}
																strokeWidth={annotatorStrokeWidth}
															/>
														);
													})}
												</>
											) : null}
										</>
									)}
									{ghost && (
										<SvgRect
											x={ghost.x}
											y={ghost.y}
											width={ghost.width}
											height={ghost.height}
											stroke={CURATOR_COLOR}
											strokeWidth={annotatorStrokeWidth}
											strokeDasharray={`${dashUnit * 1.5},${dashUnit}`}
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

CuratorCanvas.displayName = 'CuratorCanvas';

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative', backgroundColor: COLORS.background.imagePlaceholder, overflow: 'hidden' },
	overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
});
