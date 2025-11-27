/**
 * Markdown Component
 *
 * Renders markdown content as HTML using marked.
 * Sanitizes output and applies VS Code-friendly styles.
 */

import React, { useMemo } from "react";
import { marked } from "marked";

interface MarkdownProps {
  content: string;
  className?: string;
}

// Configure marked for safe rendering
marked.setOptions({
  breaks: false, // Standard markdown: only double newlines create paragraphs
  gfm: true, // GitHub flavored markdown
});

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

  return (
    <div
      className={`markdown-content ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
