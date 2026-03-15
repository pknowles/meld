import debounce from "lodash.debounce";
import type { editor } from "monaco-editor";
import { type FC, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatedColumn } from "./animatedColumn.tsx";
import type { PaneDiffs, PaneFiles } from "./appHooks.ts";
import {
	useAppChunkActions,
	useAppHighlights,
	useAppMessageHandlers,
	useAppNavigation,
	useCommitModelUpdate,
	usePreviousNonNull,
} from "./appHooks.ts";
import { CodePane } from "./CodePane.tsx";
import { DiffCurtain } from "./DiffCurtain.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import type { Highlight as MeldHighlight } from "./types.ts";
import { ANIMATION_DURATION } from "./types.ts";
import { useClipboardOverrides } from "./useClipboardOverrides.ts";
import { useSynchronizedScrolling } from "./useSynchronizedScrolling.ts";
import { useVscodeMessageBus } from "./useVSCodeMessageBus.ts";

const DEFAULT_DEBOUNCE_DELAY = 300;

const GlobalStyles: FC = () => (
	<style>
		{`
        html, body, #root {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            overflow: hidden;
        }
        .diff-path-insert { fill: var(--meldMerge-diffCurtainInsertFill, #00c80033); }
        .diff-path-delete { fill: var(--meldMerge-diffCurtainDeleteFill, #ff000033); }
        .diff-path-replace { fill: var(--meldMerge-diffCurtainReplaceFill, #0064ff33); }
        .diff-path-conflict { fill: var(--meldMerge-diffCurtainConflictFill, #ff000033); }
        
        .diff-edge-insert { stroke: var(--meldMerge-diffCurtainInsertStroke, #00c80080); stroke-width: 1px; }
        .diff-edge-delete { stroke: var(--meldMerge-diffCurtainDeleteStroke, #ff000080); stroke-width: 1px; }
        .diff-edge-replace { stroke: var(--meldMerge-diffCurtainReplaceStroke, #0064ff80); stroke-width: 1px; }
        .diff-edge-conflict { stroke: var(--meldMerge-diffCurtainConflictStroke, #ff000080); stroke-width: 1px; }

        .diff-insert { background-color: var(--vscode-meldMerge-diffInsertBackground, rgba(0, 200, 0, 0.15)) !important; }
        .diff-delete { background-color: var(--vscode-meldMerge-diffDeleteBackground, rgba(255, 0, 0, 0.15)) !important; }
        .diff-replace { background-color: var(--vscode-meldMerge-diffReplaceBackground, rgba(0, 100, 255, 0.15)) !important; }
        .diff-conflict { background-color: var(--vscode-meldMerge-diffConflictBackground, rgba(255, 0, 0, 0.15)) !important; }
        .diff-margin { background-color: transparent !important; }

        .diff-insert-margin { background-color: var(--vscode-meldMerge-diffInsertBackground, rgba(0, 200, 0, 0.15)) !important; }
        .diff-delete-margin { background-color: var(--vscode-meldMerge-diffDeleteBackground, rgba(255, 0, 0, 0.15)) !important; }
        .diff-replace-margin { background-color: var(--vscode-meldMerge-diffReplaceBackground, rgba(0, 100, 255, 0.15)) !important; }
        .diff-conflict-margin { background-color: var(--vscode-meldMerge-diffConflictBackground, rgba(255, 0, 0, 0.15)) !important; }

        .diff-insert-inline { background-color: var(--vscode-meldMerge-diffInsertInlineBackground, rgba(0, 200, 0, 0.35)) !important; }
        .diff-delete-inline { background-color: var(--vscode-meldMerge-diffDeleteInlineBackground, rgba(255, 0, 0, 0.35)) !important; }
        .diff-replace-inline { background-color: var(--vscode-meldMerge-diffReplaceInlineBackground, rgba(0, 100, 255, 0.35)) !important; }
        .diff-conflict-inline { background-color: var(--vscode-meldMerge-diffConflictInlineBackground, rgba(255, 0, 0, 0.35)) !important; }

        .diff-view path { transition: opacity 0.2s; }
        .diff-container:hover .diff-view path { opacity: 0.8; }
    `}
	</style>
);

const MeldRoot: FC<{ children: React.ReactNode }> = ({ children }) => (
	<div
		style={{
			display: "flex",
			width: "100vw",
			height: "100vh",
			overflow: "hidden",
			position: "relative",
		}}
		data-testid="meld-root"
	>
		<GlobalStyles />
		{children}
	</div>
);

