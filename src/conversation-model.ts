export type Sender = 'you' | 'partner';
export type Message = { id: number; sender: Sender; text: string };

// A sender comes from the input control, never the message's position.
export function appendMessage(messages: Message[], sender: Sender, text: string): Message[] {
  const trimmed = text.trim();
  if (!trimmed) return messages;
  const id = messages.reduce((max, message) => Math.max(max, message.id), 0) + 1;
  return [...messages, { id, sender, text: trimmed }];
}

export function latestMessageFrom(messages: Message[], sender: Sender): Message | undefined {
  return messages.findLast(message => message.sender === sender);
}
