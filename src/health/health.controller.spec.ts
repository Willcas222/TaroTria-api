import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({ 'app.environment': 'test', 'app.version': '0.0.1' })[key],
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok status without leaking secrets', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.environment).toBe('test');
    expect(result.version).toBe('0.0.1');
    expect(typeof result.uptime).toBe('number');
    expect(Object.keys(result)).toEqual([
      'status',
      'environment',
      'version',
      'uptime',
      'timestamp',
    ]);
  });
});
