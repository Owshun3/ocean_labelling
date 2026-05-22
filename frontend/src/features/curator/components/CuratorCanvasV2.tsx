import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import Svg, { G, Image as SvgImage, Rect as SvgRect } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { useStudioFrame } from '@/features/studio/hooks/useStudioFrame';
import { curatorClient, type Proposal } from '@/services/api/CuratorService';
import type { CuratorBbox, CuratorTool, WipCertification } from '../hooks/useCuratorState';
import type { SpeciesStyle } from '../hooks/useSpeciesStyles';
import { CURATOR_COLOR, ANNOTATOR_STROKE_WIDTH, CURATOR_STROKE_WIDTH } from '../utils/annotatorColors';

export interface CuratorCanvasV2Handle {
	zoomIn:    () => void;
	zoomOut:   () => void;
	resetZoom: () => void;
}

interface Props {
	jobId: number;
	tool: CuratorTool;
	proposals: Proposal[];
	certifications: WipCertification[];
	proposalKeys: Map<number, string>;
	selectedSpeciesKey: string | null;
	checkedProposalIds: Set<number>;
	resolveStyle: (speciesKey: string) => SpeciesStyle;
	drawingBbox: CuratorBbox | null;
	onSetDrawingBbox: (bbox: CuratorBbox | null) => void;
	onClickProposal: (proposal: Proposal) => void;
}

type DragMode =
	| { kind: 'draw'; startImg: { x: number; y: number } }
	| { kind: 'pan';  startPos: { x: number; y: number } }
	| { kind: 'move'; startShape: { x: number; y: number }; startImg: { x: number; y: number } }
	| { kind: 'resize'; handle: ResizeHandle; startShape: CuratorBbox; startImg: { x: number; y: number } }
	| null;

type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';
const RESIZE_HANDLES: ResizeHandle[] = ['tl', 'tr', 'bl', 'br', 't', 'r', 'b', 'l'];

const ZOOM_STEP = 1.25;
const ZOOM_MIN  = 0.2;
const ZOOM_MAX  = 8;
const MIN_RECT  = 4;
const HANDLE_SIZE = 10;
const SELECT_TOLERANCE_PX = 12;

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
	const midX = box.x + box.width / 2;
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
	let x = start.x, y = start.y, w = start.width, h = start.height;
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

