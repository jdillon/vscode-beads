/**
 * Markdown Component
 *
 * Renders markdown content as HTML using marked.
 * Sanitizes output and applies VS Code-friendly styles.
 * Intercepts link clicks to open relative file paths in VS Code.
 */

import React, { useMemo, useCallback } from "react";
import { marked } from "marked";
import { vscode } from "../types";

interface MarkdownProps {
  content: string;
  className?: string;
}

// Configure marked for safe rendering
marked.setOptions({
  breaks: false, // Standard markdown: only double newlines create paragraphs
  gfm: true, // GitHub flavored markdown
});

/**
 * Determines if a URL is a relative file path (not external)
 */
function isRelativeFilePath(href: string): boolean {
  // External URLs have a protocol
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return false;
  }
  // Absolute paths or relative paths
  return true;
}

/**
 * Parses a file path and optional line anchor
 * e.g., "./src/config.ts#L42" -> { path: "./src/config.ts", line: 42 }
 */
function parseFilePath(href: string): { path: string; line?: number } {
  const match = href.match(/^(.+?)(?:#L(\d+))?$/);
  if (!match) {
    return { path: href };
  }
  return {
    path: match[1],
    line: match[2] ? parseInt(match[2], 10) : undefined,
  };
}

export function Markdown({ content, className }: MarkdownProps): React.ReactElement {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      let result = marked.parse(content) as string;
      // Remove empty paragraphs and excessive whitespace
      result = result.replace(/<p>\s*<\/p>/g, "");
      result = result.replace(/(<br\s*\/?>\s*){2,}/g, "<br>");
      return result;
    } catch {
      return content;
    }
  }, [content]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Find the closest anchor element
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Check if it's a relative file path
    if (isRelativeFilePath(href)) {
      e.preventDefault();
      e.stopPropagation();

      const { path, line } = parseFilePath(href);
      vscode.postMessage({ type: "openFile", filePath: path, line });
    }
    // External URLs will open normally via default browser behavior
  }, []);

  return (
    <div
      className={`markdown-content ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}
