// Copyright (C) 2026 Pyarelal Knowles, GPL v2
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or (at
// your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import Editor from "@monaco-editor/react";
import { editor, Selection, KeyMod, KeyCode } from "monaco-editor";
import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type FC,
	type CSSProperties,
	type MouseEvent,
	type FocusEvent,
} from "react";
import type { FileState, Highlight, Commit } from "./types.ts";
import { computeMinimalEdits } from "./editorUtil.ts";

const NEWLINE_REGEX = /\r?\n/;

interface CodePaneProps {
	file: FileState;
	index: number;
	onMount: (ed: editor.IStandaloneCodeEditor, i: number) => void;
	onChange: (v: string | undefined, i: number) => void;
	isMiddle: boolean;
	highlights?: Highlight[] | undefined;
	onCompleteMerge?: (() => void) | undefined;
	onCopyHash?: ((h: string) => void) | undefined;
	externalSyncId?: number | undefined;
	onShowDiff?: (() => void) | undefined;
	requestClipboardText?: (() => Promise<string>) | undefined;
	writeClipboardText?: ((t: string) => void) | undefined;
	syntaxHighlighting?: boolean | undefined;
	onToggleBase?: (() => void) | undefined;
	baseSide?: "left" | "right" | undefined;
	isBaseActive?: boolean | undefined;
	style?: CSSProperties | undefined;
	onPrevDiff?: (() => void) | undefined;
	onNextDiff?: (() => void) | undefined;
	onPrevConflict?: (() => void) | undefined;
	onNextConflict?: (() => void) | undefined;
	autoFocusConflict?: boolean | undefined;
}

