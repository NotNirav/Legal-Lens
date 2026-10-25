import React from 'react';

/**
 * Parses inline formatting (bold, italic, code, citation tags) safely
 * without dangerouslySetInnerHTML.
 */
function parseInline(text, tagSet = null, onTagClick = null) {
  if (!text) return null;

  // Regex matching **bold**, *italic*, `code`, and [C1]/[L1]/[S1]/[Q1]/[W1]/[D1] citation tags
  const tokens = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[(?:[cClLsSqQwWdD]\d+)\])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(<code key={match.index} className="inline-code">{token.slice(1, -1)}</code>);
    } else if (/^\[[cClLsSqQwWdD]\d+\]$/.test(token)) {
      const tagUpper = token.toUpperCase();
      const prefix = tagUpper.charAt(1);
      const tagClass = 
        prefix === 'C' ? 'tag-const' :
        prefix === 'L' ? 'tag-central' :
        prefix === 'S' ? 'tag-state' :
        prefix === 'Q' ? 'tag-qa' :
        prefix === 'W' ? 'tag-web' : 'tag-doc';

      // Check if tag has matching source in available tags
      const hasMatch = tagSet ? tagSet.has(tagUpper) : true;
      if (hasMatch) {
        tokens.push(
          <button
            key={match.index}
            type="button"
            className={`citation-tag-pill citation-tag-clickable ${tagClass}`}
            onClick={(e) => {
              e.preventDefault();
              if (onTagClick) onTagClick(tagUpper);
            }}
            title={`Jump to legal authority ${tagUpper}`}
          >
            {tagUpper}
          </button>
        );
      } else {
        // Tag with no matching source renders as plain text
        tokens.push(token);
      }
    } else {
      tokens.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.substring(lastIndex));
  }

  return tokens;
}

function tagSetFrom(tags) {
  if (!tags) return null;
  if (tags instanceof Set) return tags;
  if (Array.isArray(tags)) return new Set(tags.map((t) => String(t).toUpperCase()));
  return null;
}

/**
 * Safe, zero-dependency Markdown renderer for streamed legal guidance.
 * Converts headings, bullet lists, numbered lists, and paragraphs into pure React nodes.
 */
export default function SafeMarkdown({ content = '', availableTags = null, onTagClick = null }) {
  if (!content) return null;

  const tagSet = tagSetFrom(availableTags);

  const lines = content.split('\n');
  const elements = [];
  let currentList = null; // { type: 'ul' | 'ol', items: [] }

  const flushList = (keyPrefix) => {
    if (!currentList) return;
    const ListTag = currentList.type;
    elements.push(
      <ListTag key={`${keyPrefix}-list-${elements.length}`} className="markdown-list">
        {currentList.items.map((item, idx) => (
          <li key={idx} className="markdown-list-item">{parseInline(item, tagSet, onTagClick)}</li>
        ))}
      </ListTag>
    );
    currentList = null;
  };

  let isFirstParagraph = true;

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    // Empty line separates blocks
    if (!trimmed) {
      flushList(lineIdx);
      return;
    }

    // Headings: ###, ##, #
    if (trimmed.startsWith('### ')) {
      flushList(lineIdx);
      elements.push(<h4 key={`h4-${lineIdx}`} className="markdown-h4">{parseInline(trimmed.slice(4), tagSet, onTagClick)}</h4>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList(lineIdx);
      elements.push(<h3 key={`h3-${lineIdx}`} className="markdown-h3">{parseInline(trimmed.slice(3), tagSet, onTagClick)}</h3>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList(lineIdx);
      elements.push(<h2 key={`h2-${lineIdx}`} className="markdown-h2">{parseInline(trimmed.slice(2), tagSet, onTagClick)}</h2>);
      return;
    }

    // Unordered list item: - or *
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList(lineIdx);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(ulMatch[1]);
      return;
    }

    // Ordered list item: 1. 2. etc
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList(lineIdx);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(olMatch[1]);
      return;
    }

    // Regular paragraph (first paragraph becomes tinted callout)
    flushList(lineIdx);
    if (isFirstParagraph) {
      isFirstParagraph = false;
      elements.push(
        <div key={`callout-${lineIdx}`} className="markdown-paragraph markdown-first-callout" role="note" aria-label="Summary Answer">
          {parseInline(trimmed, tagSet, onTagClick)}
        </div>
      );
    } else {
      elements.push(
        <p key={`p-${lineIdx}`} className="markdown-paragraph">
          {parseInline(trimmed, tagSet, onTagClick)}
        </p>
      );
    }
  });

  flushList('final');

  return <div className="safe-markdown-container">{elements}</div>;
}
