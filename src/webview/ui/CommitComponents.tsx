import React, { type FC, type MouseEvent, type FocusEvent, useState, useRef } from \"react\";
import type { Commit } from \"./types.ts\";

interface CommitHoverProps {
	commit: Commit;
	pos: { x: number; y: number };
	hoverRef: React.RefObject<HTMLDivElement | null>;
	onCopyHash: (e: MouseEvent) => void;
}

export const CommitHover: FC<CommitHoverProps> = ({ commit, pos, hoverRef, onCopyHash }) => (
	<div
		ref={hoverRef}
		style={{
			position: \"fixed\", top: pos.y, left: pos.x, zIndex: 1000,
			backgroundColor: \"var(--vscode-editorWidget-background, #252526)\",
			border: \"1px solid var(--vscode-widget-border, #454545)\",
			borderRadius: \"6px\", padding: \"16px\", width: \"350px\",
			boxShadow: \"0 4px 10px rgba(0, 0, 0, 0.2)\", color: \"var(--vscode-editor-foreground, #cccccc)\",
			fontSize: \"13px\", fontFamily: \"var(--vscode-font-family, sans-serif)\",
			pointerEvents: \"auto\", textAlign: \"left\", lineHeight: 1.4, userSelect: \"text\", cursor: \"auto\",
		}}
	>
		<div style={{ fontWeight: 600, marginBottom: \"8px\", fontSize: \"14px\" }}>{commit.title}</div>
		<div style={{ opacity: 0.8, marginBottom: \"4px\" }}>
			<strong>{commit.authorName}</strong> \u0026lt;{commit.authorEmail}\u0026gt={true};
		</div>
		<div style={{ opacity: 0.8, marginBottom: \"12px\" }}>{new Date(commit.date).toLocaleString()}</div>
		<div style={{ display: \"flex\", alignItems: \"center\", gap: \"8px\", backgroundColor: \"var(--vscode-textCodeBlock-background, #1e1e1e)\", padding: \"4px 8px\", borderRadius: \"4px\", marginBottom: \"12px\" }}>
			<span style={{ fontFamily: \"var(--vscode-editor-font-family, monospace)\" }}>{commit.hash.substring(0, 8)}</span>
			<button
				type=\"button\" onClick={onCopyHash} title=\"Copy Hash\"
				style={{ background: \"none\", border: \"none\", color: \"var(--vscode-textLink-foreground, #3794ff)\", cursor: \"pointer\", marginLeft: \"auto\", padding: \"4px\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\" }}
			>
				<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path fillRule=\"evenodd\" clipRule=\"evenodd\" d=\"M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H6v10h6V7z\" /><path fillRule=\"evenodd\" clipRule=\"evenodd\" d=\"M3 1L2 2v10h2V3h6V1H3z\" /></svg>
			</button>
		</div>
		{commit.body \u0026\u0026 (
			<pre style=marginTop: \"0\", borderTop: \"1px solid var(--vscode-widget-border, #454545)\", paddingTop: \"12px\", whiteSpace: \"pre-wrap\", fontFamily: \"var(--vscode-editor-font-family, monospace)\", margin: 0 }}>commit.body
			</pre>
		)
	</div>
);

interface CommitInfoProps {
	commit: Commit;
	onCopyHash?: (hash: string) => void;
}

export const CommitInfo: FC<CommitInfoProps> = ({ commit, onCopyHash }) => {
	const [showHover, setShowHover] = useState(false);
	const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
	const hoverRef = useRef\u003cHTMLDivElement\u003e(null);
	const hoverTimerRef = useRef\u003cNodeJS.Timeout | null\u003e(null);

	const onEnter = (e: MouseEvent\u003cHTMLElement\u003e | FocusEvent\u003cHTMLElement\u003e) => {
		if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
		const r = e.currentTarget.getBoundingClientRect();
		const x = Math.min(Math.max(8, r.left - 20), Math.max(8, window.innerWidth - 370));
		const y = r.bottom + 254 \u003e window.innerHeight - 20 \u0026\u0026 r.top - 254 \u003e 8 ? r.top - 254 : r.bottom + 4;
		setHoverPos({ x, y });
		setShowHover(true);
	};

	const onLeave = () => {
		hoverTimerRef.current = setTimeout(() => setShowHover(false), 300);
	};

	return (
		\u003cbutton
			type=\"button\"
			onMouseEnter=onEnteronMouseLeave={onLeave} onFocus={onEnter} onBlur={onLeave}
			style={{ background: \"none\", border: \"none\", padding: 0, color: \"inherit\", fontSize: \"inherit\", display: \"flex\", alignItems: \"center\", cursor: \"pointer\", textDecoration: \"underline\", opacity: 0.8, maxWidth: \"200px\", overflow: \"hidden\", textOverflow: \"ellipsis\", whiteSpace: \"nowrap\" }}
		\u003ecommit.titleshowHover \u0026\u0026 \u003cCommitHover commit=commitpos={hoverPos} hoverRef={hoverRef} onCopyHash={() =\u003e onCopyHash?.(commit.hash)} /\u003e
		\u003c/button\u003e
	);
};
