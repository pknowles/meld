import type { FC, PropsWithChildren } from "react";
import { DIFF_WIDTH } from "./types.ts";

export const MeldRoot: FC<PropsWithChildren> = ({ children }) => (
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
		{children}
	</div>
);
