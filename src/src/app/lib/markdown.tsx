// Tiny markdown-to-JSX renderer for our CHANGELOG. Handles the subset of
// markdown CHANGELOG.md actually uses: # ## ### headings, - lists, ``` code
// blocks, `inline code`, **bold**, [links](url), paragraphs separated by
// blank lines, and `---` rules.
//
// Not a general-purpose markdown renderer — purpose-built for the changelog
// shape so we don't add a heavy dep.

import type { ReactNode } from "react";

interface Block {
  kind: "heading" | "paragraph" | "list" | "code" | "rule";
  level?: 1 | 2 | 3 | 4;
  lines: string[];
  language?: string;
}

export function renderMarkdown(input: string): ReactNode {
  const blocks = parseBlocks(input);
  return blocks.map((b, i) => renderBlock(b, i));
}

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code fence
    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", lines: codeLines, language });
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: "rule", lines: [] });
      i++;
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,4})\s+(.*)$/.exec(line);
    if (headingMatch?.[1]) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      blocks.push({ kind: "heading", level, lines: [headingMatch[2] ?? ""] });
      i++;
      continue;
    }

    // List (consecutive - or * lines)
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", lines: items });
      continue;
    }

    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect until blank line or block-level construct
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (
        next.trim() === "" ||
        next.startsWith("```") ||
        /^---+\s*$/.test(next) ||
        /^#{1,4}\s+/.test(next) ||
        /^[-*]\s+/.test(next)
      ) {
        break;
      }
      paraLines.push(next);
      i++;
    }
    blocks.push({ kind: "paragraph", lines: paraLines });
  }

  return blocks;
}

function renderBlock(b: Block, key: number): ReactNode {
  switch (b.kind) {
    case "heading": {
      const text = b.lines[0] ?? "";
      const Tag = (`h${b.level}` as "h1" | "h2" | "h3" | "h4");
      const sizes: Record<number, string> = {
        1: "text-3xl font-light text-zinc-100 mt-8 mb-3",
        2: "text-2xl font-medium text-zinc-100 mt-10 mb-3 border-b border-zinc-900 pb-2",
        3: "text-lg font-medium text-zinc-200 mt-6 mb-2",
        4: "text-base font-medium text-zinc-300 mt-4 mb-2",
      };
      return (
        <Tag key={key} className={sizes[b.level ?? 1]}>
          {renderInline(text)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="my-3 text-sm leading-relaxed text-zinc-300">
          {renderInline(b.lines.join(" "))}
        </p>
      );
    case "list":
      return (
        <ul key={key} className="my-3 ml-5 list-disc space-y-1 text-sm leading-relaxed text-zinc-300">
          {b.lines.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre
          key={key}
          className="my-4 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300"
        >
          <code>{b.lines.join("\n")}</code>
        </pre>
      );
    case "rule":
      return <hr key={key} className="my-8 border-zinc-900" />;
  }
}

// Inline markdown: `code`, **bold**, [text](url). Run as ordered passes.
function renderInline(text: string): ReactNode[] {
  // Tokenize: alternate plain / inline-code / bold / link / strikethrough.
  const tokens: Array<{ kind: "text" | "code" | "bold" | "link"; value: string; href?: string }> = [];
  let remaining = text;

  // Greedy single-pass over multiple patterns, ordered by likelihood.
  const pattern = /(`([^`\n]+)`)|(\*\*([^*\n]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/;
  while (remaining.length > 0) {
    const m = pattern.exec(remaining);
    if (!m) {
      tokens.push({ kind: "text", value: remaining });
      break;
    }
    if (m.index > 0) {
      tokens.push({ kind: "text", value: remaining.slice(0, m.index) });
    }
    if (m[1] !== undefined) {
      tokens.push({ kind: "code", value: m[2] ?? "" });
    } else if (m[3] !== undefined) {
      tokens.push({ kind: "bold", value: m[4] ?? "" });
    } else if (m[5] !== undefined) {
      tokens.push({ kind: "link", value: m[6] ?? "", href: m[7] ?? "" });
    }
    remaining = remaining.slice(m.index + m[0].length);
  }

  return tokens.map((tok, i) => {
    switch (tok.kind) {
      case "text":
        return <span key={i}>{tok.value}</span>;
      case "code":
        return (
          <code key={i} className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs text-zinc-200">
            {tok.value}
          </code>
        );
      case "bold":
        return (
          <strong key={i} className="font-semibold text-zinc-100">
            {tok.value}
          </strong>
        );
      case "link":
        return (
          <a key={i} href={tok.href} className="text-emerald-400 underline hover:text-emerald-300">
            {tok.value}
          </a>
        );
    }
  });
}