const useBaseAnimation = (files: PaneFiles) => {
	const [renderBL, setRenderBL] = useState(false);
	const [renderBR, setRenderBR] = useState(false);
	useLayoutEffect(() => {
		if (files[0]) {
			setRenderBL(true);
			return;
		}
		const t = setTimeout(() => {
			setRenderBL(false);
		}, ANIMATION_DURATION);
		return () => {
			clearTimeout(t);
		};
	}, [files[0]]);
	useLayoutEffect(() => {
		if (files[4]) {
			setRenderBR(true);
			return;
		}
		const t = setTimeout(() => {
			setRenderBR(false);
		}, ANIMATION_DURATION);
		return () => {
			clearTimeout(t);
		};
	}, [files[4]]);
	return { renderBL, renderBR };
};

interface MeldUIActionsProps {
	files: PaneFiles;
	setFiles: (f: PaneFiles) => void;
	filesRef: React.MutableRefObject<PaneFiles>;
	diffs: PaneDiffs;
	setDiffs: (d: PaneDiffs) => void;
	diffsRef: React.MutableRefObject<PaneDiffs>;
	vscodeApi: ReturnType<typeof useVscodeMessageBus>;
	attachScrollListener: (ed: editor.IStandaloneCodeEditor, i: number) => void;
	forceSyncToPane: (target: number, source: number) => void;
	chunkActions: ReturnType<typeof useAppChunkActions>;
	handleNavigate: (dir: "prev" | "next", type: "diff" | "conflict") => void;
	highlights: (idx: number) => MeldHighlight[];
	requestClipboardText: () => Promise<string>;
	writeClipboardText: (t: string) => Promise<void>;
	commitModelUpdate: (v: string) => void;
	debounceDelay: number;
	setRenderTrigger: React.Dispatch<React.SetStateAction<number>>;
	editorRefArray: React.MutableRefObject<editor.IStandaloneCodeEditor[]>;
}

const useMeldUIActions = (p: MeldUIActionsProps) =>
	useMemo(
		() => ({
			attachScrollListener: p.attachScrollListener,
			forceSyncToPane: p.forceSyncToPane,
			...p.chunkActions,
			handleCopyHash: (hash: string) =>
				p.vscodeApi?.postMessage({ command: "copyHash", hash }),
			handleShowDiff: (idx: number) =>
				p.vscodeApi?.postMessage({
					command: "showDiff",
					paneIndex: idx,
				}),
			handleCompleteMerge: () =>
				p.vscodeApi?.postMessage({ command: "completeMerge" }),
			toggleBaseDiff: (side: "left" | "right") => {
				const targetIdx = side === "left" ? 0 : 4;
				if (p.files[targetIdx]) {
					const nf = [...p.files] as PaneFiles;
					nf[targetIdx] = null;
					p.filesRef.current = nf;
					p.setFiles(nf);
					const nd = [...p.diffs] as PaneDiffs;
					nd[side === "left" ? 0 : 3] = null;
					p.diffsRef.current = nd;
					p.setDiffs(nd);
				} else {
					p.vscodeApi?.postMessage({
						command: "requestBaseDiff",
						side,
					});
				}
			},
			handleNavigate: p.handleNavigate,
			getHighlights: p.highlights,
			requestClipboardText: p.requestClipboardText,
			writeClipboardText: p.writeClipboardText,
			onEdit: debounce((v: string | undefined, i: number) => {
				if (v !== undefined && i === 2) {
					p.commitModelUpdate(v);
					p.vscodeApi?.postMessage({
						command: "contentChanged",
						text: v,
					});
				}
			}, p.debounceDelay),
			handleMountEditor: (
				ed: editor.IStandaloneCodeEditor,
				i: number,
			) => {
				p.editorRefArray.current[i] = ed;
				p.attachScrollListener(ed, i);
				if (i === 0 || i === 4) {
					setTimeout(() => {
						p.forceSyncToPane(i === 0 ? 1 : 3, i);
					}, 50);
				}
				p.setRenderTrigger((v) => v + 1);
			},
		}),
		[
			p.attachScrollListener,
			p.forceSyncToPane,
			p.chunkActions,
			p.vscodeApi,
			p.files,
			p.setFiles,
			p.filesRef,
			p.diffs,
			p.setDiffs,
			p.diffsRef,
			p.handleNavigate,
			p.highlights,
			p.requestClipboardText,
			p.writeClipboardText,
			p.commitModelUpdate,
			p.debounceDelay,
			p.setRenderTrigger,
			p.editorRefArray,
		],
	);

