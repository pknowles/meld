import type { FC } from \"react\";
import type { Commit } from \"./types.ts\";
import { CommitInfo } from \"./CommitComponents.tsx\";

interface ToggleBaseBtnProps {
	isBaseActive: boolean;
	onToggleBase: (side: \"left\" | \"right\") => void;
	baseSide: \"left\" | \"right\";
	side: \"left\" | \"right\";
}

export const ToggleBaseBtn: FC<ToggleBaseBtnProps> = ({ isBaseActive, onToggleBase, baseSide, side }) => (
	<button
		type=\"button\"
		onClick={() => onToggleBase(baseSide)}
		style={{
			padding: \"2px 8px\", fontSize: \"11px\", cursor: \"pointer\",
			backgroundColor: \"transparent\", color: isBaseActive ? \"#4daafc\" : \"#888\",
			border: \"1px solid\", borderColor: isBaseActive ? \"#4daafc80\" : \"#454545\",
			borderRadius: \"2px\", outline: \"none\",
			order: side === \"left\" ? -1 : 1, transition: \"all 0.2s\",
		}}
	>
		{isBaseActive ? `Close ${baseSide} Base` : `Open ${baseSide} Base`}
	</button>
);

interface HeaderNavProps {
	onPrev?: () => void;
	onNext?: () => void;
	label: string | number;
	count: number;
	labelPrefix?: string;
}

export const HeaderNav: FC<HeaderNavProps> = ({ onPrev, onNext, label, count, labelPrefix = \"\" }) => (
	<div style={{ display: \"flex\", alignItems: \"center\", gap: \"8px\", visibility: count \u003e 0 ? \"visible\" : \"hidden\" }}>
		<button type=\"button\" onClick={onPrev} style={{ padding: \"4px\", cursor: \"pointer\", backgroundColor: \"transparent\", border: \"none\", color: \"#888\", outline: \"none\" }}>
			\u2190
		</button>
		<span style={fontSize: \"11px\", minWidth: \"60px\", textAlign: \"center\" }}>labelPrefixlabel/ {count}
		</span>
		<button type=\"button\" onClick={onNext} style={{ padding: \"4px\", cursor: \"pointer\", backgroundColor: \"transparent\", border: \"none\", color: \"#888\", outline: \"none\" }}>
			\u2192
		</button>
	</div>
);

interface CodePaneHeaderProps {
	title: string;
	commit?: Commit;
	isBaseActive?: boolean;
	onToggleBase?: (side: \"left\" | \"right\") => void;
	baseSide?: \"left\" | \"right\";
	side: \"left\" | \"right\";
	onCopyHash: (hash: string) => void;
	onShowDiff: (idx: number) => void;
	diffCount: number;
	currentDiff: number;
	onPrevDiff?: () => void;
	onNextDiff?: () => void;
	conflictCount: number;
	currentConflict: number;
	onPrevConflict?: () => void;
	onNextConflict?: () => void;
}

export const CodePaneHeader: FC<CodePaneHeaderProps> = (p) => (
	<div
		style={{
			padding: \"4px 12px\", backgroundColor: \"#252526\", color: \"#cccccc\",
			borderBottom: \"1px solid #333333\", display: \"flex\", flexDirection: \"column\", gap: \"4px\",
			userSelect: \"none\", minHeight: \"52px\", justifyContent: \"center\",
		}}
	>
		<div style={{ display: \"flex\", justifyContent: \"space-between\", alignItems: \"center\" }}>
			<div style={{ fontWeight: \"bold\", fontSize: \"12px\", color: \"#ffffff\", overflow: \"hidden\", textOverflow: \"ellipsis\", whiteSpace: \"nowrap\" }}>
				{p.title}
			</div>
			{p.onToggleBase && p.baseSide && (
				<ToggleBaseBtn isBaseActive={!!p.isBaseActive} onToggleBase={p.onToggleBase} baseSide={p.baseSide} side={p.side} />
			)}
		</div>
		<div style={{ display: \"flex\", justifyContent: \"space-between\", alignItems: \"center\", flexWrap: \"wrap\", gap: \"8px\" }}>
			{p.commit ? (
				<CommitInfo commit={p.commit} onCopyHash={p.onCopyHash} />
			) : (
				<div style={{ flex: 1 }} />
			)}
			<div style={{ display: \"flex\", gap: \"16px\" }}>
				<HeaderNav onPrev={p.onPrevDiff} onNext={p.onNextDiff} label={p.currentDiff + 1} count={p.diffCount} labelPrefix=\"Diff \" />
				<HeaderNav onPrev={p.onPrevConflict} onNext={p.onNextConflict} label={p.currentConflict + 1} count={p.conflictCount} labelPrefix=\"Conflict \" />
			</div>
		</div>
	</div>
);