export const CuratorCanvasV2 = forwardRef<CuratorCanvasV2Handle, Props>(({
	jobId, tool, proposals, certifications, proposalKeys, selectedSpeciesKey, checkedProposalIds,
	resolveStyle, drawingBbox, onSetDrawingBbox, onClickProposal,
}, ref) => {
	const frameSpec = useMemo(() => ({
		client: curatorClient,
		path:   `/jobs/${jobId}/frame`,
		params: { number: 0, quality: 'compressed' },
	}), [jobId]);
	const { image, loading, error } = useStudioFrame(jobId, 0, frameSpec);

	const [size, setSize] = useState({ width: 0, height: 0 });
	const [stageScale, setStageScale] = useState(1);
	const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
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
		return { x: (groupX - fit.offsetX) / fit.scale, y: (groupY - fit.offsetY) / fit.scale };
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

	const handleBeginAt = useCallback((sx: number, sy: number) => {
		if (!image) return;
		if (tool === 'pan') {
			dragRef.current = { kind: 'pan', startPos: { x: stagePos.x - sx, y: stagePos.y - sy } };
			return;
		}
		const imgPt = screenToImage(sx, sy);
		if (!imgPt) return;

		if (drawingBbox && tool === 'select') {
			const handle = hitTestHandle(imgPt, drawingBbox, fit.scale * stageScale);
			if (handle) {
				dragRef.current = { kind: 'resize', handle, startShape: { ...drawingBbox }, startImg: imgPt };
				return;
			}
			if (pointInRect(imgPt, drawingBbox)) {
				dragRef.current = { kind: 'move', startShape: { x: drawingBbox.x, y: drawingBbox.y }, startImg: imgPt };
				return;
			}
		}

		if (tool === 'rectangle' && !drawingBbox) {
			dragRef.current = { kind: 'draw', startImg: imgPt };
			setGhost({ x: imgPt.x, y: imgPt.y, width: 0, height: 0 });
			return;
		}

		if (tool === 'select') {
			const hasSelection = selectedSpeciesKey !== null;
			const hits = proposals
				.filter((p) => {
					if (hasSelection && (proposalKeys.get(p.cvat_shape_id) ?? '') !== selectedSpeciesKey) return false;
					return pointInRect(imgPt, { x: p.x, y: p.y, width: p.width, height: p.height });
				})
				.sort((a, b) => (a.width * a.height) - (b.width * b.height));
			if (hits[0]) onClickProposal(hits[0]);
		}
	}, [image, tool, screenToImage, stagePos, drawingBbox, fit.scale, stageScale, proposals, proposalKeys, selectedSpeciesKey, onClickProposal]);

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
		if (drag.kind === 'move' && drawingBbox) {
			const dx = imgPt.x - drag.startImg.x;
			const dy = imgPt.y - drag.startImg.y;
			onSetDrawingBbox(clamp({
				x: drag.startShape.x + dx, y: drag.startShape.y + dy,
				width: drawingBbox.width, height: drawingBbox.height,
			}, image.width, image.height));
			return;
		}
		if (drag.kind === 'resize') {
			const dx = imgPt.x - drag.startImg.x;
			const dy = imgPt.y - drag.startImg.y;
			onSetDrawingBbox(clamp(resizeFromHandle(drag.startShape, drag.handle, dx, dy), image.width, image.height));
		}
	}, [image, screenToImage, drawingBbox, onSetDrawingBbox]);

	const handleEnd = useCallback(() => {
		const drag = dragRef.current;
		if (drag?.kind === 'draw' && ghost && image) {
			if (ghost.width >= MIN_RECT && ghost.height >= MIN_RECT) {
				onSetDrawingBbox(clamp(ghost, image.width, image.height));
			}
		}
		dragRef.current = null;
		setGhost(null);
	}, [ghost, image, onSetDrawingBbox]);

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

	const containerRef = useRef<View>(null);
	useEffect(() => {
		if (Platform.OS !== 'web') return;
		const node = containerRef.current as unknown as HTMLDivElement | null;
		if (!node) return;
		const handler = (e: WheelEvent) => {
			e.preventDefault();
			const rect = node.getBoundingClientRect();
			const localX = e.clientX - rect.left;
			const localY = e.clientY - rect.top;
			const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
			zoomTo(stageScale * factor, { x: localX, y: localY });
		};
		node.addEventListener('wheel', handler, { passive: false });
		return () => node.removeEventListener('wheel', handler);
	}, [zoomTo, stageScale]);

	const proposalStroke = ANNOTATOR_STROKE_WIDTH / (fit.scale * stageScale);
	const curatorStroke  = CURATOR_STROKE_WIDTH   / (fit.scale * stageScale);
	const dashUnit       = 6 / (fit.scale * stageScale);
	const handleW        = HANDLE_SIZE / (fit.scale * stageScale);

	const hasSpeciesSelection = selectedSpeciesKey !== null;

	return (
		<View
			ref={containerRef}
			style={styles.container}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				setSize({ width, height });
			}}
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
										const key = proposalKeys.get(p.cvat_shape_id) ?? '';
										const inSelectedSpecies = hasSpeciesSelection && key === selectedSpeciesKey;
										if (hasSpeciesSelection && !inSelectedSpecies) return null;

										const style = resolveStyle(key);
										const checked = checkedProposalIds.has(p.cvat_shape_id);

										const hasAnyCheckedInSelection = inSelectedSpecies && [...checkedProposalIds]
											.some((id) => (proposalKeys.get(id) ?? '') === selectedSpeciesKey);
										let op: number;
										let strokeMul: number;
										if (hasAnyCheckedInSelection) {
											if (checked) { op = 1; strokeMul = 1.8; }
											else { op = Math.min(style.opacity, 0.45); strokeMul = 1; }
										} else {
											op = style.opacity;
											strokeMul = inSelectedSpecies ? 1.4 : 1;
										}
										return (
											<SvgRect
												key={`prop-${p.cvat_shape_id}`}
												x={p.x} y={p.y} width={p.width} height={p.height}
												stroke={style.color}
												strokeWidth={proposalStroke * strokeMul}
												fill={`${style.color}22`}
												opacity={op}
											/>
										);
									})}

									{certifications.map((c) => {
										if (hasSpeciesSelection && c.speciesKey !== selectedSpeciesKey) return null;
										return (
											<SvgRect
												key={`cert-${c.localId}`}
												x={c.shape.x} y={c.shape.y}
												width={c.shape.width} height={c.shape.height}
												stroke={CURATOR_COLOR}
												strokeWidth={curatorStroke}
												fill={`${CURATOR_COLOR}33`}
											/>
										);
									})}

									{drawingBbox && (
										<>
											<SvgRect
												x={drawingBbox.x} y={drawingBbox.y}
												width={drawingBbox.width} height={drawingBbox.height}
												stroke={CURATOR_COLOR}
												strokeWidth={curatorStroke}
												strokeDasharray={`${dashUnit * 1.5},${dashUnit}`}
												fill="transparent"
											/>
											{tool === 'select' ? RESIZE_HANDLES.map((handle) => {
												const c = handleCenter(drawingBbox, handle);
												return (
													<SvgRect
														key={`handle-${handle}`}
														x={c.x - handleW / 2}
														y={c.y - handleW / 2}
														width={handleW}
														height={handleW}
														fill={COLORS.background.card}
														stroke={CURATOR_COLOR}
														strokeWidth={proposalStroke}
													/>
												);
											}) : null}
										</>
									)}

									{ghost && (
										<SvgRect
											x={ghost.x} y={ghost.y}
											width={ghost.width} height={ghost.height}
											stroke={CURATOR_COLOR}
											strokeWidth={proposalStroke}
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

CuratorCanvasV2.displayName = 'CuratorCanvasV2';

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative', backgroundColor: COLORS.background.imagePlaceholder, overflow: 'hidden' },
	overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },
});
