// Copyright (C) 2002-2006 Stephen Kennedy <stevek@gnome.org>
// Copyright (C) 2009-2019 Kai Willadsen <kai.willadsen@gmail.com>
// Copyright (C) 2026 Pyarelal Knowles
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or (at
// your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import debounce from "lodash.debounce";
import type { editor } from "monaco-editor";
import {
	type FC,
	Fragment,
	type PropsWithChildren,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Differ } from "../../matchers/diffutil.ts";
import { CodePane } from "./CodePane.tsx";
import { DiffCurtain } from "./DiffCurtain.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { processChunk } from "./highlightUtil.ts";
import {
	type BaseDiffPayload,
	DIFF_WIDTH,
	type DiffChunk,
	type FileState,
	type Highlight,
} from "./types.ts";
import { useClipboardOverrides } from "./useClipboardOverrides.ts";
import { useSynchronizedScrolling } from "./useSynchronizedScrolling.ts";
import { useVscodeMessageBus } from "./useVSCodeMessageBus.ts";

const ANIMATION_DURATION = 430;
const ANIMATION_TRANSITION = "margin 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
const DEFAULT_DEBOUNCE_DELAY = 300;
const INITIAL_SYNC_DELAY = 50;
const HACK_SYNC_DELAY = 100;

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
			const raf = requestAnimationFrame(() => setActive(true));
			return () => cancelAnimationFrame(raf);
		}
		setActive(false);
		const t = setTimeout(() => setShouldRender(false), ANIMATION_DURATION);
		return () => clearTimeout(t);
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
	useEffect(() => {
		if (value !== null) {
			ref.current = value;
		}
	}, [value]);
	return value !== null ? value : ref.current;
}

type PaneFiles = [
	FileState | null,
	FileState | null,
	FileState | null,
	FileState | null,
	FileState | null,
];
type PaneDiffs = [
	DiffChunk[] | null,
	DiffChunk[] | null,
	DiffChunk[] | null,
	DiffChunk[] | null,
];

const useAppMessageHandlers = (p: {
	filesRef: React.MutableRefObject<PaneFiles>;
	diffsRef: React.MutableRefObject<PaneDiffs>;
	setFiles: (f: PaneFiles) => void;
	setDiffs: (d: PaneDiffs) => void;
	setExternalSyncId: (fn: (id: number) => number) => void;
	setDebounceDelay: (d: number) => void;
	setSyntaxHighlighting: (s: boolean) => void;
	setBaseCompareHighlighting: (b: boolean) => void;
	setSmoothScrolling: (s: boolean) => void;
	setRenderTrigger: (fn: (p: number) => number) => void;
	commitModelUpdate: (v: string) => void;
	resolveClipboardRead: (id: number, text: string) => void;
	vscodeApi: ReturnType<typeof useVscodeMessageBus>;
	differRef: React.MutableRefObject<Differ | null>;
}) => {
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const m = event.data;
			if (m.command === "loadDiff") {
				const iF: PaneFiles = [
					null,
					m.data.files[0],
					m.data.files[1],
					m.data.files[2],
					null,
				];
				const iD: PaneDiffs = [
					null,
					m.data.diffs[0],
					m.data.diffs[1],
					null,
				];
				p.filesRef.current = iF;
				p.setFiles(iF);
				p.setDiffs(iD);
				p.diffsRef.current = iD;
				p.setExternalSyncId((id) => id + 1);
				if (m.data.config?.debounceDelay !== undefined) {
					p.setDebounceDelay(m.data.config.debounceDelay);
				}
				if (m.data.config?.syntaxHighlighting !== undefined) {
					p.setSyntaxHighlighting(m.data.config.syntaxHighlighting);
				}
				if (m.data.config?.baseCompareHighlighting !== undefined) {
					p.setBaseCompareHighlighting(
						m.data.config.baseCompareHighlighting,
					);
				}
				if (m.data.config?.smoothScrolling !== undefined) {
					p.setSmoothScrolling(m.data.config.smoothScrolling);
				}
				const differ = new Differ();
				const dI = differ.setSequencesIter([
					splitLines(m.data.files[0].content),
					splitLines(m.data.files[1].content),
					splitLines(m.data.files[2].content),
				]);
				let s = dI.next();
				while (!s.done) {
					s = dI.next();
				}
				p.differRef.current = differ;
				setTimeout(
					() => p.setRenderTrigger((prev) => prev + 1),
					HACK_SYNC_DELAY,
				);
			} else if (m.command === "loadBaseDiff") {
				const { side, file, diffs: pD } = m.data as BaseDiffPayload;
				const nF = [...p.filesRef.current] as PaneFiles;
				nF[side === "left" ? 0 : 4] = file;
				p.filesRef.current = nF;
				p.setFiles(nF);
				const nD = [...p.diffsRef.current] as PaneDiffs;
				nD[side === "left" ? 0 : 3] = pD;
				p.diffsRef.current = nD;
				p.setDiffs(nD);
				setTimeout(
					() => p.setRenderTrigger((prev) => prev + 1),
					HACK_SYNC_DELAY,
				);
			} else if (m.command === "updateContent") {
				p.setExternalSyncId((id) => id + 1);
				p.commitModelUpdate(m.text);
			} else if (m.command === "updateConfig") {
				const c = m.config;
				if (c?.debounceDelay !== undefined) {
					p.setDebounceDelay(c.debounceDelay);
				}
				if (c?.syntaxHighlighting !== undefined) {
					p.setSyntaxHighlighting(c.syntaxHighlighting);
				}
				if (c?.baseCompareHighlighting !== undefined) {
					p.setBaseCompareHighlighting(c.baseCompareHighlighting);
				}
				if (c?.smoothScrolling !== undefined) {
					p.setSmoothScrolling(c.smoothScrolling);
				}
			} else if (m.command === "clipboardText") {
				p.resolveClipboardRead(Number(m.requestId), m.text as string);
			}
		};
		window.addEventListener("message", handleMessage);
		if (p.vscodeApi) {
			p.vscodeApi.postMessage({ command: "ready" });
		}
		return () => window.removeEventListener("message", handleMessage);
	}, [p]);
};

