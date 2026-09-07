import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendMessage, latestMessageFrom } from '../src/conversation-model.ts';

test('consecutive quick replies and typed text stay with the explicitly selected sender', () => {
  for (const sender of ['you', 'partner']) {
    for (const count of [0, 1, 2, 3]) {
      const other = sender === 'you' ? 'partner' : 'you';
      const initial = Array.from({ length: count }, (_, i) => ({ id: i + 1, sender: other, text: 'Hello' }));
      const replies = ['Yes', 'No', 'Thank you', 'Please call my family', 'My typed response'];
      const result = replies.reduce((messages, text) => appendMessage(messages, sender, text), initial);
      assert.deepEqual(result.slice(count).map(m => [m.sender, m.text]), replies.map(text => [sender, text]));
      assert.equal(new Set(result.map(m => m.id)).size, result.length);
      assert.equal(initial.length, count);
    }
  }
});

test('face-to-face selects the latest message by sender even after consecutive replies', () => {
  let messages = appendMessage([], 'partner', 'Hello');
  messages = appendMessage(messages, 'you', 'Yes');
  messages = appendMessage(messages, 'you', 'No');
  assert.equal(latestMessageFrom(messages, 'you').text, 'No');
  assert.equal(latestMessageFrom(messages, 'partner').text, 'Hello');
  messages = appendMessage(messages, 'partner', 'Understood');
  messages = appendMessage(messages, 'partner', 'Anything else?');
  assert.equal(latestMessageFrom(messages, 'partner').text, 'Anything else?');
  assert.equal(latestMessageFrom(messages, 'you').text, 'No');
});

test('empty input does not append or alter ownership', () => {
  const messages = appendMessage([], 'you', '  اردو message  ');
  assert.equal(messages[0].text, 'اردو message');
  assert.equal(appendMessage(messages, 'partner', '   '), messages);
  assert.equal(latestMessageFrom(messages, 'partner'), undefined);
});

test('explicit handoffs support multiple messages per person without rewriting history', () => {
  const turns = [
    ['you', 'Yes'], ['you', 'Thank you'],
    ['partner', 'No'], ['partner', 'Please call my family'],
    ['partner', 'My typed response'], ['you', 'Understood'],
  ];
  const messages = turns.reduce((history, [sender, text]) => appendMessage(history, sender, text), []);
  assert.deepEqual(messages.map(message => [message.sender, message.text]), turns);
  assert.equal(latestMessageFrom(messages, 'you').text, 'Understood');
  assert.equal(latestMessageFrom(messages, 'partner').text, 'My typed response');
});
