import debounce from "lodash.debounce";
import type { editor } from "monaco-editor";
import {
	type FC,
	Fragment,
	type PropsWithChildren,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Differ } from "../../matchers/diffutil.ts";
import {
	type PaneDiffs,
	type PaneFiles,
	useAppChunkActions,
	useAppHighlights,
	useAppMessageHandlers,
	useAppNavigation,
} from "./appHooks.ts";
import { CodePane } from "./CodePane.tsx";
import { DiffCurtain } from "./DiffCurtain.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { DIFF_WIDTH, type DiffChunk } from "./types.ts";
import { useClipboardOverrides } from "./useClipboardOverrides.ts";
import { useSynchronizedScrolling } from "./useSynchronizedScrolling.ts";
import { useVscodeMessageBus } from "./useVscodeMessageBus.ts";

const ANIMATION_DURATION = 430;
const ANIMATION_TRANSITION = "margin 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
const DEFAULT_DEBOUNCE_DELAY = 300;
const INITIAL_SYNC_DELAY = 50;

const splitLines = (text: string) => {
	const lines = text.split("\n");
	if (lines.length > 0 && lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
};

const AnimatedColumn = ({
	isOpen,
	children,
	side,
	textColumns,
	textColumnsAfterAnimation,
	id,
}: PropsWithChildren<{
	isOpen: boolean;
	side: "left" | "right";
	textColumns: number;
	textColumnsAfterAnimation: number;
	id?: string;
}>) => {
	const [shouldRender, setShouldRender] = useState(isOpen);
	const [active, setActive] = useState(false);

	useLayoutEffect(() => {
		if (isOpen) {
			setShouldRender(true);
			const raf = requestAnimationFrame(() => {
				setActive(true);
			});
			return () => {
				cancelAnimationFrame(raf);
			};
		}
		setActive(false);
		const t = setTimeout(() => {
			setShouldRender(false);
		}, ANIMATION_DURATION);
		return () => {
			clearTimeout(t);
		};
	}, [isOpen]);

	const div = isOpen ? textColumns : textColumnsAfterAnimation;
	const marginValue = active
		? "0"
		: `calc(-1 * ((100% + var(--meld-diff-width)) / ${div}))`;
	return shouldRender || isOpen ? (
		<div
			id={id}
			style={{
				display: "flex",
				overflow: "hidden",
				marginLeft: side === "left" ? marginValue : 0,
				marginRight: side === "right" ? marginValue : 0,
				transition: ANIMATION_TRANSITION,
				flex: 1,
			}}
		>
			{children}
		</div>
	) : null;
};

function usePreviousNonNull<T>(value: T | null): T | null {
	const ref = useRef<T | null>(value);
	useLayoutEffect(() => {
		if (value !== null) {
			ref.current = value;
		}
	}, [value]);
	return value !== null ? value : ref.current;
}

export const App: FC = () => {
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
	const differRef = useRef<Differ | null>(null);
	const [externalSyncId, setExternalSyncId] = useState(0);
	const [debounceDelay, setDebounceDelay] = useState(DEFAULT_DEBOUNCE_DELAY);
	const [syntaxHighlighting, setSyntaxHighlighting] = useState(true);
	const [baseCompareHighlighting, setBaseCompareHighlighting] =
		useState(false);
	const [smoothScrolling, setSmoothScrolling] = useState(true);
	const [renderTrigger, setRenderTrigger] = useState(0);
	const editorRefArray = useRef<editor.IStandaloneCodeEditor[]>([]);
	const diffsAreReversedRef = useRef<boolean[]>([false, true, false, false]);
	const [renderBaseLeft, setRenderBaseLeft] = useState(false);
	const [renderBaseRight, setRenderBaseRight] = useState(false);

	useLayoutEffect(() => {
		if (files[0]) {
			setRenderBaseLeft(true);
			return;
		}
		const t = setTimeout(() => {
			setRenderBaseLeft(false);
		}, ANIMATION_DURATION);
		return () => {
			clearTimeout(t);
		};
	}, [files[0]]);

	useLayoutEffect(() => {
		if (files[4]) {
			setRenderBaseRight(true);
			return;
		}
		const t = setTimeout(() => {
			setRenderBaseRight(false);
		}, ANIMATION_DURATION);
		return () => {
			clearTimeout(t);
		};
	}, [files[4]]);

	const vscodeApi = useVscodeMessageBus();
	const { resolveClipboardRead, requestClipboardText, writeClipboardText } =
		useClipboardOverrides(editorRefArray);
	const { attachScrollListener, forceSyncToPane } = useSynchronizedScrolling(
		editorRefArray,
		diffsRef,
		diffsAreReversedRef,
		setRenderTrigger,
		smoothScrolling,
	);

	const prevBaseLeft = usePreviousNonNull(files[0]);
	const prevBaseLeftDiffs = usePreviousNonNull(diffs[0]);
	const prevBaseRight = usePreviousNonNull(files[4]);
	const prevBaseRightDiffs = usePreviousNonNull(diffs[3]);

	const commitModelUpdate = useCallback(
		(value: string) => {
			const cF = filesRef.current;
			if (!(cF[1] && cF[2] && cF[3])) {
				return;
			}
			const oldMidLines = splitLines(cF[2].content);
			const newMidLines = splitLines(value);
			let nextDiffs: PaneDiffs | null = null;
			const d = differRef.current;
			if (d) {
				const mLen = Math.min(oldMidLines.length, newMidLines.length);
				let sIdx = 0;
				while (sIdx < mLen && oldMidLines[sIdx] === newMidLines[sIdx]) {
					sIdx++;
				}
				d.changeSequence(
					1,
					sIdx,
					newMidLines.length - oldMidLines.length,
					[
						splitLines(cF[1].content),
						newMidLines,
						splitLines(cF[3].content),
					],
				);
				nextDiffs = [...diffsRef.current];
				nextDiffs[1] = d._mergeCache
					.map((p) => p[0])
					.filter((c): c is DiffChunk => c !== null);
				nextDiffs[2] = d._mergeCache
					.map((p) => p[1])
					.filter((c): c is DiffChunk => c !== null);
				diffsRef.current = nextDiffs;
			}
			const nF = [...cF] as PaneFiles;
			nF[2] = { ...cF[2], content: value };
			filesRef.current = nF;
			setFiles(nF);
			if (nextDiffs) {
				setDiffs(nextDiffs);
			}
			setRenderTrigger((p) => p + 1);
		},
		[setFiles, setDiffs],
	);

	useAppMessageHandlers({
		filesRef,
		diffsRef,
		setFiles,
		setDiffs,
		setExternalSyncId,
		setDebounceDelay,
		setSyntaxHighlighting,
		setBaseCompareHighlighting,
		setSmoothScrolling,
		setRenderTrigger,
		commitModelUpdate,
		resolveClipboardRead,
		vscodeApi,
		differRef,
	});

	const getHighlights = useAppHighlights(
		files,
		diffs,
		baseCompareHighlighting,
	);
	const handleNavigate = useAppNavigation(editorRefArray, diffsRef);
	const {
		handleApplyChunk,
		handleDeleteChunk,
		handleCopyUpChunk,
		handleCopyDownChunk,
	} = useAppChunkActions(editorRefArray);

	const handleCopyHash = useCallback(
		(hash: string) => {
			vscodeApi?.postMessage({ command: "copyHash", hash });
		},
		[vscodeApi],
	);

	const handleShowDiff = useCallback(
		(idx: number) => {
			vscodeApi?.postMessage({ command: "showDiff", paneIndex: idx });
		},
		[vscodeApi],
	);

	const handleCompleteMerge = useCallback(() => {
		vscodeApi?.postMessage({ command: "completeMerge" });
	}, [vscodeApi]);

	const toggleBaseDiff = useCallback(
		(side: "left" | "right") => {
			const targetIdx = side === "left" ? 0 : 4;
			if (files[targetIdx]) {
				const nf = [...files] as PaneFiles;
				nf[targetIdx] = null;
				filesRef.current = nf;
				setFiles(nf);
				const nd = [...diffs] as PaneDiffs;
				nd[side === "left" ? 0 : 3] = null;
				diffsRef.current = nd;
				setDiffs(nd);
			} else {
				vscodeApi?.postMessage({ command: "requestBaseDiff", side });
			}
		},
		[files, diffs, setFiles, setDiffs, vscodeApi],
	);

	const onEdit = useMemo(
		() =>
			debounce((v: string | undefined, i: number) => {
				if (v !== undefined && i === 2) {
					commitModelUpdate(v);
					vscodeApi?.postMessage({
						command: "contentChanged",
						text: v,
					});
				}
			}, debounceDelay),
		[debounceDelay, commitModelUpdate, vscodeApi],
	);

	const renderPane = (idx: number) => {
		const active =
			files[idx] ||
			(idx === 0 ? prevBaseLeft : idx === 4 ? prevBaseRight : null);
		if (!active) {
			return null;
		}

		const isOpen = Boolean(files[idx]);
		const onToggleBase =
			idx === 1
				? () => {
						toggleBaseDiff("left");
					}
				: idx === 3
					? () => {
							toggleBaseDiff("right");
						}
					: undefined;
		const baseSide = idx === 1 ? "left" : idx === 3 ? "right" : undefined;
		const isBaseActive = Boolean(files[idx === 1 ? 0 : 4]);

		let dFC: DiffChunk[] | null | undefined = null;
		let lEIdx = idx;
		let rEIdx = idx + 1;
		let fOL = false;
		let fOR = false;
		const isLBC = baseCompareHighlighting && Boolean(files[0]);
		const isRBC = baseCompareHighlighting && Boolean(files[4]);

		if (idx === 0 && files[1]) {
			dFC = diffs[0] || prevBaseLeftDiffs;
			lEIdx = 0;
			rEIdx = 1;
			if (!isLBC) {
				fOR = true;
			}
		} else if (idx === 1 && files[2]) {
			dFC = diffs[1];
			lEIdx = 1;
			rEIdx = 2;
			if (isLBC) {
				fOL = true;
			}
		} else if (idx === 2 && files[3]) {
			dFC = diffs[2];
			lEIdx = 2;
			rEIdx = 3;
			if (isRBC) {
				fOR = true;
			}
		} else if (idx === 3 && active && (files[4] || renderBaseRight)) {
			dFC = diffs[3] || prevBaseRightDiffs;
			lEIdx = 3;
			rEIdx = 4;
			if (!isRBC) {
				fOL = true;
			}
		}

		const lEd = editorRefArray.current[lEIdx];
		const rEd = editorRefArray.current[rEIdx];
		const curtain = dFC &&
			lEd &&
			rEd &&
			lEd.getModel() &&
			rEd.getModel() && (
				<DiffCurtain
					diffs={dFC}
					leftEditor={lEd}
					rightEditor={rEd}
					renderTrigger={renderTrigger}
					reversed={idx === 1}
					fadeOutLeft={fOL}
					fadeOutRight={fOR}
					onApplyChunk={
						idx === 1 || idx === 2
							? (c) => {
									handleApplyChunk(idx === 1 ? 1 : 3, c);
								}
							: undefined
					}
					onDeleteChunk={
						idx === 1 || idx === 2
							? (c) => {
									handleDeleteChunk(idx, c);
								}
							: undefined
					}
					onCopyUpChunk={
						idx === 1 || idx === 2
							? (c) => {
									handleCopyUpChunk(idx === 1 ? 1 : 3, c);
								}
							: undefined
					}
					onCopyDownChunk={
						idx === 1 || idx === 2
							? (c) => {
									handleCopyDownChunk(idx === 1 ? 1 : 3, c);
								}
							: undefined
					}
				/>
			);

		const pane = (
			<CodePane
				file={active}
				index={idx}
				onMount={(ed, i) => {
					editorRefArray.current[i] = ed;
					attachScrollListener(ed, i);
					if (i === 0) {
						setTimeout(() => {
							forceSyncToPane(1, 0);
						}, INITIAL_SYNC_DELAY);
					} else if (i === 4) {
						setTimeout(() => {
							forceSyncToPane(3, 4);
						}, INITIAL_SYNC_DELAY);
					}
				}}
				onChange={onEdit}
				isMiddle={idx === 2}
				highlights={getHighlights(idx)}
				onCompleteMerge={idx === 2 ? handleCompleteMerge : undefined}
				onCopyHash={handleCopyHash}
				onShowDiff={() => {
					handleShowDiff(idx);
				}}
				externalSyncId={idx === 2 ? externalSyncId : undefined}
				requestClipboardText={
					idx === 2 ? requestClipboardText : undefined
				}
				writeClipboardText={writeClipboardText}
				syntaxHighlighting={syntaxHighlighting}
				onToggleBase={onToggleBase}
				baseSide={baseSide}
				isBaseActive={isBaseActive}
				onPrevDiff={
					idx === 2
						? () => {
								handleNavigate("prev", "diff");
							}
						: undefined
				}
				onNextDiff={
					idx === 2
						? () => {
								handleNavigate("next", "diff");
							}
						: undefined
				}
				onPrevConflict={
					idx === 2
						? () => {
								handleNavigate("prev", "conflict");
							}
						: undefined
				}
				onNextConflict={
					idx === 2
						? () => {
								handleNavigate("next", "conflict");
							}
						: undefined
				}
				autoFocusConflict={idx === 2}
			/>
		);

		if (idx === 0) {
			return (
				<AnimatedColumn
					key={idx}
					isOpen={isOpen}
					side="left"
					textColumns={3}
					textColumnsAfterAnimation={3}
					id="col-base-left"
				>
					{pane}
					{curtain}
				</AnimatedColumn>
			);
		}
		if (idx === 4) {
			return (
				<AnimatedColumn
					key={idx}
					isOpen={isOpen}
					side="right"
					textColumns={3}
					textColumnsAfterAnimation={3}
					id="col-base-right"
				>
					{pane}
					{curtain}
				</AnimatedColumn>
			);
		}

		return (
			<Fragment key={idx}>
				{pane}
				{curtain}
			</Fragment>
		);
	};

	return (
		<ErrorBoundary>
			<div
				id="meld-root"
				style={{
					display: "flex",
					width: "100vw",
					height: "100vh",
					flexDirection: "row",
					backgroundColor: "#1e1e1e",
					overflow: "hidden",
					...({ "--meld-diff-width": `${DIFF_WIDTH}px` } as Record<
						string,
						string
					>),
				}}
			>
				<style>{`
					.diff-insert { background-color: var(--vscode-meldMerge-diffInsertBackground, rgba(0, 200, 0, 0.15)) !important; }
					.diff-delete { background-color: var(--vscode-meldMerge-diffDeleteBackground, rgba(0, 200, 0, 0.15)) !important; }
					.diff-replace { background-color: var(--vscode-meldMerge-diffReplaceBackground, rgba(0, 100, 255, 0.15)) !important; }
					.diff-conflict { background-color: var(--vscode-meldMerge-diffConflictBackground, rgba(255, 0, 0, 0.15)) !important; }
					.diff-conflict-margin { background-color: var(--vscode-meldMerge-diffConflictBackground, rgba(255, 0, 0, 0.15)) !important; }
					.diff-replace-inline { background-color: var(--vscode-meldMerge-diffReplaceInlineBackground, rgba(0, 100, 255, 0.35)) !important; }
				`}</style>
				{files[1] === null ? (
					<div
						style={{
							color: "white",
							padding: "20px",
							fontFamily: "sans-serif",
						}}
					>
						Loading Diff...
					</div>
				) : (
					[0, 1, 2, 3, 4].map((idx) => renderPane(idx))
				)}
			</div>
		</ErrorBoundary>
	);
};
