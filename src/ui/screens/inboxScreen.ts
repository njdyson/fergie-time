/**
 * Inbox Screen — email-style message inbox with unread markers, archive, and delete.
 */

import type { InboxState, InboxMessage } from '../../season/inbox.ts';
import { getInboxMessages, getArchivedMessages } from '../../season/inbox.ts';

// Color palette
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const RED = '#f87171';

type FolderMode = 'inbox' | 'archive';

export class InboxScreen {
  private container: HTMLElement;
  private folder: FolderMode = 'inbox';
  private expandedMessageId: string | null = null;

  // Callbacks
  private markReadCallbacks: Array<(messageId: string) => void> = [];
  private archiveCallbacks: Array<(messageId: string) => void> = [];
  private deleteCallbacks: Array<(messageId: string) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.padding = '16px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.overflowY = 'auto';
    this.container.style.height = '100%';
  }

  onMarkRead(cb: (messageId: string) => void): void { this.markReadCallbacks.push(cb); }
  onArchive(cb: (messageId: string) => void): void { this.archiveCallbacks.push(cb); }
  onDelete(cb: (messageId: string) => void): void { this.deleteCallbacks.push(cb); }

  update(inbox: InboxState): void {
    this.render(inbox);
  }

  private render(inbox: InboxState): void {
    const messages = this.folder === 'inbox'
      ? getInboxMessages(inbox)
      : getArchivedMessages(inbox);

    let html = '<div style="max-width: 800px; margin: 0 auto;">';
    html += `<h2 style="color: ${TEXT_BRIGHT}; font-size: 22px; margin: 0 0 16px 0;">Inbox</h2>`;

    // Folder tabs
    html += `<div style="display: flex; gap: 8px; margin-bottom: 16px;">`;
    const inboxActive = this.folder === 'inbox';
    const archiveActive = this.folder === 'archive';
    const inboxCount = getInboxMessages(inbox).filter(m => !m.read).length;
    html += `<button data-folder="inbox" style="padding: 8px 20px; border-radius: 6px; border: 2px solid ${inboxActive ? ACCENT_BLUE : '#334155'}; background: ${inboxActive ? ACCENT_BLUE : '#0f172a'}; color: ${inboxActive ? '#000' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Inbox${inboxCount > 0 ? ` (${inboxCount})` : ''}</button>`;
    html += `<button data-folder="archive" style="padding: 8px 20px; border-radius: 6px; border: 2px solid ${archiveActive ? ACCENT_BLUE : '#334155'}; background: ${archiveActive ? ACCENT_BLUE : '#0f172a'}; color: ${archiveActive ? '#000' : TEXT_BRIGHT}; font: bold 12px/1 'Segoe UI',system-ui,sans-serif; cursor: pointer;">Archive</button>`;
    html += `</div>`;

    if (messages.length === 0) {
      html += `<div style="text-align: center; padding: 60px 0; color: ${TEXT};">`;
      html += this.folder === 'inbox' ? 'No messages.' : 'No archived messages.';
      html += `</div>`;
    } else {
      for (const msg of messages) {
        html += this.renderMessage(msg);
      }
    }

    html += '</div>';
    this.container.innerHTML = html;
    this.attachHandlers(inbox);
  }

  private renderMessage(msg: InboxMessage): string {
    const isExpanded = this.expandedMessageId === msg.id;
    const unreadDot = !msg.read
      ? `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${ACCENT_BLUE}; margin-right: 8px; flex-shrink: 0;"></span>`
      : `<span style="display: inline-block; width: 8px; height: 8px; margin-right: 8px; flex-shrink: 0;"></span>`;

    const fontWeight = msg.read ? 'normal' : 'bold';
    const subjectColor = msg.read ? TEXT : TEXT_BRIGHT;

    // Category badge
    const categoryColors: Record<string, string> = {
      transfer: ACCENT_ORANGE,
      scout: '#a78bfa',
      match: '#4ade80',
      general: ACCENT_BLUE,
    };
    const catColor = categoryColors[msg.category] ?? TEXT;
    const catBadge = `<span style="font-size: 9px; padding: 1px 6px; border-radius: 3px; background: ${catColor}20; color: ${catColor}; border: 1px solid ${catColor}40; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0;">${msg.category}</span>`;

    let html = `<div style="background: ${PANEL_BG}; border-radius: 6px; margin-bottom: 4px; border: 1px solid #334155;">`;

    // Header row (always visible)
    html += `<div data-msg-toggle="${msg.id}" style="display: flex; align-items: center; padding: 10px 12px; cursor: pointer; gap: 8px;">`;
    html += unreadDot;
    html += catBadge;
    html += `<span style="flex: 1; color: ${subjectColor}; font-weight: ${fontWeight}; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${msg.subject}</span>`;
    html += `<span style="color: ${TEXT}; font-size: 10px; flex-shrink: 0;">From: ${msg.from}</span>`;
    html += `<span style="color: ${TEXT}; font-size: 10px; flex-shrink: 0;">MD ${msg.matchday}</span>`;

    // Action buttons
    if (this.folder === 'inbox') {
      html += `<button data-archive-msg="${msg.id}" title="Archive" style="background: none; border: 1px solid #334155; border-radius: 3px; color: ${TEXT}; cursor: pointer; padding: 2px 6px; font-size: 10px;">📥</button>`;
    }
    html += `<button data-delete-msg="${msg.id}" title="Delete" style="background: none; border: 1px solid #334155; border-radius: 3px; color: ${RED}; cursor: pointer; padding: 2px 6px; font-size: 10px;">✕</button>`;
    html += `</div>`;

    // Expanded body
    if (isExpanded) {
      html += `<div style="padding: 0 12px 12px 28px; color: ${TEXT_BRIGHT}; font-size: 12px; line-height: 1.6; border-top: 1px solid #334155;">`;
      html += `<div style="padding-top: 10px;">${msg.body}</div>`;
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  private attachHandlers(inbox: InboxState): void {
    // Folder tabs
    for (const btn of this.container.querySelectorAll('[data-folder]')) {
      const folder = (btn as HTMLElement).dataset.folder as FolderMode;
      btn.addEventListener('click', () => { this.folder = folder; this.expandedMessageId = null; this.render(inbox); });
    }

    // Message toggle (expand/collapse)
    for (const row of this.container.querySelectorAll('[data-msg-toggle]')) {
      const id = (row as HTMLElement).dataset.msgToggle!;
      row.addEventListener('click', (e) => {
        // Don't toggle if clicking action buttons
        if ((e.target as HTMLElement).closest('[data-archive-msg], [data-delete-msg]')) return;
        this.expandedMessageId = this.expandedMessageId === id ? null : id;
        // Mark as read when expanding
        if (this.expandedMessageId === id) {
          this.markReadCallbacks.forEach(cb => cb(id));
        }
        this.render(inbox);
      });
    }

    // Archive
    for (const btn of this.container.querySelectorAll('[data-archive-msg]')) {
      const id = (btn as HTMLElement).dataset.archiveMsg!;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.archiveCallbacks.forEach(cb => cb(id));
      });
    }

    // Delete
    for (const btn of this.container.querySelectorAll('[data-delete-msg]')) {
      const id = (btn as HTMLElement).dataset.deleteMsg!;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteCallbacks.forEach(cb => cb(id));
      });
    }
  }
}
