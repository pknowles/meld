import { type FC, Fragment } from "react";
import { AnimatedColumn } from "./animatedColumn.tsx";
import type { PaneDiffs, PaneFiles } from "./appHooks.ts";
import { CodePane } from "./CodePane.tsx";
import { DiffCurtain } from "./DiffCurtain.tsx";
import { INITIAL_SYNC_DELAY, type MeldPaneProps } from "./meldPaneTypes.ts";
import type { DiffChunk, FileState } from "./types.ts";

const getCurtainHandlers = (p: MeldPaneProps, idx: number) => {
	if (idx !== 1 && idx !== 2) {
		return {};
	}
	const targetIdx = idx === 1 ? 1 : 3;
	return {
		onApplyChunk: (c: DiffChunk) => p.handleApplyChunk(targetIdx, c),
		onDeleteChunk: (c: DiffChunk) => p.handleDeleteChunk(idx, c),
		onCopyUpChunk: (c: DiffChunk) => p.handleCopyUpChunk(targetIdx, c),
		onCopyDownChunk: (c: DiffChunk) => p.handleCopyDownChunk(targetIdx, c),
	};
};

const PaneAndCurtain: FC<
	MeldPaneProps & {
		active: FileState;
		dFC: DiffChunk[] | null;
		lEIdx: number;
		rEIdx: number;
		fOL: boolean;
		fOR: boolean;
	}
> = (p) => {
	const { idx, active, dFC, lEIdx, rEIdx, fOL, fOR } = p;
	const isBaseActive = Boolean(p.files[idx === 1 ? 0 : 4]);
	const baseSide = idx === 1 ? "left" : idx === 3 ? "right" : undefined;
	const onToggleBase =
		idx === 1
			? () => p.toggleBaseDiff("left")
			: idx === 3
				? () => p.toggleBaseDiff("right")
				: undefined;

	const lEd = p.editorRefArray.current[lEIdx];
	const rEd = p.editorRefArray.current[rEIdx];
	const curtain = dFC && lEd && rEd && lEd.getModel() && rEd.getModel() && (
		<DiffCurtain
			diffs={dFC}
			leftEditor={lEd}
			rightEditor={rEd}
			renderTrigger={p.renderTrigger}
			reversed={idx === 1}
			fadeOutLeft={fOL}
			fadeOutRight={fOR}
			{...getCurtainHandlers(p, idx)}
		/>
	);

	return (
		<>
			<CodePane
				file={active}
				index={idx}
				onMount={(ed, i) => {
					p.editorRefArray.current[i] = ed;
					p.attachScrollListener(ed, i);
					const delay = i === 0 || i === 4 ? INITIAL_SYNC_DELAY : 0;
					if (delay > 0) {
						setTimeout(
							() => p.forceSyncToPane(i === 0 ? 1 : 3, i),
							delay,
						);
					}
				}}
				onChange={p.onEdit}
				isMiddle={idx === 2}
				highlights={p.getHighlights(idx)}
				onCompleteMerge={idx === 2 ? p.handleCompleteMerge : undefined}
				onCopyHash={p.handleCopyHash}
				onShowDiff={() => p.handleShowDiff(idx)}
				externalSyncId={idx === 2 ? p.externalSyncId : undefined}
				requestClipboardText={
					idx === 2 ? p.requestClipboardText : undefined
				}
				writeClipboardText={p.writeClipboardText}
				syntaxHighlighting={p.syntaxHighlighting}
				onToggleBase={onToggleBase}
				baseSide={baseSide}
				isBaseActive={isBaseActive}
				onPrevDiff={
					idx === 2
						? () => p.handleNavigate("prev", "diff")
						: undefined
				}
				onNextDiff={
					idx === 2
						? () => p.handleNavigate("next", "diff")
						: undefined
				}
				onPrevConflict={
					idx === 2
						? () => p.handleNavigate("prev", "conflict")
						: undefined
				}
				onNextConflict={
					idx === 2
						? () => p.handleNavigate("next", "conflict")
						: undefined
				}
				autoFocusConflict={idx === 2}
			/>
			{curtain}
		</>
	);
};

interface DiffState {
	dFC: DiffChunk[] | null;
	lEIdx: number;
	rEIdx: number;
	fOL: boolean;
	fOR: boolean;
}

const getDiffStateForBase = (
	idx: number,
	diffs: PaneDiffs,
	p: MeldPaneProps,
	isLBC: boolean,
	isRBC: boolean,
): DiffState => {
	if (idx === 0) {
		return {
			dFC: diffs[0] || p.prevBaseLeftDiffs,
			lEIdx: 0,
			rEIdx: 1,
			fOL: false,
			fOR: !isLBC,
		};
	}
	return {
		dFC: diffs[3] || p.prevBaseRightDiffs,
		lEIdx: 3,
		rEIdx: 4,
		fOL: !isRBC,
		fOR: false,
	};
};

const getDiffStateInternal = (
	idx: number,
	files: PaneFiles,
	diffs: PaneDiffs,
	p: MeldPaneProps,
): DiffState => {
	const isLBC = p.baseCompareHighlighting && Boolean(files[0]);
	const isRBC = p.baseCompareHighlighting && Boolean(files[4]);

	if (idx === 0 || idx === 3) {
		return getDiffStateForBase(idx, diffs, p, isLBC, isRBC);
	}
	if (idx === 1) {
		return { dFC: diffs[1], lEIdx: 1, rEIdx: 2, fOL: isLBC, fOR: false };
	}
	return { dFC: diffs[2], lEIdx: 2, rEIdx: 3, fOL: false, fOR: isRBC };
};

export const MeldPane: FC<MeldPaneProps> = (p) => {
	const { idx, files, diffs } = p;
	const active =
		files[idx] ||
		(idx === 0 ? p.prevBaseLeft : idx === 4 ? p.prevBaseRight : null);
	if (!active) {
		return null;
	}

	const content = (
		<PaneAndCurtain
			{...p}
			active={active}
			{...getDiffStateInternal(idx, files, diffs, p)}
		/>
	);

	if (idx === 0 || idx === 4) {
		const side = idx === 0 ? "left" : "right";
		return (
			<AnimatedColumn
				key={idx}
				isOpen={Boolean(files[idx])}
				side={side}
				textColumns={3}
				textColumnsAfterAnimation={3}
				id={`col-base-${side}`}
			>
				{content}
			</AnimatedColumn>
		);
	}

	return <Fragment key={idx}>{content}</Fragment>;
};
