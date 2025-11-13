import { TimezoneService } from '../../src/services/timezone-service';

describe('TimezoneService', () => {
  describe('getTargetHourInUTC', () => {
    it('should convert date to UTC timestamp for default hour', () => {
      const dateString = '2024-01-15';
      const timezone = 'America/New_York';

      const result = TimezoneService.getTargetHourInUTC(dateString, timezone, 9);

      expect(result).toBeInstanceOf(Date);
    });

    it('should convert date to UTC timestamp for custom hour', () => {
      const dateString = '2024-01-15';
      const timezone = 'America/New_York';

      const result = TimezoneService.getTargetHourInUTC(dateString, timezone, 15);

      expect(result).toBeInstanceOf(Date);
    });

    it('should handle different timezones', () => {
      const dateString = '2024-01-15';
      const timezone = 'Asia/Ho_Chi_Minh';

      const result = TimezoneService.getTargetHourInUTC(dateString, timezone, 9);

      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('calculateDelaySeconds', () => {
    it('should return non-negative delay', () => {
      const result = TimezoneService.calculateDelaySeconds('2099-01-01', 'UTC');

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isToday', () => {
    it('should return true for same month/day in timezone', () => {
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];

      const result = TimezoneService.isToday(dateString, 'UTC');

      expect(result).toBe(true);
    });
  });
});