const useAppHighlights = (files: PaneFiles, diffs: PaneDiffs, bCH: boolean) =>
	useCallback(
		(paneIndex: number) => {
			const h: Highlight[] = [];
			if (files.length < 5) {
				return h;
			}
			const isLBC = bCH && Boolean(files[0]);
			const isRBC = bCH && Boolean(files[4]);
			if (paneIndex === 0) {
				const d = diffs[0];
				if (d) {
					for (const c of d) {
						processChunk(h, c, true, files[0], files[1]);
					}
				}
			} else if (paneIndex === 1) {
				const d = isLBC ? diffs[0] : diffs[1];
				if (d) {
					for (const c of d) {
						processChunk(
							h,
							c,
							false,
							files[1],
							isLBC ? files[0] : files[2],
						);
					}
				}
			} else if (paneIndex === 2) {
				const d1 = diffs[1];
				const d2 = diffs[2];
				if (d1) {
					for (const c of d1) {
						processChunk(h, c, true, files[2], files[1]);
					}
				}
				if (d2) {
					for (const c of d2) {
						processChunk(h, c, true, files[2], files[3]);
					}
				}
			} else if (paneIndex === 3) {
				const d = isRBC ? diffs[3] : diffs[2];
				if (d) {
					for (const c of d) {
						processChunk(
							h,
							c,
							isRBC,
							files[3],
							isRBC ? files[4] : files[2],
						);
					}
				}
			} else if (paneIndex === 4) {
				const d = diffs[3];
				if (d) {
					for (const c of d) {
						processChunk(h, c, false, files[4], files[3]);
					}
				}
			}
			return h;
		},
		[diffs, files, bCH],
	);

const useAppNavigation = (
	editorRefs: React.RefObject<editor.IStandaloneCodeEditor[]>,
	diffsRef: React.MutableRefObject<PaneDiffs>,
) =>
	useCallback(
		(dir: "prev" | "next", type: "diff" | "conflict") => {
			const ed = editorRefs.current?.[2];
			if (!ed) {
				return;
			}
			const all = [
				...(diffsRef.current[1] ?? []),
				...(diffsRef.current[2] ?? []),
			];
			const chunks = all
				.filter(
					(c) =>
						c.tag !== "equal" &&
						(type !== "conflict" || c.tag === "conflict"),
				)
				.sort((a, b) => a.startA - b.startA);
			if (chunks.length === 0) {
				return;
			}
			const sorted = chunks.filter(
				(c, i, self) => i === 0 || c.startA !== self[i - 1]?.startA,
			);
			if (sorted.length === 0) {
				return;
			}
			const cur = ed.getPosition()?.lineNumber || 1;
			const idx = sorted.findIndex((c) => c.startA + 1 >= cur);
			const n = sorted.length;
			let target: DiffChunk;
			if (dir === "next") {
				if (idx === -1) {
					target = sorted[0] as DiffChunk;
				} else {
					const c = sorted[idx] as DiffChunk;
					target =
						c.startA + 1 <= cur
							? (sorted[(idx + 1) % n] as DiffChunk)
							: c;
				}
			} else if (idx === -1) {
					target = sorted[n - 1] as DiffChunk;
				} else {
					const c = sorted[idx] as DiffChunk;
					target =
						c.startA + 1 < cur
							? c
							: (sorted[(idx - 1 + n) % n] as DiffChunk);
				}
			ed.revealLineInCenter(target.startA + 1);
			ed.setPosition({ lineNumber: target.startA + 1, column: 1 });
			ed.focus();
		},
		[editorRefs, diffsRef],
	);