const useAppCoreData = () => {
	const [files, setFiles] = useState<PaneFiles>([
		null,
		null,
		null,
		null,
		null,
	]);
	const filesRef = useRef<PaneFiles>([null, null, null, null, null]);
	const [diffs, setDiffs] = useState<PaneDiffs>([null, null, null, null]);
	const diffsRef = useRef<PaneDiffs>([null, null, null, null]);
	const differRef = useRef<
		import("../../matchers/diffutil.ts").Differ | null
	>(null);
	const [externalSyncId, setExternalSyncId] = useState(0);
	const [debounceDelay, setDebounceDelay] = useState(DEFAULT_DEBOUNCE_DELAY);
	const [syntaxHighlighting, setSyntaxHighlighting] = useState(true);
	const [baseCompareHighlighting, setBaseCompareHighlighting] =
		useState(false);
	const [smoothScrolling, setSmoothScrolling] = useState(true);
	const [renderTrigger, setRenderTrigger] = useState(0);
	const editorRefArray = useRef<editor.IStandaloneCodeEditor[]>([]);
	const diffsAreReversedRef = useRef<boolean[]>([false, true, false, false]);
	return useMemo(
		() => ({
			files,
			setFiles,
			filesRef,
			diffs,
			setDiffs,
			diffsRef,
			differRef,
			externalSyncId,
			setExternalSyncId,
			debounceDelay,
			setDebounceDelay,
			syntaxHighlighting,
			setSyntaxHighlighting,
			baseCompareHighlighting,
			setBaseCompareHighlighting,
			smoothScrolling,
			setSmoothScrolling,
			renderTrigger,
			setRenderTrigger,
			editorRefArray,
			diffsAreReversedRef,
		}),
		[
			files,
			diffs,
			externalSyncId,
			debounceDelay,
			syntaxHighlighting,
			baseCompareHighlighting,
			smoothScrolling,
			renderTrigger,
		],
	);
};

