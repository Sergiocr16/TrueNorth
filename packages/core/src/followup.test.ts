import { describe, expect, it } from 'vitest';
import { ensureGreeting, isRepeat, leaksNote, messageId } from './followup';
import type { CitedSignal, FollowUp } from './types';

const signal = (id: string, severity: CitedSignal['severity'] = 'warning'): CitedSignal => ({
  id,
  severity,
  summary: { es: id, en: id },
});

const message = (signals: CitedSignal[]): FollowUp => ({
  id: 'u1:directo:-',
  userId: 'u1',
  target: { kind: 'directo' },
  tone: 'seguimiento',
  message: 'Texto',
  why: 'Porque',
  ask: 'Algo',
  signals,
  escalate: false,
});

describe('messageId', () => {
  it('names a message by who it is for and where it goes', () => {
    expect(messageId('u1', { kind: 'directo' }, [])).toBe('u1:directo:-');
    expect(messageId('u1', { kind: 'comentario', taskId: 't9' }, [])).toBe('u1:comentario:t9');
  });

  // The point of the id: recomputing the same day must land on the same names,
  // or everything the manager already marked comes back unmarked.
  it('is stable for the same person and destination', () => {
    const first = messageId('u1', { kind: 'comentario', taskId: 't9' }, []);
    const again = messageId('u1', { kind: 'comentario', taskId: 't9' }, []);
    expect(again).toBe(first);
  });

  it('separates two messages of the same shape to the same person', () => {
    const taken = [{ id: 'u1:directo:-' }];
    expect(messageId('u1', { kind: 'directo' }, taken)).toBe('u1:directo:-:2');
    expect(messageId('u1', { kind: 'directo' }, [...taken, { id: 'u1:directo:-:2' }])).toBe(
      'u1:directo:-:3',
    );
  });
});

describe('isRepeat', () => {
  it('catches the same signals said again', () => {
    expect(isRepeat([signal('a'), signal('b')], message([signal('b'), signal('a')]))).toBe(true);
  });

  it('lets a message through when something new is behind it', () => {
    expect(isRepeat([signal('a'), signal('c')], message([signal('a'), signal('b')]))).toBe(false);
  });

  // Nothing changed except that it got worse, which is worth saying again.
  it('lets a message through when the same signal turned critical', () => {
    expect(isRepeat([signal('a', 'critical')], message([signal('a', 'warning')]))).toBe(false);
  });

  it('still blocks it when the severity dropped', () => {
    expect(isRepeat([signal('a', 'info')], message([signal('a', 'critical')]))).toBe(true);
  });
});

describe('leaksNote', () => {
  const note = 'Anda con un tema familiar esta semana';

  it('catches the note quoted word for word', () => {
    expect(leaksNote(`Marco, sé que ${note.toLowerCase()}, tomate el tiempo.`, note)).toBe(true);
  });

  it('sees through accents and stray whitespace', () => {
    expect(leaksNote('anda  con un  TEMA familiar esta semana', 'Andá con un tema familiar esta semana')).toBe(
      true,
    );
  });

  it('lets a message that only softens the ask through', () => {
    expect(leaksNote('Marco, si esta semana viene pesada, decime y movemos la fecha.', note)).toBe(
      false,
    );
  });

  // A three-word note would match half of everything; short notes are the
  // model's problem, not the guard's.
  it('ignores a note too short to match on', () => {
    expect(leaksNote('Está saturado hoy', 'saturado')).toBe(false);
  });
});

describe('ensureGreeting', () => {
  it('opens with the first name when the model forgot to', () => {
    expect(ensureGreeting('¿cómo vas con TAR-931?', 'Marco')).toBe('Hola Marco, ¿cómo vas con TAR-931?');
  });

  it('leaves a message alone when it already greets or names the person', () => {
    expect(ensureGreeting('Hola Marco, ¿cómo vas?', 'Marco')).toBe('Hola Marco, ¿cómo vas?');
    expect(ensureGreeting('Buenas, Marco. ¿Cómo vas?', 'Marco')).toBe('Buenas, Marco. ¿Cómo vas?');
    expect(ensureGreeting('Marco, ¿cómo vas?', 'Marco')).toBe('Marco, ¿cómo vas?');
  });

  it('does nothing without a name to greet with', () => {
    expect(ensureGreeting('¿cómo vas?', '')).toBe('¿cómo vas?');
  });
});
