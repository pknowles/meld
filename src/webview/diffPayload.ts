// Copyright (C) 2002-2006 Stephen Kennedy <stevek@gnome.org>
// Copyright (C) 2009-2019 Kai Willadsen <kai.willadsen@gmail.com>
// Copyright (C) 2026 Pyarelal Knowles
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 2 of the License, or (at
// your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import * as cp from "node:child_process";
import { getGitExecutable } from "../gitPath";
import { Differ } from "../matchers/diffutil";
import { Merger } from "../matchers/merge";

const getGitState = async (
	repoPath: string,
	relativeFilePath: string,
	stage: number,
): Promise<string> => {
	const gitCmd = await getGitExecutable();
	return new Promise<string>((resolve) => {
		cp.execFile(
			gitCmd,
			["show", `:${stage}:${relativeFilePath}`],
			{ cwd: repoPath },
			(err, stdout) => {
				if (err) {
					resolve("");
				} else {
					resolve(stdout);
				}
			},
		);
	});
};

const getCommitInfo = async (
	repoPath: string,
	ref: string,
): Promise<
	| {
			hash: string;
			title: string;
			authorName: string;
			authorEmail: string;
			date: string;
			body: string;
	  }
	| undefined
> => {
	const gitCmd = await getGitExecutable();
	return new Promise((resolve) => {
		cp.execFile(
			gitCmd,
			["log", "-1", "--format=%H%x00%s%x00%an%x00%ae%x00%aI%x00%b", ref],
			{ cwd: repoPath },
			(err, stdout) => {
				if (err) {
					resolve(undefined);
				} else {
					const parts = stdout.trim().split("\0");
					if (parts.length < 5) resolve(undefined);
					else
						resolve({
							hash: parts[0],
							title: parts[1],
							authorName: parts[2],
							authorEmail: parts[3],
							date: parts[4],
							body: parts.slice(5).join("\0"),
						});
				}
			},
		);
	});
};

const getRemoteRef = async (repoPath: string): Promise<string | undefined> => {
	const refs = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD"];
	for (const ref of refs) {
		const commit = await getCommitInfo(repoPath, ref);
		if (commit) return ref;
	}
	return undefined;
};

const getBaseCommitInfo = async (repoPath: string) => {
	const remoteRef = await getRemoteRef(repoPath);
	if (!remoteRef) return undefined;

	const gitCmd = await getGitExecutable();
	const mergeBaseHash = await new Promise<string>((resolve) => {
		cp.execFile(
			gitCmd,
			["merge-base", "HEAD", remoteRef],
			{ cwd: repoPath },
			(err, stdout) => {
				if (err) resolve("");
				else resolve(stdout.trim());
			},
		);
	});

	if (mergeBaseHash) {
		return await getCommitInfo(repoPath, mergeBaseHash);
	}
	return undefined;
};

const splitLines = (text: string) => {
	const lines = text.split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
};

export async function buildDiffPayload(
	repoPath: string,
	relativeFilePath: string,
) {
	const [base, local, incoming] = await Promise.all([
		getGitState(repoPath, relativeFilePath, 1),
		getGitState(repoPath, relativeFilePath, 2),
		getGitState(repoPath, relativeFilePath, 3),
	]);

	const localCommit = await getCommitInfo(repoPath, "HEAD");
	const remoteRef = await getRemoteRef(repoPath);
	const incomingCommit = remoteRef
		? await getCommitInfo(repoPath, remoteRef)
		: undefined;

	const localLines = splitLines(local);
	const baseLines = splitLines(base);
	const incomingLines = splitLines(incoming);

	// Step 1: Run the Merger to produce merged text with (??) conflict markers
	// This matches Meld's _merge_files() in filediff.py
	const merger = new Merger();
	const sequences = [localLines, baseLines, incomingLines];
	const initGen = merger.initialize(sequences, sequences);
	let val = initGen.next();
	while (!val.done) {
		val = initGen.next();
	}

	const mergeGen = merger.merge_3_files(true);
	let mergedContent = base; // fallback to base if merge fails
	for (const res of mergeGen) {
		if (res !== null && typeof res === "string") {
			mergedContent = res;
		}
	}

	const mergedLines = splitLines(mergedContent);

	// Step 2: Initialize the Differ with [Local, Merged, Incoming]
	// This matches Meld's _diff_files() in filediff.py, which runs AFTER
	// _merge_files() has placed the merged text in the middle buffer.
	// set_sequences_iter computes diffs as matcher(sequences[1], sequences[i*2])
	// so the Differ diffs Merged(a) vs Local(b) and Merged(a) vs Incoming(b).
	// The three-way _auto_merge logic naturally produces 'conflict' tags.
	const differ = new Differ();
	const diffSequences = [localLines, mergedLines, incomingLines];
	const diffInit = differ.set_sequences_iter(diffSequences);
	let step = diffInit.next();
	while (!step.done) {
		step = diffInit.next();
	}

	const contents = [
		{ label: "Local", content: local, commit: localCommit },
		{ label: "Merged", content: mergedContent },
		{ label: "Remote", content: incoming, commit: incomingCommit },
	];

	// Extract from _merge_cache, not differ.diffs.
	// differ.diffs is raw Myers output (replace/insert/delete/equal only).
	// conflict tags only exist in _merge_cache, produced by _merge_diffs/_auto_merge.
	// This matches what Meld's pair_changes() method yields for rendering.
	// _merge_cache[i] = [chunk_for_diffs0 | null, chunk_for_diffs1 | null]
	// These chunks have a=Merged(pane1), b=Outer(Local or Incoming).
	const leftDiffs = differ._merge_cache
		.map((pair) => pair[0])
		.filter((c): c is NonNullable<typeof c> => c !== null);
	const rightDiffs = differ._merge_cache
		.map((pair) => pair[1])
		.filter((c): c is NonNullable<typeof c> => c !== null);

	return {
		command: "loadDiff",
		data: {
			files: contents,
			diffs: [leftDiffs, rightDiffs],
		},
	};
}

import { MyersSequenceMatcher } from "../matchers/myers";

export async function buildBaseDiffPayload(
	repoPath: string,
	relativeFilePath: string,
	side: "left" | "right",
) {
	// Base is stage 1, Local is 2, Remote is 3
	const targetStage = side === "left" ? 2 : 3;
	const [base, target] = await Promise.all([
		getGitState(repoPath, relativeFilePath, 1),
		getGitState(repoPath, relativeFilePath, targetStage),
	]);

	const baseCommit = await getBaseCommitInfo(repoPath);

	const baseLines = splitLines(base);
	const targetLines = splitLines(target);

	// We only need a 2-way diff for this.
	// For left side (Base -> Local), a=Base, b=Local
	// For right side (Remote <- Base), a=Remote, b=Base
	const seqA = side === "left" ? baseLines : targetLines;
	const seqB = side === "left" ? targetLines : baseLines;

	const matcher = new MyersSequenceMatcher(null, seqA, seqB);
	const work = matcher.initialise();
	while (!work.next().done) {}

	const diffs = matcher.get_difference_opcodes();

	return {
		command: "loadBaseDiff",
		data: {
			side,
			file: {
				label: "Base",
				content: base,
				commit: baseCommit,
			},
			diffs,
		},
	};
}