const useAppChunkActions = (
	editorRefs: React.RefObject<editor.IStandaloneCodeEditor[]>,
) => {
	const handleApplyChunk = useCallback(
		(paneIndex: number, chunk: DiffChunk) => {
			const sourceEditor = editorRefs.current?.[paneIndex];
			const mergedEditor = editorRefs.current?.[2];
			if (!(sourceEditor && mergedEditor)) {
				return;
			}
			const sourceModel = sourceEditor.getModel();
			const mergedModel = mergedEditor.getModel();
			if (!(sourceModel && mergedModel)) {
				return;
			}
			let sourceText = "";
			if (chunk.startB < chunk.endB) {
				const sL = chunk.startB + 1;
				const eL = chunk.endB;
				const max = sourceModel.getLineCount();
				if (eL < max) {
					sourceText = sourceModel.getValueInRange({
						startLineNumber: sL,
						startColumn: 1,
						endLineNumber: eL + 1,
						endColumn: 1,
					});
				} else {
					sourceText = sourceModel.getValueInRange({
						startLineNumber: sL,
						startColumn: 1,
						endLineNumber: max,
						endColumn: sourceModel.getLineMaxColumn(max),
					});
					if (
						chunk.endA < mergedModel.getLineCount() &&
						sourceText !== ""
					) {
						sourceText += "\n";
					}
				}
			}
			const sL = chunk.startA + 1;
			const eL = chunk.endA;
			const mMax = mergedModel.getLineCount();
			const eLine = eL >= mMax ? mMax : eL + 1;
			const eCol = eL >= mMax ? mergedModel.getLineMaxColumn(mMax) : 1;
			if (sL > mMax) {
				const maxCol = mergedModel.getLineMaxColumn(mMax);
				const text =
					sourceText && !sourceText.startsWith("\n")
						? `\n${sourceText}`
						: sourceText;
				mergedEditor.executeEdits("meld-action", [
					{
						range: {
							startLineNumber: mMax,
							startColumn: maxCol,
							endLineNumber: mMax,
							endColumn: maxCol,
						},
						text,
						forceMoveMarkers: true,
					},
				]);
			} else {
				mergedEditor.executeEdits("meld-action", [
					{
						range: {
							startLineNumber: sL,
							startColumn: 1,
							endLineNumber: eLine,
							endColumn: eCol,
						},
						text: sourceText,
						forceMoveMarkers: true,
					},
				]);
			}
		},
		[editorRefs],
	);

	const handleDeleteChunk = useCallback(
		(_paneIndex: number, chunk: DiffChunk) => {
			const mergedEditor = editorRefs.current?.[2];
			if (!mergedEditor || chunk.startA >= chunk.endA) {
				return;
			}
			const mergedModel = mergedEditor.getModel();
			if (!mergedModel) {
				return;
			}
			let sL = chunk.startA + 1;
			const eL = chunk.endA;
			const mMax = mergedModel.getLineCount();
			let eLine = eL + 1;
			let eCol = 1;
			if (eL >= mMax) {
				eLine = mMax;
				eCol = mergedModel.getLineMaxColumn(mMax);
				if (sL > 1) {
					sL -= 1;
					mergedEditor.executeEdits("meld-action", [
						{
							range: {
								startLineNumber: sL,
								startColumn: mergedModel.getLineMaxColumn(sL),
								endLineNumber: eLine,
								endColumn: eCol,
							},
							text: "",
							forceMoveMarkers: true,
						},
					]);
					return;
				}
			}
			mergedEditor.executeEdits("meld-action", [
				{
					range: {
						startLineNumber: sL,
						startColumn: 1,
						endLineNumber: eLine,
						endColumn: eCol,
					},
					text: "",
					forceMoveMarkers: true,
				},
			]);
		},
		[editorRefs],
	);

	const handleCopyUpChunk = useCallback(
		(paneIndex: number, chunk: DiffChunk) => {
			const sourceEditor = editorRefs.current?.[paneIndex];
			const mergedEditor = editorRefs.current?.[2];
			if (!(sourceEditor && mergedEditor)) {
				return;
			}
			const sourceModel = sourceEditor.getModel();
			const mergedModel = mergedEditor.getModel();
			if (!(sourceModel && mergedModel)) {
				return;
			}
			let st = "";
			if (chunk.startB < chunk.endB) {
				const sL = chunk.startB + 1;
				const eL = chunk.endB;
				const max = sourceModel.getLineCount();
				st =
					eL < max
						? sourceModel.getValueInRange({
								startLineNumber: sL,
								startColumn: 1,
								endLineNumber: eL + 1,
								endColumn: 1,
							})
						: `${sourceModel.getValueInRange({ startLineNumber: sL, startColumn: 1, endLineNumber: max, endColumn: sourceModel.getLineMaxColumn(max) })}\n`;
			}
			if (!st) {
				return;
			}
			const sL = chunk.startA + 1;
			const max = mergedModel.getLineCount();
			if (sL > max) {
				const text = st.startsWith("\n") ? st : `\n${st}`;
				mergedEditor.executeEdits("meld-action", [
					{
						range: {
							startLineNumber: max,
							startColumn: mergedModel.getLineMaxColumn(max),
							endLineNumber: max,
							endColumn: mergedModel.getLineMaxColumn(max),
						},
						text,
						forceMoveMarkers: true,
					},
				]);
			} else {
				mergedEditor.executeEdits("meld-action", [
					{
						range: {
							startLineNumber: sL,
							startColumn: 1,
							endLineNumber: sL,
							endColumn: 1,
						},
						text: st,
						forceMoveMarkers: true,
					},
				]);
			}
		},
		[editorRefs],
	);

	const handleCopyDownChunk = useCallback(
		(paneIndex: number, chunk: DiffChunk) => {
			const sourceEditor = editorRefs.current?.[paneIndex];
			const mergedEditor = editorRefs.current?.[2];
			if (!(sourceEditor && mergedEditor)) {
				return;
			}
			const sourceModel = sourceEditor.getModel();
			const mergedModel = mergedEditor.getModel();
			if (!(sourceModel && mergedModel)) {
				return;
			}
			let st = "";
			if (chunk.startB < chunk.endB) {
				const sL = chunk.startB + 1;
				const eL = chunk.endB;
				const max = sourceModel.getLineCount();
				st =
					eL < max
						? sourceModel.getValueInRange({
								startLineNumber: sL,
								startColumn: 1,
								endLineNumber: eL + 1,
								endColumn: 1,
							})
						: sourceModel.getValueInRange({
								startLineNumber: sL,
								startColumn: 1,
								endLineNumber: max,
								endColumn: sourceModel.getLineMaxColumn(max),
							});
				if (
					eL >= max &&
					chunk.endA < mergedModel.getLineCount() &&
					st !== ""
				) {
					st += "\n";
				}
			}
			if (!st) {
				return;
			}
			const ins = chunk.endA + 1;
			const max = mergedModel.getLineCount();
			if (ins > max) {
				const text = st.startsWith("\n") ? st : `\n${st}`;
				mergedEditor.executeEdits("meld-action", [
					{
						range: {
							startLineNumber: max,
							startColumn: mergedModel.getLineMaxColumn(max),
							endLineNumber: max,
							endColumn: mergedModel.getLineMaxColumn(max),
						},
						text,
						forceMoveMarkers: true,
					},
				]);
			} else {
				mergedEditor.executeEdits("meld-action", [
					{
						range: {
							startLineNumber: ins,
							startColumn: 1,
							endLineNumber: ins,
							endColumn: 1,
						},
						text: st,
						forceMoveMarkers: true,
					},
				]);
			}
		},
		[editorRefs],
	);

	return {
		handleApplyChunk,
		handleDeleteChunk,
		handleCopyUpChunk,
		handleCopyDownChunk,
	};
};

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
	const editorRefs = useRef<editor.IStandaloneCodeEditor[]>([]);
	const diffsAreReversedRef = useRef<boolean[]>([false, true, false, false]);
	const [renderBaseLeft, setRenderBaseLeft] = useState(false);
	const [renderBaseRight, setRenderBaseRight] = useState(false);

	useLayoutEffect(() => {
		if (files[0]) {
			setRenderBaseLeft(true);
			return;
		}
		const t = setTimeout(
			() => setRenderBaseLeft(false),
			ANIMATION_DURATION,
		);
		return () => clearTimeout(t);
	}, [files[0]]);
	useLayoutEffect(() => {
		if (files[4]) {
			setRenderBaseRight(true);
			return;
		}
		const t = setTimeout(
			() => setRenderBaseRight(false),
			ANIMATION_DURATION,
		);
		return () => clearTimeout(t);
	}, [files[4]]);

	const vscodeApi = useVscodeMessageBus();
	const { resolveClipboardRead, requestClipboardText, writeClipboardText } =
		useClipboardOverrides(editorRefs);
	const { attachScrollListener, forceSyncToPane } = useSynchronizedScrolling(
		editorRefs,
		diffsRef,
		diffsAreReversedRef,
		setRenderTrigger,
		smoothScrolling,
	);

	const prevBaseLeft = usePreviousNonNull(files[0]);
	const prevBaseLeftDiffs = usePreviousNonNull(diffs[0]);
	const prevBaseRight = usePreviousNonNull(files[4]);
	const prevBaseRightDiffs = usePreviousNonNull(diffs[3]);

	const commitModelUpdate = useCallback((value: string) => {
		const cF = filesRef.current;
		if (!(cF[1] && cF[2] && cF[3])) {
			return;
		}
		const oldMidLines = splitLines(cF[2].content);
		const newMidLines = splitLines(value);
		let nextDiffs: PaneDiffs | null = null;
		const d = differRef.current;
		if (d) {
			let sIdx = 0;
			const mLen = Math.min(oldMidLines.length, newMidLines.length);
			while (sIdx < mLen && oldMidLines[sIdx] === newMidLines[sIdx]) {
				sIdx++;
			}
			d.changeSequence(1, sIdx, newMidLines.length - oldMidLines.length, [
				splitLines(cF[1].content),
				newMidLines,
				splitLines(cF[3].content),
			]);
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
	}, []);

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
	const handleNavigate = useAppNavigation(editorRefs, diffsRef);
	const {
		handleApplyChunk,
		handleDeleteChunk,
		handleCopyUpChunk,
		handleCopyDownChunk,
	} = useAppChunkActions(editorRefs);

	const handleCopyHash = (hash: string) => {
		vscodeApi?.postMessage({ command: "copyHash", hash });
	};
	const handleShowDiff = (idx: number) => {
		vscodeApi?.postMessage({ command: "showDiff", paneIndex: idx });
	};
	const handleCompleteMerge = () => {
		vscodeApi?.postMessage({ command: "completeMerge" });
	};

	const toggleBaseDiff = (side: "left" | "right") => {
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
	};

	const onEdit = useMemo(
		() =>
			debounce((v, i) => {
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

	return (
		<ErrorBoundary>
			<div
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
					.diff-margin { background-color: transparent !important; }
					.diff-insert-margin { background-color: var(--vscode-meldMerge-diffInsertBackground, rgba(0, 200, 0, 0.15)) !important; }
					.diff-delete-margin { background-color: var(--vscode-meldMerge-diffDeleteBackground, rgba(0, 200, 0, 0.15)) !important; }
					.diff-replace-margin { background-color: var(--vscode-meldMerge-diffReplaceBackground, rgba(0, 100, 255, 0.15)) !important; }
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
					[0, 1, 2, 3, 4].map((idx) => {
						const active =
							files[idx] ||
							(idx === 0
								? prevBaseLeft
								: idx === 4
									? prevBaseRight
									: null);
						if (!active) {
							return null;
						}
						const isOpen = Boolean(files[idx]);
						const onToggleBase =
							idx === 1
								? () => toggleBaseDiff("left")
								: idx === 3
									? () => toggleBaseDiff("right")
									: undefined;
						const baseSide =
							idx === 1
								? "left"
								: idx === 3
									? "right"
									: undefined;
						const isBaseActive = Boolean(files[idx === 1 ? 0 : 4]);
						let dFC: DiffChunk[] | null | undefined = null;
						let lEIdx = idx;
						let rEIdx = idx + 1;
						let fOL = false;
						let fOR = false;
						const isLBC =
							baseCompareHighlighting && Boolean(files[0]);
						const isRBC =
							baseCompareHighlighting && Boolean(files[4]);
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
						} else if (
							idx === 3 &&
							active &&
							(files[4] || renderBaseRight)
						) {
							dFC = diffs[3] || prevBaseRightDiffs;
							lEIdx = 3;
							rEIdx = 4;
							if (!isRBC) {
								fOL = true;
							}
						}

						const lEd = editorRefs.current[lEIdx];
						const rEd = editorRefs.current[rEIdx];
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
											? (c) =>
													handleApplyChunk(
														idx === 1 ? 1 : 3,
														c,
													)
											: undefined
									}
									onDeleteChunk={
										idx === 1 || idx === 2
											? (c) => handleDeleteChunk(idx, c)
											: undefined
									}
									onCopyUpChunk={
										idx === 1 || idx === 2
											? (c) =>
													handleCopyUpChunk(
														idx === 1 ? 1 : 3,
														c,
													)
											: undefined
									}
									onCopyDownChunk={
										idx === 1 || idx === 2
											? (c) =>
													handleCopyDownChunk(
														idx === 1 ? 1 : 3,
														c,
													)
											: undefined
									}
								/>
							);

						const pane = (
							<CodePane
								file={active}
								index={idx}
								onMount={(ed, i) => {
									editorRefs.current[i] = ed;
									attachScrollListener(ed, i);
									if (i === 0) {
										setTimeout(
											() => forceSyncToPane(1, 0),
											INITIAL_SYNC_DELAY,
										);
									} else if (i === 4) {
										setTimeout(
											() => forceSyncToPane(3, 4),
											INITIAL_SYNC_DELAY,
										);
									}
								}}
								onChange={onEdit}
								isMiddle={idx === 2}
								highlights={getHighlights(idx)}
								onCompleteMerge={
									idx === 2 ? handleCompleteMerge : undefined
								}
								onCopyHash={handleCopyHash}
								onShowDiff={() => handleShowDiff(idx)}
								externalSyncId={
									idx === 2 ? externalSyncId : undefined
								}
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
										? () => handleNavigate("prev", "diff")
										: undefined
								}
								onNextDiff={
									idx === 2
										? () => handleNavigate("next", "diff")
										: undefined
								}
								onPrevConflict={
									idx === 2
										? () =>
												handleNavigate(
													"prev",
													"conflict",
												)
										: undefined
								}
								onNextConflict={
									idx === 2
										? () =>
												handleNavigate(
													"next",
													"conflict",
												)
										: undefined
								}
								autoFocusConflict={idx === 2}
							/>
						);
						if (idx === 0 || idx === 4) {
							return (
								<Fragment key={idx}>
									<AnimatedColumn
										isOpen={isOpen}
										side={idx === 0 ? "left" : "right"}
										textColumns={5}
										textColumnsAfterAnimation={5}
									>
										<CodePane
											file={active}
											index={idx}
											onMount={(ed, i) => {
												editorRefs.current[i] = ed;
												attachScrollListener(ed, i);
												if (i === 0) {
													setTimeout(
														() =>
															forceSyncToPane(
																1,
																0,
															),
														INITIAL_SYNC_DELAY,
													);
												} else if (i === 4) {
													setTimeout(
														() =>
															forceSyncToPane(
																3,
																4,
															),
														INITIAL_SYNC_DELAY,
													);
												}
											}}
											onChange={onEdit}
											isMiddle={false}
											highlights={getHighlights(idx)}
											onCopyHash={handleCopyHash}
											onShowDiff={() =>
												handleShowDiff(idx)
											}
											writeClipboardText={
												writeClipboardText
											}
											syntaxHighlighting={
												syntaxHighlighting
											}
											onToggleBase={onToggleBase}
											baseSide={baseSide}
											isBaseActive={isBaseActive}
										/>
									</AnimatedColumn>
									{idx === 0
										? (files[0] || renderBaseLeft) &&
											curtain
										: curtain}
								</Fragment>
							);
						}
						return (
							<Fragment key={idx}>
								{pane}
								{curtain}
							</Fragment>
						);
					})
				)}
			</div>
		</ErrorBoundary>
	);
};
