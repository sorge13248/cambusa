import { TestBed } from '@angular/core/testing';
import { UndoService } from './undo.service.js';

describe('UndoService', () => {
  let service: UndoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UndoService],
    });
    service = TestBed.inject(UndoService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with null active action', () => {
    expect(service.activeAction()).toBeNull();
  });

  it('should register an undo action and decrement timer', () => {
    const undoMock = vi.fn().mockResolvedValue(undefined);
    service.register('Consumed 1 unit of milk', undoMock, 10);

    const action = service.activeAction();
    expect(action).not.toBeNull();
    expect(action?.description).toBe('Consumed 1 unit of milk');
    expect(action?.remainingSeconds).toBe(10);

    // Advance 2 seconds
    vi.advanceTimersByTime(2000);
    expect(service.activeAction()?.remainingSeconds).toBeLessThanOrEqual(8);

    // Advance to expiration
    vi.advanceTimersByTime(9000);
    expect(service.activeAction()).toBeNull();
  });

  it('should execute undo and call the provided function', async () => {
    const undoMock = vi.fn().mockResolvedValue(undefined);
    service.register('Moved item to freezer', undoMock, 10);

    const result = await service.executeUndo();
    expect(result).toBe(true);
    expect(undoMock).toHaveBeenCalled();
    expect(service.activeAction()).toBeNull();
  });

  it('should dismiss active action without calling undo', () => {
    const undoMock = vi.fn().mockResolvedValue(undefined);
    service.register('Purchased stock', undoMock, 10);

    service.dismiss();
    expect(service.activeAction()).toBeNull();
    expect(undoMock).not.toHaveBeenCalled();
  });

  it('should call onCommit when timer expires or dismiss is called, but not on undo', async () => {
    const undoMock = vi.fn().mockResolvedValue(undefined);
    const commitMock = vi.fn().mockResolvedValue(undefined);

    service.register({ description: 'Deleted product', onUndo: undoMock, onCommit: commitMock, durationSeconds: 10 });
    vi.advanceTimersByTime(10100);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(undoMock).not.toHaveBeenCalled();

    commitMock.mockClear();
    service.register({ description: 'Deleted product', onUndo: undoMock, onCommit: commitMock, durationSeconds: 10 });
    service.dismiss();
    expect(commitMock).toHaveBeenCalledTimes(1);

    commitMock.mockClear();
    service.register({ description: 'Deleted product', onUndo: undoMock, onCommit: commitMock, durationSeconds: 10 });
    await service.executeUndo();
    expect(undoMock).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
  });

  it('should flush previous onCommit when a new action is registered', () => {
    const commitFirst = vi.fn().mockResolvedValue(undefined);
    const commitSecond = vi.fn().mockResolvedValue(undefined);

    service.register({ description: 'First', onUndo: vi.fn().mockResolvedValue(undefined), onCommit: commitFirst });
    service.register({ description: 'Second', onUndo: vi.fn().mockResolvedValue(undefined), onCommit: commitSecond });

    expect(commitFirst).toHaveBeenCalledTimes(1);
    expect(commitSecond).not.toHaveBeenCalled();
  });
});