const CommitHover: FC<{
	commit: Commit;
	pos: { x: number; y: number };
	hoverRef: React.RefObject<HTMLDivElement | null>;
	onCopyHash: (e: MouseEvent) => void;
}> = ({ commit, pos, hoverRef, onCopyHash }) => (
	<div
		ref={hoverRef}
		style={{
			position: "fixed",
			top: pos.y,
			left: pos.x,
			zIndex: 1000,
			backgroundColor: "var(--vscode-editorWidget-background, #252526)",
			border: "1px solid var(--vscode-widget-border, #454545)",
			borderRadius: "6px",
			padding: "16px",
			width: "350px",
			boxShadow: "0 4px 10px rgba(0, 0, 0, 0.2)",
			color: "var(--vscode-editor-foreground, #cccccc)",
			fontSize: "13px",
			fontFamily: "var(--vscode-font-family, sans-serif)",
			pointerEvents: "auto",
			textAlign: "left",
			lineHeight: 1.4,
			userSelect: "text",
			cursor: "auto",
		}}
	>
		<div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>
			{commit.title}
		</div>
		<div style={{ opacity: 0.8, marginBottom: "4px" }}>
			<strong>{commit.authorName}</strong> &lt;{commit.authorEmail}&gt;
		</div>
		<div style={{ opacity: 0.8, marginBottom: "12px" }}>
			{new Date(commit.date).toLocaleString()}
		</div>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "8px",
				backgroundColor:
					"var(--vscode-textCodeBlock-background, #1e1e1e)",
				padding: "4px 8px",
				borderRadius: "4px",
				marginBottom: "12px",
			}}
		>
			<span
				style={{
					fontFamily: "var(--vscode-editor-font-family, monospace)",
				}}
			>
				{commit.hash.substring(0, 8)}
			</span>
			<button
				type="button"
				onClick={onCopyHash}
				title="Copy Hash"
				style={{
					background: "none",
					border: "none",
					color: "var(--vscode-textLink-foreground, #3794ff)",
					cursor: "pointer",
					marginLeft: "auto",
					padding: "4px",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 16 16"
					xmlns="http://www.w3.org/2000/svg"
					fill="currentColor"
				>
					<title>Copy Hash</title>
					<path
						fillRule="evenodd"
						clipRule="evenodd"
						d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H6v10h6V7z"
					/>
					<path
						fillRule="evenodd"
						clipRule="evenodd"
						d="M3 1L2 2v10h2V3h6V1H3z"
					/>
				</svg>
			</button>
		</div>
		{commit.body && (
			<pre
				style={{
					marginTop: "0",
					borderTop: "1px solid var(--vscode-widget-border, #454545)",
					paddingTop: "12px",
					whiteSpace: "pre-wrap",
					fontFamily: "var(--vscode-editor-font-family, monospace)",
					margin: 0,
				}}
			>
				{commit.body}
			</pre>
		)}
	</div>
);

const CommitInfo: FC<{
	commit: Commit;
	onCopyHash?: ((hash: string) => void) | undefined;
	onShowDiff?: (() => void) | undefined;
}> = ({ commit, onCopyHash, onShowDiff }) => {
	const [showHover, setShowHover] = useState(false);
	const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
	const hoverRef = useRef<HTMLDivElement>(null);
	const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
	const onEnter = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
		if (hoverTimerRef.current) {
			clearTimeout(hoverTimerRef.current);
		}
		const r = e.currentTarget.getBoundingClientRect();
		const x = Math.min(
			Math.max(8, r.left - 20),
			Math.max(8, window.innerWidth - 370),
		);
		const y =
			r.bottom + 254 > window.innerHeight - 20 && r.top - 254 > 8
				? r.top - 254
				: r.bottom + 4;
		setHoverPos({ x, y });
		setShowHover(true);
	};
	const onLeave = () => {
		hoverTimerRef.current = setTimeout(() => setShowHover(false), 300);
	};
	return (
		<button
			type="button"
			style={{
				position: "relative",
				background: "none",
				border: "none",
				padding: 0,
				margin: 0,
				color: "inherit",
				font: "inherit",
				display: "inline-block",
				cursor: "pointer",
			}}
			onClick={(e) => {
				if (!hoverRef.current?.contains(e.target as Node)) {
					onShowDiff?.();
				}
			}}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			onFocus={onEnter}
			onBlur={onLeave}
			aria-label="Commit Information"
		>
			<span
				style={{
					marginLeft: "8px",
					opacity: 0.7,
					textDecoration: "underline",
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				[{commit.title}]
			</span>
			{showHover && (
				<CommitHover
					commit={commit}
					pos={hoverPos}
					hoverRef={hoverRef}
					onCopyHash={(e) => {
						e.stopPropagation();
						onCopyHash?.(commit.hash);
					}}
				/>
			)}
		</button>
	);
};

const HeaderNav: FC<{
	isMiddle: boolean;
	onPrevDiff?: (() => void) | undefined;
	onNextDiff?: (() => void) | undefined;
	onPrevConflict?: (() => void) | undefined;
	onNextConflict?: (() => void) | undefined;
}> = (p) => {
	if (!p.isMiddle) {
		return null;
	}
	return (
		<div
			style={{
				display: "flex",
				gap: "2px",
				alignItems: "center",
				marginRight: "8px",
			}}
		>
			<button
				type="button"
				className="nav-btn"
				onClick={p.onPrevDiff}
				title="Previous Diff (Alt+Up)"
			>
				<svg width="16" height="16" viewBox="0 0 16 16">
					<title>Previous Diff</title>
					<path
						fill="currentColor"
						d="M7.414 7L10 9.586L9.586 10L6 6.414L9.586 3L10 3.414L7.414 6H14v1H7.414z"
						transform="rotate(90 8 8)"
					/>
				</svg>
			</button>
			<button
				type="button"
				className="nav-btn"
				onClick={p.onNextDiff}
				title="Next Diff (Alt+Down)"
			>
				<svg width="16" height="16" viewBox="0 0 16 16">
					<title>Next Diff</title>
					<path
						fill="currentColor"
						d="M7.414 7L10 9.586L9.586 10L6 6.414L9.586 3L10 3.414L7.414 6H14v1H7.414z"
						transform="rotate(-90 8 8)"
					/>
				</svg>
			</button>
			<div
				style={{
					width: "1px",
					height: "16px",
					backgroundColor: "#444",
					margin: "0 4px",
				}}
			/>
			<button
				type="button"
				className="nav-btn nav-btn-conflict"
				onClick={p.onPrevConflict}
				title="Previous Conflict (Ctrl+J)"
			>
				<svg width="16" height="16" viewBox="0 0 16 16">
					<title>Previous Conflict</title>
					<path fill="currentColor" d="M8 3.5l-4 4h3V12h2V7.5h3z" />
					<path
						fill="currentColor"
						opacity="0.5"
						d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm7-6a6 6 0 1 0 0 12A6 6 0 0 0 8 2z"
					/>
				</svg>
			</button>
			<button
				type="button"
				className="nav-btn nav-btn-conflict"
				onClick={p.onNextConflict}
				title="Next Conflict (Ctrl+K)"
			>
				<svg width="16" height="16" viewBox="0 0 16 16">
					<title>Next Conflict</title>
					<path fill="currentColor" d="M8 12.5l4-4h-3V4H7v4.5H4z" />
					<path
						fill="currentColor"
						opacity="0.5"
						d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8zm7-6a6 6 0 1 0 0 12A6 6 0 0 0 8 2z"
					/>
				</svg>
			</button>
		</div>
	);
};

const ToggleBaseBtn: FC<{
	isBaseActive: boolean;
	onToggleBase?: (() => void) | undefined;
	baseSide?: "left" | "right" | undefined;
	side: "left" | "right";
}> = ({ isBaseActive, onToggleBase, baseSide, side }) => {
	if (!onToggleBase || baseSide !== side) {
		return null;
	}
	const p =
		side === "left"
			? "M2 2h12v12H2V2zm-1 0a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm3 1v10h3V3H4z"
			: "M14 2H2v12h12V2zM1 2a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm11 1v10H9V3h3z";
	return (
		<button
			type="button"
			onClick={onToggleBase}
			title="Compare with Base"
			style={{
				background: "none",
				border: "none",
				color: isBaseActive
					? "var(--vscode-textLink-foreground, #3794ff)"
					: "inherit",
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				padding: "4px",
				[side === "left" ? "marginRight" : "marginLeft"]: "8px",
				opacity: isBaseActive ? 1 : 0.6,
			}}
		>
			<svg
				width="16"
				height="16"
				viewBox="0 0 16 16"
				xmlns="http://www.w3.org/2000/svg"
				fill="currentColor"
			>
				<title>Compare with Base</title>
				<path fillRule="evenodd" clipRule="evenodd" d={p} />
			</svg>
		</button>
	);
};

const HeaderStyles = () => (
	<style>
		{
			".nav-btn { background: none; border: none; color: inherit; cursor: pointer; display: flex; alignItems: center; padding: 4px; opacity: 0.6; transition: opacity 0.2s, background-color 0.2s; border-radius: 4px; } .nav-btn:hover { opacity: 1; background-color: rgba(255, 255, 255, 0.1); } .nav-btn-conflict { color: var(--vscode-errorForeground, #f48771); } @keyframes flash-red { 0% { background-color: #2ea043; } 20% { background-color: #f48771; box-shadow: 0 0 10px #f48771; } 100% { background-color: #2ea043; } } .button-flash { animation: flash-red 1s ease-out; }"
		}
	</style>
);

const handleClipboardAction = (
	ed: editor.ICodeEditor,
	type: "copy" | "cut",
	writeText?: (t: string) => void,
) => {
	const s = ed.getSelection();
	const m = ed.getModel();
	if (!(s && m)) {
		return;
	}
	const text = s.isEmpty()
		? `${m.getLineContent(s.startLineNumber)}\n`
		: m.getValueInRange(s);
	if (text) {
		writeText?.(text);
		if (type === "cut" && !ed.getOption(editor.EditorOption.readOnly)) {
			ed.executeEdits("cut", [
				{
					range: s.isEmpty()
						? new Selection(
								s.startLineNumber,
								1,
								s.startLineNumber + 1,
								1,
							)
						: s,
					text: "",
				},
			]);
		}
	}
};

const setupActions = (ed: editor.IStandaloneCodeEditor, p: CodePaneProps) => {
	if (p.writeClipboardText) {
		ed.addAction({
			id: "custom-copy",
			label: "Copy",
			keybindings: [KeyMod.CtrlCmd | KeyCode.KeyC],
			contextMenuGroupId: "9_cutcopypaste",
			contextMenuOrder: 2,
			run: (e) => handleClipboardAction(e, "copy", p.writeClipboardText),
		});
		ed.addAction({
			id: "custom-cut",
			label: "Cut",
			keybindings: [KeyMod.CtrlCmd | KeyCode.KeyX],
			contextMenuGroupId: "9_cutcopypaste",
			contextMenuOrder: 1,
			precondition: "!editorReadonly",
			run: (e) => handleClipboardAction(e, "cut", p.writeClipboardText),
		});
	}
	if (p.requestClipboardText) {
		ed.addAction({
			id: "custom-paste",
			label: "Paste",
			keybindings: [KeyMod.CtrlCmd | KeyCode.KeyV],
			contextMenuGroupId: "9_cutcopypaste",
			contextMenuOrder: 3,
			run: (e) =>
				p
					.requestClipboardText?.()
					.then((t) => e.trigger("keyboard", "paste", { text: t })),
		});
	}
	if (p.index === 2) {
		ed.addAction({
			id: "prev-diff",
			label: "Prev Diff",
			keybindings: [KeyMod.Alt | KeyCode.UpArrow],
			run: () => p.onPrevDiff?.(),
		});
		ed.addAction({
			id: "next-diff",
			label: "Next Diff",
			keybindings: [KeyMod.Alt | KeyCode.DownArrow],
			run: () => p.onNextDiff?.(),
		});
		ed.addAction({
			id: "prev-conflict",
			label: "Prev Conflict",
			keybindings: [KeyMod.CtrlCmd | KeyCode.KeyJ],
			run: () => p.onPrevConflict?.(),
		});
		ed.addAction({
			id: "next-conflict",
			label: "Next Conflict",
			keybindings: [KeyMod.CtrlCmd | KeyCode.KeyK],
			run: () => p.onNextConflict?.(),
		});
		if (p.autoFocusConflict) {
			setTimeout(() => p.onNextConflict?.(), 500);
		}
	}
};

const getHighlightOptions = (h: Highlight) => ({
	isWholeLine: h.isWholeLine,
	className: h.isWholeLine ? `diff-${h.tag}` : null,
	inlineClassName: h.isWholeLine ? null : `diff-${h.tag}-inline`,
	linesDecorationsClassName: h.isWholeLine ? `diff-${h.tag}-margin` : null,
	marginClassName: h.isWholeLine ? `diff-${h.tag}-margin` : null,
});

export const CodePane: FC<CodePaneProps> = (p) => {
	const [ed, setEd] = useState<editor.IStandaloneCodeEditor | null>(null);
	const [lastSyncId, setLastSyncId] = useState(p.externalSyncId);
	const isApplyingSync = useRef(false);
	const [isFlashing, setIsFlashing] = useState(false);
	const decRef = useRef<string[]>([]);
	useEffect(() => {
		if (ed && p.highlights) {
			const nd = p.highlights
				.filter((h) => h.startLine <= h.endLine)
				.map((h) => ({
					range: {
						startLineNumber: h.startLine,
						startColumn: h.startColumn,
						endLineNumber: h.endLine,
						endColumn: h.endColumn,
					},
					options: getHighlightOptions(h),
				}));
			decRef.current = ed.deltaDecorations(decRef.current, nd);
		}
	}, [ed, p.highlights]);
	useEffect(() => {
		if (
			ed &&
			p.file.content != null &&
			p.externalSyncId !== undefined &&
			p.externalSyncId !== lastSyncId &&
			p.file.content !== ed.getValue()
		) {
			setLastSyncId(p.externalSyncId);
			const m = ed.getModel();
			if (m) {
				isApplyingSync.current = true;
				try {
					const e = computeMinimalEdits(m, p.file.content);
					if (e.length > 0) {
						m.pushEditOperations(
							ed.getSelections() || [],
							e,
							() => ed.getSelections() || [],
						);
					}
				} finally {
					isApplyingSync.current = false;
				}
			}
		}
	}, [ed, p.file.content, p.externalSyncId, lastSyncId]);
	const onSubmit = () => {
		if (!(ed && p.onCompleteMerge)) {
			return;
		}
		const lines = ed.getValue().split(NEWLINE_REGEX);
		const markers = ["<<<<<<<", "=======", ">>>>>>>", "|||||||"];
		const idx = lines.findIndex(
			(l) => markers.some((m) => l.startsWith(m)) || l.startsWith("(??)"),
		);
		if (idx !== -1) {
			setIsFlashing(true);
			setTimeout(() => setIsFlashing(false), 1000);
			ed.revealLineInCenter(idx + 1);
			ed.setPosition({ lineNumber: idx + 1, column: 1 });
			ed.focus();
		}
		p.onCompleteMerge();
	};
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				minWidth: 0,
				minHeight: 0,
				...p.style,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: "#2d2d2d",
					color: "#cccccc",
					padding: "0 8px",
					height: "35px",
					boxSizing: "border-box",
					fontFamily: "sans-serif",
					fontSize: "12px",
					borderBottom: "1px solid #444",
					minWidth: 0,
				}}
			>
				<HeaderStyles />
				<ToggleBaseBtn
					side="left"
					isBaseActive={p.isBaseActive ?? false}
					onToggleBase={p.onToggleBase}
					baseSide={p.baseSide}
				/>
				<span style={{ flexShrink: 0 }}>{p.file.label}</span>
				{p.file.commit && (
					<CommitInfo
						commit={p.file.commit}
						onCopyHash={p.onCopyHash}
						onShowDiff={p.onShowDiff}
					/>
				)}
				<div style={{ flex: 1 }} />
				<HeaderNav
					isMiddle={p.index === 2}
					onPrevDiff={p.onPrevDiff}
					onNextDiff={p.onNextDiff}
					onPrevConflict={p.onPrevConflict}
					onNextConflict={p.onNextConflict}
				/>
				<div style={{ flex: 1 }} />
				<ToggleBaseBtn
					side="right"
					isBaseActive={p.isBaseActive ?? false}
					onToggleBase={p.onToggleBase}
					baseSide={p.baseSide}
				/>
			</div>
			<div style={{ flex: 1, position: "relative", minHeight: 0 }}>
				<Editor
					language={p.syntaxHighlighting ? "typescript" : "plaintext"}
					defaultValue={p.file.content || ""}
					theme="vs-dark"
					options={useMemo(
						() => ({
							minimap: { enabled: false },
							readOnly: !p.isMiddle,
							scrollBeyondLastLine: false,
							wordWrap: "off",
							renderWhitespace: "all",
							renderLineHighlight: "all",
						}),
						[p.isMiddle],
					)}
					onMount={(e) => {
						setEd(e);
						p.onMount(e, p.index);
						setupActions(e, p);
					}}
					onChange={(v) => {
						if (!isApplyingSync.current) {
							p.onChange(v, p.index);
						}
					}}
				/>
			</div>
			{p.isMiddle && (
				<div
					style={{
						backgroundColor: "#252526",
						padding: "8px 12px",
						borderTop: "1px solid #444",
						display: "flex",
						justifyContent: "flex-start",
						alignItems: "center",
						fontFamily: "sans-serif",
						fontSize: "13px",
					}}
				>
					<button
						type="button"
						className={isFlashing ? "button-flash" : ""}
						onClick={onSubmit}
						style={{
							backgroundColor: "#2ea043",
							color: "white",
							border: "none",
							padding: "6px 12px",
							borderRadius: "4px",
							cursor: "pointer",
							fontWeight: 600,
						}}
					>
						Save & Complete Merge
					</button>
				</div>
			)}
		</div>
	);
};
