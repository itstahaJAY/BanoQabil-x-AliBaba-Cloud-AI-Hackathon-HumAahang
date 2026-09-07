export type SavedTranscript = { id: string; text: string; language: string; savedAt: string };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
const key = 'humahang:transcripts:v1';

function isTranscript(value: unknown): value is SavedTranscript {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SavedTranscript>;
  return typeof item.id === 'string' && typeof item.text === 'string' && typeof item.language === 'string' && typeof item.savedAt === 'string';
}

export function createTranscriptStorage(storage: Storage) {
  const list = async (): Promise<SavedTranscript[]> => {
    const raw = await storage.getItem(key);
    if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    // Never overwrite an unreadable existing collection with an empty one.
    if (!Array.isArray(values) || !values.every(isTranscript)) throw new Error('Saved transcripts could not be read. Existing data has not been changed.');
    return values;
  };
  return {
    list,
    async save(item: SavedTranscript) {
      if (!item.text.trim()) throw new Error('There is no transcript to save yet.');
      const previous = await list();
      await storage.setItem(key, JSON.stringify([{ ...item, text: item.text.trim() }, ...previous.filter(value => value.id !== item.id)]));
    },
  };
}
