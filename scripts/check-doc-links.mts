/**
 * Documentation link check (CI: root-tooling job; locally `npm run check:doc-links`).
 *
 * Fails when a markdown file in `docs/**`, `CONTRIBUTING.md` or `README.md`
 * has a relative link whose file does not exist, or a `#anchor` that is not a
 * heading (or explicit `id`) in the file it points at. External URLs are not
 * fetched: a check that goes to the network fails for reasons that are not
 * about the docs. It also checks that every page `docs/nav.json` lists exists.
 *
 * Anchors are computed by the same code the in-app docs use
 * (`frontend/vue/src/docs/markdown/headingAnchors.ts`: markdown-it plus the
 * GitHub-compatible slugger), so a link that passes here lands on the heading
 * in the app. Matching is case-sensitive, as the app's lookup is.
 *
 * Runs on Node's built-in TypeScript support (no build step), hence the
 * explicit `.ts` extension on the import and no TypeScript-only syntax that
 * needs transforming.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectHeadingAnchors } from '../frontend/vue/src/docs/markdown/headingAnchors.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** One problem found, reported as `file:line: message`. */
interface LinkProblem {
    file: string;
    line: number;
    message: string;
}

/** A link found in a document, with where it was written. */
interface FoundLink {
    target: string;
    line: number;
}

const EXTERNAL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** Every markdown file the check covers, as repo-relative slash paths. */
function collectMarkdownFiles(): string[] {
    const files: string[] = ['README.md', 'CONTRIBUTING.md'];
    function walk(folder: string): void {
        for (const entry of readdirSync(join(repositoryRoot, folder), { withFileTypes: true })) {
            const entryPath = `${folder}/${entry.name}`;
            if (entry.isDirectory()) walk(entryPath);
            else if (entry.name.endsWith('.md')) files.push(entryPath);
        }
    }
    walk('docs');
    return files.filter((file) => existsSync(join(repositoryRoot, file)));
}

/**
 * Blanks out fenced code blocks and inline code so example links and `#`
 * lines inside them are not mistaken for real ones. Line numbers are kept.
 */
