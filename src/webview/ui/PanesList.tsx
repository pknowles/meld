import type { FC } from "react";
import type { editor } from "monaco-editor";
import { MeldPane } from "./meldPane.tsx";
import type { DiffChunk, FileState, Highlight } from "./types.ts";

interface PanesListProps {
	ui: {
		files: [FileState | null, FileState | null, FileState | null, FileState | null, FileState | null];
		diffs: [DiffChunk[] | null, DiffChunk[] | null, DiffChunk[] | null, DiffChunk[] | null];
		baseCompareHighlighting: boolean;
		renderTrigger: number;
		syntaxHighlighting: boolean;
		externalSyncId: number;
		editorRefArray: React.MutableRefObject<editor.IStandaloneCodeEditor[]>;
	};
	prevB: readonly [FileState | null, FileState | null];
	prevD: readonly [DiffChunk[] | null, DiffChunk[] | null];
	renderBL: boolean;
	renderBR: boolean;
	highlights: (idx: number) => Highlight[];
	handleNavigate: (dir: "prev" | "next", type: "diff" | "conflict") => void;
	handleApplyChunk: (paneIndex: number, chunk: DiffChunk) => void;
	handleDeleteChunk: (paneIndex: number, chunk: DiffChunk) => void;
	handleCopyUpChunk: (paneIndex: number, chunk: DiffChunk) => void;
	handleCopyDownChunk: (paneIndex: number, chunk: DiffChunk) => void;
	handlers: {
		onCopyHash: (hash: string) => void;
		onShowDiff: (idx: number) => void;
		onCompleteMerge: () => void;
		toggleBase: (side: "left" | "right") => void;
	};
	attachScrollListener: (ed: editor.IStandaloneCodeEditor, i: number) => void;
	forceSyncToPane: (targetIdx: number, sourceIdx: number) => void;
	requestClipboardText: () => Promise<string>;
	writeClipboardText: (text: string) => Promise<void>;
	onEdit: (v: string | undefined, i: number) => void;
}

const SinglePane: FC<PanesListProps & { idx: number }> = (p) => {
	const { ui, handlers, idx } = p;
	return (
		<MeldPane
			idx={idx} files={ui.files} diffs={ui.diffs}
			prevBaseLeft={p.prevB[0]} prevBaseRight={p.prevB[1]}
			prevBaseLeftDiffs={p.prevD[0]} prevBaseRightDiffs={p.prevD[1]}
			renderBaseLeft={p.renderBL} renderBaseRight={p.renderBR}
			baseCompareHighlighting={ui.baseCompareHighlighting} renderTrigger={ui.renderTrigger}
			syntaxHighlighting={ui.syntaxHighlighting} externalSyncId={ui.externalSyncId}
			editorRefArray={ui.editorRefArray} attachScrollListener={p.attachScrollListener}
			forceSyncToPane={p.forceSyncToPane} handleApplyChunk={p.handleApplyChunk}
			handleDeleteChunk={p.handleDeleteChunk} handleCopyUpChunk={p.handleCopyUpChunk}
			handleCopyDownChunk={p.handleCopyDownChunk} handleCopyHash={handlers.onCopyHash}
			handleShowDiff={handlers.onShowDiff} handleCompleteMerge={handlers.onCompleteMerge}
			toggleBaseDiff={handlers.toggleBase} handleNavigate={p.handleNavigate}
			getHighlights={p.highlights} requestClipboardText={p.requestClipboardText}
			writeClipboardText={p.writeClipboardText} onEdit={p.onEdit}
		/>
	);
};

export const PanesList: FC<PanesListProps> = (p) => (
	<>
		<SinglePane {...p} idx={0} />
		<SinglePane {...p} idx={1} />
		<SinglePane {...p} idx={2} />
		<SinglePane {...p} idx={3} />
		<SinglePane {...p} idx={4} />
	</>
);