const useAppServices = (
	editorRefArray: React.MutableRefObject<editor.IStandaloneCodeEditor[]>,
) => {
	const vscodeApi = useVscodeMessageBus();
	const cb = useClipboardOverrides(editorRefArray);
	return useMemo(() => ({ vscodeApi, ...cb }), [vscodeApi, cb]);
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: consolidated state hook
const useAppState = () => {
	const d = useAppCoreData();
	const s = useAppServices(d.editorRefArray);
	const { attachScrollListener, forceSyncToPane } = useSynchronizedScrolling(
		d.editorRefArray,
		d.diffsRef,
		d.diffsAreReversedRef,
		d.setRenderTrigger,
		d.smoothScrolling,
	);

	const prevB = [
		usePreviousNonNull(d.files[0]),
		usePreviousNonNull(d.files[4]),
	] as const;
	const prevD = [
		usePreviousNonNull(d.diffs[0]),
		usePreviousNonNull(d.diffs[3]),
	] as const;
	const commitModelUpdate = useCommitModelUpdate({
		filesRef: d.filesRef,
		diffsRef: d.diffsRef,
		setFiles: d.setFiles,
		setDiffs: d.setDiffs,
		setRenderTrigger: d.setRenderTrigger,
		differRef: d.differRef,
	});

	useAppMessageHandlers(
		useMemo(
			() => ({
				filesRef: d.filesRef,
				diffsRef: d.diffsRef,
				setFiles: d.setFiles,
				setDiffs: d.setDiffs,
				setExternalSyncId: d.setExternalSyncId,
				setDebounceDelay: d.setDebounceDelay,
				setSyntaxHighlighting: d.setSyntaxHighlighting,
				setBaseCompareHighlighting: d.setBaseCompareHighlighting,
				setSmoothScrolling: d.setSmoothScrolling,
				setRenderTrigger: d.setRenderTrigger,
				commitModelUpdate,
				resolveClipboardRead: s.resolveClipboardRead,
				vscodeApi: s.vscodeApi,
				differRef: d.differRef,
			}),
			[
				d.filesRef,
				d.diffsRef,
				d.setFiles,
				d.setDiffs,
				d.setExternalSyncId,
				d.setDebounceDelay,
				d.setSyntaxHighlighting,
				d.setBaseCompareHighlighting,
				d.setSmoothScrolling,
				d.setRenderTrigger,
				commitModelUpdate,
				s.resolveClipboardRead,
				s.vscodeApi,
				d.differRef,
			],
		),
	);

	const { renderBL, renderBR } = useBaseAnimation(d.files);
	const highlights = useAppHighlights(
		d.files,
		d.diffs,
		d.baseCompareHighlighting,
	);
	const uiState = useMemo(
		() => ({
			files: d.files,
			diffs: d.diffs,
			prevBaseLeft: prevB[0],
			prevBaseRight: prevB[1],
			prevBaseLeftDiffs: prevD[0],
			prevBaseRightDiffs: prevD[1],
			renderBaseLeft: renderBL,
			renderBaseRight: renderBR,
			baseCompareHighlighting: d.baseCompareHighlighting,
			renderTrigger: d.renderTrigger,
			syntaxHighlighting: d.syntaxHighlighting,
			externalSyncId: d.externalSyncId,
			editorRefArray: d.editorRefArray,
			highlights,
		}),
		[
			d.files,
			d.diffs,
			prevB,
			prevD,
			renderBL,
			renderBR,
			d.baseCompareHighlighting,
			d.renderTrigger,
			d.syntaxHighlighting,
			d.externalSyncId,
			d.editorRefArray,
			highlights,
		],
	);
	const handleNavigate = useAppNavigation(d.editorRefArray, d.diffsRef);
	const chunkActions = useAppChunkActions(d.editorRefArray);

	const uiActions = useMeldUIActions({
		files: d.files,
		setFiles: d.setFiles,
		filesRef: d.filesRef,
		diffs: d.diffs,
		setDiffs: d.setDiffs,
		diffsRef: d.diffsRef,
		vscodeApi: s.vscodeApi,
		attachScrollListener,
		forceSyncToPane,
		chunkActions,
		handleNavigate,
		highlights,
		requestClipboardText: s.requestClipboardText,
		writeClipboardText: s.writeClipboardText,
		commitModelUpdate,
		debounceDelay: d.debounceDelay,
		setRenderTrigger: d.setRenderTrigger,
		editorRefArray: d.editorRefArray,
	});

	return { files: d.files, uiState, uiActions };
};

// biome-ignore lint/complexity: complex 5-pane layout
export const App: FC = () => {
	const { files, uiState, uiActions } = useAppState();

	if (files[1] === null) {
		return (
			<div
				style={{
					color: "white",
					padding: "20px",
					fontFamily: "sans-serif",
				}}
			>
				Loading Diff...
			</div>
		);
	}

	const isLBC = uiState.baseCompareHighlighting && Boolean(uiState.files[0]);
	const isRBC = uiState.baseCompareHighlighting && Boolean(uiState.files[4]);

	return (
		<ErrorBoundary>
			<GlobalStyles />
			<MeldRoot>
				{/* Pane 0: Base Left */}
				<AnimatedColumn
					isOpen={Boolean(uiState.files[0])}
					side="left"
					textColumns={3}
					textColumnsAfterAnimation={3}
					id="col-base-left"
				>
					<div
						style={{ flex: 1, display: "flex", overflow: "hidden" }}
					>
						<CodePane
							index={0}
							file={
								uiState.files[0] || {
									content: "",
									label: "Base",
									commit: undefined,
								}
							}
							ui={uiState}
							actions={uiActions}
							isMiddle={false}
							highlights={uiState.highlights(0)}
							onMount={uiActions.handleMountEditor}
						/>
					</div>
				</AnimatedColumn>

				{/* Curtain 0: Base-Local */}
				{(uiState.files[0] || uiState.renderBaseLeft) && (
					<DiffCurtain
						diffs={
							uiState.diffs[0] || uiState.prevBaseLeftDiffs || []
						}
						leftEditor={
							uiState.editorRefArray
								.current[0] as editor.IStandaloneCodeEditor
						}
						rightEditor={
							uiState.editorRefArray
								.current[1] as editor.IStandaloneCodeEditor
						}
						renderTrigger={uiState.renderTrigger}
						fadeOutRight={Boolean(!isLBC)}
						onApplyChunk={(c) => uiActions.handleApplyChunk(0, c)}
					/>
				)}

				{/* Pane 1: Local */}
				<div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
					<CodePane
						index={1}
						file={
							uiState.files[1] || {
								content: "",
								label: "Local",
								commit: undefined,
							}
						}
						ui={uiState}
						actions={uiActions}
						isMiddle={false}
						highlights={uiState.highlights(1)}
						onToggleBase={() => uiActions.toggleBaseDiff("left")}
						baseSide="left"
						isBaseActive={Boolean(uiState.files[0])}
						onMount={uiActions.handleMountEditor}
					/>
				</div>

				{/* Curtain 1: Local-Merged */}
				<DiffCurtain
					diffs={uiState.diffs[1] || []}
					leftEditor={
						uiState.editorRefArray
							.current[1] as editor.IStandaloneCodeEditor
					}
					rightEditor={
						uiState.editorRefArray
							.current[2] as editor.IStandaloneCodeEditor
					}
					renderTrigger={uiState.renderTrigger}
					fadeOutLeft={Boolean(isLBC)}
					onApplyChunk={(c) => uiActions.handleApplyChunk(1, c)}
					onCopyUpChunk={(c) => uiActions.handleCopyUpChunk(1, c)}
					onCopyDownChunk={(c) => uiActions.handleCopyDownChunk(1, c)}
				/>

				{/* Pane 2: Merged */}
				<div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
					<CodePane
						index={2}
						file={
							uiState.files[2] || {
								content: "",
								label: "Merged",
								commit: undefined,
							}
						}
						ui={uiState}
						actions={uiActions}
						isMiddle={true}
						highlights={uiState.highlights(2)}
						onMount={uiActions.handleMountEditor}
					/>
				</div>

				{/* Curtain 2: Merged-Remote */}
				<DiffCurtain
					diffs={uiState.diffs[2] || []}
					leftEditor={
						uiState.editorRefArray
							.current[2] as editor.IStandaloneCodeEditor
					}
					rightEditor={
						uiState.editorRefArray
							.current[3] as editor.IStandaloneCodeEditor
					}
					renderTrigger={uiState.renderTrigger}
					fadeOutRight={Boolean(isRBC)}
					onApplyChunk={(c) => uiActions.handleApplyChunk(3, c)}
					onCopyUpChunk={(c) => uiActions.handleCopyUpChunk(3, c)}
					onCopyDownChunk={(c) => uiActions.handleCopyDownChunk(3, c)}
				/>

				{/* Pane 3: Remote */}
				<div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
					<CodePane
						index={3}
						file={
							uiState.files[3] || {
								content: "",
								label: "Remote",
								commit: undefined,
							}
						}
						ui={uiState}
						actions={uiActions}
						isMiddle={false}
						highlights={uiState.highlights(3)}
						onToggleBase={() => uiActions.toggleBaseDiff("right")}
						baseSide="right"
						isBaseActive={Boolean(uiState.files[4])}
						onMount={uiActions.handleMountEditor}
					/>
				</div>

				{/* Curtain 3: Remote-Base */}
				{(uiState.files[4] || uiState.renderBaseRight) && (
					<DiffCurtain
						diffs={
							uiState.diffs[3] || uiState.prevBaseRightDiffs || []
						}
						leftEditor={
							uiState.editorRefArray
								.current[3] as editor.IStandaloneCodeEditor
						}
						rightEditor={
							uiState.editorRefArray
								.current[4] as editor.IStandaloneCodeEditor
						}
						renderTrigger={uiState.renderTrigger}
						fadeOutLeft={Boolean(!isRBC)}
						onApplyChunk={(c) => uiActions.handleApplyChunk(4, c)}
					/>
				)}

				{/* Pane 4: Base Right */}
				<AnimatedColumn
					isOpen={Boolean(uiState.files[4])}
					side="right"
					textColumns={3}
					textColumnsAfterAnimation={3}
					id="col-base-right"
				>
					<div
						style={{ flex: 1, display: "flex", overflow: "hidden" }}
					>
						<CodePane
							index={4}
							file={
								uiState.files[4] || {
									content: "",
									label: "Base",
									commit: undefined,
								}
							}
							ui={uiState}
							actions={uiActions}
							isMiddle={false}
							highlights={uiState.highlights(4)}
							onMount={uiActions.handleMountEditor}
						/>
					</div>
				</AnimatedColumn>
			</MeldRoot>
		</ErrorBoundary>
	);
};