function maskCode(markdown: string): string[] {
    const lines = markdown.split('\n');
    let fence: string | null = null;
    return lines.map((line) => {
        const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
        if (fence !== null) {
            if (
                fenceMatch &&
                fenceMatch[1].startsWith(fence[0]) &&
                fenceMatch[1].length >= fence.length
            ) {
                fence = null;
            }
            return '';
        }
        if (fenceMatch) {
            fence = fenceMatch[1];
            return '';
        }
        return line.replace(/`+[^`]*`+/g, (code) => ' '.repeat(code.length));
    });
}

/**
 * The anchors a document offers: its heading ids, computed by the same code the
 * app uses (so they cannot diverge from it), plus explicit `id`/`name`
 * attributes written in raw HTML.
 */
function collectAnchors(rawMarkdown: string): Set<string> {
    const anchors = new Set(collectHeadingAnchors(rawMarkdown).map((heading) => heading.id));
    for (const match of maskFencedBlocks(rawMarkdown).matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) {
        anchors.add(match[1]);
    }
    return anchors;
}

/** Removes fenced code blocks, keeping everything else (and line numbers). */
function maskFencedBlocks(markdown: string): string {
    let fence: string | null = null;
    return markdown
        .split('\n')
        .map((line) => {
            const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
            if (fence !== null) {
                if (
                    fenceMatch &&
                    fenceMatch[1].startsWith(fence[0]) &&
                    fenceMatch[1].length >= fence.length
                ) {
                    fence = null;
                }
                return '';
            }
            if (fenceMatch) {
                fence = fenceMatch[1];
                return '';
            }
            return line;
        })
        .join('\n');
}

/** Inline links and images, and reference definitions, outside code. */
function collectLinks(rawMarkdown: string): FoundLink[] {
    const links: FoundLink[] = [];
    maskCode(rawMarkdown).forEach((line, index) => {
        for (const match of line.matchAll(
            /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g,
        )) {
            links.push({ target: match[1], line: index + 1 });
        }
        const definition = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/.exec(line);
        if (definition) links.push({ target: definition[1], line: index + 1 });
        for (const match of line.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)=["']([^"']+)["']/gi)) {
            links.push({ target: match[1], line: index + 1 });
        }
    });
    return links;
}

function decodeFragment(fragment: string): string {
    try {
        return decodeURIComponent(fragment);
    } catch {
        return fragment;
    }
}

/** True when `path` is a file or folder inside the repository. */
function existsInRepository(repoRelativePath: string): boolean {
    const absolute = resolve(repositoryRoot, repoRelativePath);
    if (absolute !== repositoryRoot && !absolute.startsWith(repositoryRoot + sep)) return false;
    return existsSync(absolute);
}

function main(): number {
    const markdownFiles = collectMarkdownFiles();
    const anchorCache = new Map<string, Set<string>>();
    function anchorsOf(repoRelativeFile: string): Set<string> {
        let anchors = anchorCache.get(repoRelativeFile);
        if (!anchors) {
            anchors = collectAnchors(readFileSync(join(repositoryRoot, repoRelativeFile), 'utf8'));
            anchorCache.set(repoRelativeFile, anchors);
        }
        return anchors;
    }

    const problems: LinkProblem[] = [];
    let linkCount = 0;

    for (const file of markdownFiles) {
        const source = readFileSync(join(repositoryRoot, file), 'utf8');
        for (const { target, line } of collectLinks(source)) {
            if (EXTERNAL_SCHEME_PATTERN.test(target) || target.startsWith('//')) continue;
            linkCount += 1;
            const hashStart = target.indexOf('#');
            const pathPart = decodeURI(hashStart === -1 ? target : target.slice(0, hashStart));
            const fragment = hashStart === -1 ? '' : decodeFragment(target.slice(hashStart + 1));

            const targetFile =
                pathPart === ''
                    ? file
                    : relative(
                          repositoryRoot,
                          pathPart.startsWith('/')
                              ? join(repositoryRoot, pathPart)
                              : resolve(repositoryRoot, dirname(file), pathPart),
                      )
                          .split(sep)
                          .join('/');

            if (!existsInRepository(targetFile)) {
                problems.push({
                    file,
                    line,
                    message: `broken link: ${target} (no such file ${targetFile})`,
                });
                continue;
            }
            if (fragment === '') continue;
            const isMarkdown =
                targetFile.endsWith('.md') && statSync(join(repositoryRoot, targetFile)).isFile();
            // Anchors into non-markdown files (line anchors on source files) cannot be checked here.
            if (!isMarkdown) continue;
            if (!anchorsOf(targetFile).has(fragment)) {
                problems.push({
                    file,
                    line,
                    message: `broken anchor: ${target} (no heading "#${fragment}" in ${targetFile})`,
                });
            }
        }
    }

    // The in-app docs only show what docs/nav.json lists, so a typo there is a dead page.
    const navigationPath = join(repositoryRoot, 'docs/nav.json');
    if (existsSync(navigationPath)) {
        const navigation: unknown = JSON.parse(readFileSync(navigationPath, 'utf8'));
        const listedFiles: string[] = [];
        const visit = (entry: unknown): void => {
            if (typeof entry !== 'object' || entry === null) return;
            const record = entry as Record<string, unknown>;
            if (typeof record.path === 'string') {
                listedFiles.push(
                    typeof record.file === 'string' ? record.file : `docs/${record.path}.md`,
                );
            }
            for (const child of [record.groups, record.pages]) {
                if (Array.isArray(child)) child.forEach(visit);
            }
        };
        visit(navigation);
        for (const listedFile of listedFiles) {
            if (!existsInRepository(listedFile)) {
                problems.push({
                    file: 'docs/nav.json',
                    line: 1,
                    message: `lists ${listedFile}, which does not exist`,
                });
            }
        }
    }

    if (problems.length > 0) {
        for (const problem of problems)
            console.error(`${problem.file}:${problem.line}: ${problem.message}`);
        console.error(`\n${problems.length} documentation link problem(s) found.`);
        return 1;
    }
    console.log(
        `Documentation links OK: ${linkCount} relative links checked across ${markdownFiles.length} files.`,
    );
    return 0;
}

process.exit(main());
