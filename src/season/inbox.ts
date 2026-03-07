/**
 * Inbox message system.
 *
 * Provides types and helpers for managing an email-style inbox
 * with unread markers, archiving, and deletion.
 */

// --- Types ---

export type MessageCategory = 'transfer' | 'scout' | 'match' | 'general';

export interface InboxMessage {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly from: string;
  readonly matchday: number;
  readonly category: MessageCategory;
  read: boolean;
  archived: boolean;
  deleted: boolean;
}

export interface InboxState {
  messages: InboxMessage[];
}

// --- Helpers ---

let _msgCounter = 0;

/** Generate a unique message ID. */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${++_msgCounter}`;
}

/** Create a new empty inbox. */
export function createInbox(): InboxState {
  return { messages: [] };
}

/** Add a message to the inbox. */
export function addMessage(inbox: InboxState, message: InboxMessage): InboxState {
  return { messages: [message, ...inbox.messages] };
}

/** Create and add a message in one call. */
export function sendMessage(
  inbox: InboxState,
  params: { subject: string; body: string; from: string; matchday: number; category: MessageCategory },
): InboxState {
  const message: InboxMessage = {
    id: generateMessageId(),
    subject: params.subject,
    body: params.body,
    from: params.from,
    matchday: params.matchday,
    category: params.category,
    read: false,
    archived: false,
    deleted: false,
  };
  return addMessage(inbox, message);
}

/** Mark a message as read. */
export function markAsRead(inbox: InboxState, messageId: string): InboxState {
  return {
    messages: inbox.messages.map(m => m.id === messageId ? { ...m, read: true } : m),
  };
}

/** Mark all messages as read. */
export function markAllAsRead(inbox: InboxState): InboxState {
  return {
    messages: inbox.messages.map(m => ({ ...m, read: true })),
  };
}

/** Archive a message. */
export function archiveMessage(inbox: InboxState, messageId: string): InboxState {
  return {
    messages: inbox.messages.map(m => m.id === messageId ? { ...m, archived: true, read: true } : m),
  };
}

/** Delete a message (soft delete). */
export function deleteMessage(inbox: InboxState, messageId: string): InboxState {
  return {
    messages: inbox.messages.map(m => m.id === messageId ? { ...m, deleted: true } : m),
  };
}

/** Get unread count (non-deleted, non-archived). */
export function getUnreadCount(inbox: InboxState): number {
  return inbox.messages.filter(m => !m.read && !m.deleted && !m.archived).length;
}

/** Get inbox messages (non-deleted, non-archived). */
export function getInboxMessages(inbox: InboxState): InboxMessage[] {
  return inbox.messages.filter(m => !m.deleted && !m.archived);
}

/** Get archived messages. */
export function getArchivedMessages(inbox: InboxState): InboxMessage[] {
  return inbox.messages.filter(m => m.archived && !m.deleted);
}
