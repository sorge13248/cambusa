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
});
