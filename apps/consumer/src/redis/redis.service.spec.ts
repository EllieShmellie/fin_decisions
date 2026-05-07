import { RedisService } from './redis.service';

describe('RedisService idempotency store', () => {
  let service: RedisService;
  let client: {
    exists: jest.Mock;
    set: jest.Mock;
    eval: jest.Mock;
  };

  beforeEach(() => {
    service = new RedisService({ redisUrl: 'redis://localhost:6379' } as any);
    client = {
      exists: jest.fn(),
      set: jest.fn(),
      eval: jest.fn(),
    };
    (service as any).client = client;
  });

  it('returns generated lock token when lock is acquired', async () => {
    client.set.mockResolvedValue('OK');

    const token = await service.tryAcquireLock('event-1');

    expect(token).toEqual(expect.any(String));
    expect(client.set).toHaveBeenCalledWith('processing:event-1', token, 'EX', 60, 'NX');
  });

  it('returns null when lock is already held', async () => {
    client.set.mockResolvedValue(null);

    await expect(service.tryAcquireLock('event-1')).resolves.toBeNull();
  });

  it('marks processed and releases only owned lock', async () => {
    await service.completeProcessing('event-1', 'token-1');

    expect(client.set).toHaveBeenCalledWith('processed:event-1', '1', 'EX', 86400);
    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
      1,
      'processing:event-1',
      'token-1',
    );
  });

  it('uses token check when releasing a lock', async () => {
    await service.releaseLock('event-1', 'token-1');

    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'processing:event-1',
      'token-1',
    );
  });
});
