import debounce from "lodash.debounce";
import type { editor } from "monaco-editor";
import {
	type FC,
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
	useCommitModelUpdate,
	usePreviousNonNull,
} from "./appHooks.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { MeldRoot } from "./MeldRoot.tsx";
import { MeldPane } from "./meldPane.tsx";
import { ANIMATION_DURATION } from "./types.ts";
import { useClipboardOverrides } from "./useClipboardOverrides.ts";
import { useSynchronizedScrolling } from "./useSynchronizedScrolling.ts";
import { useVscodeMessageBus } from "./useVscodeMessageBus.ts";

const DEFAULT_DEBOUNCE_DELAY = 300;

function useBaseRenderState(files: PaneFiles) {
	const [renderLeft, setRenderLeft] = useState(false);
	const [renderRight, setRenderRight] = useState(false);

	useLayoutEffect(() => {
		if (files[0]) {
			setRenderLeft(true);
			return;
		}
		const t = setTimeout(() => setRenderLeft(false), ANIMATION_DURATION);
		return () => clearTimeout(t);
	}, [files[0]]);

	useLayoutEffect(() => {
		if (files[4]) {
			setRenderRight(true);
			return;
		}
		const t = setTimeout(() => setRenderRight(false), ANIMATION_DURATION);
		return () => clearTimeout(t);
	}, [files[4]]);

	return [renderLeft, renderRight];
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

	const [renderBL, renderBR] = useBaseRenderState(files);
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

	const prevB = [usePreviousNonNull(files[0]), usePreviousNonNull(files[4])];
	const prevD = [usePreviousNonNull(diffs[0]), usePreviousNonNull(diffs[3])];

	const commitModelUpdate = useCommitModelUpdate({
		filesRef,
		diffsRef,
		setFiles,
		setDiffs,
		setRenderTrigger,
		differRef,
	});

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

	const highlights = useAppHighlights(files, diffs, baseCompareHighlighting);
	const handleNavigate = useAppNavigation(editorRefArray, diffsRef);
	const {
		handleApplyChunk,
		handleDeleteChunk,
		handleCopyUpChunk,
		handleCopyDownChunk,
	} = useAppChunkActions(editorRefArray);

	const handlers = useMemo(
		() => ({
			onCopyHash: (hash: string) =>
				vscodeApi?.postMessage({ command: "copyHash", hash }),
			onShowDiff: (idx: number) =>
				vscodeApi?.postMessage({ command: "showDiff", paneIndex: idx }),
			onCompleteMerge: () =>
				vscodeApi?.postMessage({ command: "completeMerge" }),
			toggleBase: (side: "left" | "right") => {
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
					vscodeApi?.postMessage({
						command: "requestBaseDiff",
						side,
					});
				}
			},
		}),
		[files, diffs, vscodeApi],
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

	return (
		<ErrorBoundary>
			<MeldRoot>
				{[0, 1, 2, 3, 4].map((idx) => (
					<MeldPane
						key={idx}
						idx={idx}
						files={files}
						diffs={diffs}
						prevBaseLeft={prevB[0]}
						prevBaseRight={prevB[1]}
						prevBaseLeftDiffs={prevD[0]}
						prevBaseRightDiffs={prevD[1]}
						renderBaseLeft={renderBL}
						renderBaseRight={renderBR}
						baseCompareHighlighting={baseCompareHighlighting}
						renderTrigger={renderTrigger}
						syntaxHighlighting={syntaxHighlighting}
						externalSyncId={externalSyncId}
						editorRefArray={editorRefArray}
						attachScrollListener={attachScrollListener}
						forceSyncToPane={forceSyncToPane}
						handleApplyChunk={handleApplyChunk}
						handleDeleteChunk={handleDeleteChunk}
						handleCopyUpChunk={handleCopyUpChunk}
						handleCopyDownChunk={handleCopyDownChunk}
						handleCopyHash={handlers.onCopyHash}
						handleShowDiff={handlers.onShowDiff}
						handleCompleteMerge={handlers.onCompleteMerge}
						toggleBaseDiff={handlers.toggleBase}
						handleNavigate={handleNavigate}
						getHighlights={highlights}
						requestClipboardText={requestClipboardText}
						writeClipboardText={writeClipboardText}
						onEdit={onEdit}
					/>
				))}
			</MeldRoot>
		</ErrorBoundary>
	);
};
