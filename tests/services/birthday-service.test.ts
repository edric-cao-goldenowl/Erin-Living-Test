import { BirthdayService } from '../../src/services/events/birthday-service';
import { UserService } from '../../src/services/user-service';
import { TimezoneService } from '../../src/services/timezone-service';
import { User } from '../../src/schemas/user';

jest.mock('../../src/services/user-service');
jest.mock('../../src/services/timezone-service');

// Mock service instances
const mockTimezoneService = {
  getCurrentTimeInTimezone: jest.fn(),
  isToday: jest.fn(),
  getTargetHourInUTC: jest.fn(),
} as unknown as TimezoneService;

const mockUserService = {
  getUsersByBirthdayMonthDay: jest.fn(),
} as unknown as UserService;

describe('BirthdayService', () => {
  const mockUser: User = {
    userId: '123',
    firstName: 'John',
    lastName: 'Doe',
    birthday: '1990-01-15',
    timezone: 'America/New_York',
    location: {
      city: 'New York',
      province: 'New York',
      lat: 40.7128,
      lng: -74.006,
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    birthdayMonthDay: '01-15',
  };

  const mockNowInTimezone = new Date('2024-01-10T00:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (mockTimezoneService.getCurrentTimeInTimezone as jest.Mock).mockReturnValue(mockNowInTimezone);
  });

  describe('isBirthdayToday', () => {
    it('should return true if today is birthday', () => {
      (mockTimezoneService.isToday as jest.Mock).mockReturnValue(true);
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = birthdayService.isBirthdayToday(mockUser);

      expect(result).toBe(true);
      expect(mockTimezoneService.isToday).toHaveBeenCalledWith(
        mockUser.birthday,
        mockUser.timezone
      );
    });

    it('should return false if today is not birthday', () => {
      (mockTimezoneService.isToday as jest.Mock).mockReturnValue(false);
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = birthdayService.isBirthdayToday(mockUser);

      expect(result).toBe(false);
    });
  });

  describe('calculateNextBirthdayDelivery', () => {
    it('should calculate UTC time for target hour on birthday', () => {
      const mockDate = new Date('2024-01-15T14:00:00Z');
      (mockTimezoneService.getTargetHourInUTC as jest.Mock).mockReturnValue(mockDate);
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = birthdayService.calculateNextBirthdayDelivery(mockUser);

      expect(result).toBe(mockDate);
      expect(mockTimezoneService.getTargetHourInUTC).toHaveBeenCalled();
    });
  });

  describe('getUsersWithBirthdayToday', () => {
    it('should return users with birthdays today', async () => {
      (mockUserService.getUsersByBirthdayMonthDay as jest.Mock)
        .mockResolvedValueOnce([mockUser]) // today
        .mockResolvedValueOnce([]); // tomorrow

      (mockTimezoneService.isToday as jest.Mock).mockReturnValue(true);
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = await birthdayService.getUsersWithBirthdayToday();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockUser);
      expect(mockUserService.getUsersByBirthdayMonthDay).toHaveBeenCalledTimes(2);
    });

    it('should query both today and tomorrow to cover UTC+14', async () => {
      const tomorrowUser: User = {
        ...mockUser,
        userId: '456',
        birthday: '1990-01-16',
      };
      (mockUserService.getUsersByBirthdayMonthDay as jest.Mock)
        .mockResolvedValueOnce([mockUser]) // today
        .mockResolvedValueOnce([tomorrowUser]); // tomorrow

      (mockTimezoneService.isToday as jest.Mock)
        .mockReturnValueOnce(true) // mockUser has birthday today
        .mockReturnValueOnce(false); // tomorrowUser doesn't have birthday today
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = await birthdayService.getUsersWithBirthdayToday();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockUser);
      expect(mockUserService.getUsersByBirthdayMonthDay).toHaveBeenCalledTimes(2);
    });

    it('should filter out users whose birthday is not today in their timezone', async () => {
      (mockUserService.getUsersByBirthdayMonthDay as jest.Mock)
        .mockResolvedValueOnce([mockUser]) // today
        .mockResolvedValueOnce([]); // tomorrow

      (mockTimezoneService.isToday as jest.Mock).mockReturnValue(false);
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = await birthdayService.getUsersWithBirthdayToday();

      expect(result).toHaveLength(0);
    });

    it('should remove duplicates when same user appears in both queries', async () => {
      (mockUserService.getUsersByBirthdayMonthDay as jest.Mock)
        .mockResolvedValueOnce([mockUser]) // today
        .mockResolvedValueOnce([mockUser]); // tomorrow (same user)

      (mockTimezoneService.isToday as jest.Mock).mockReturnValue(true);
      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);

      const result = await birthdayService.getUsersWithBirthdayToday();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockUser);
    });
  });

  describe('calculateBirthdaySchedule', () => {
    it('should return schedule with delaySeconds = 0 if 9am has arrived', () => {
      // Mock: 9am has already passed (targetUTC is in the past)
      const mockDate = new Date('2024-01-15T08:00:00Z'); // 8am UTC (past)
      const mockNow = new Date('2024-01-15T10:00:00Z'); // 10am UTC (now)
      (mockTimezoneService.getTargetHourInUTC as jest.Mock).mockReturnValue(mockDate);

      // Mock Date constructor to return fixed time
      const OriginalDate = Date;
      const DateMock = jest.fn().mockImplementation((...args: unknown[]) => {
        if (args.length === 0) {
          return new OriginalDate(mockNow);
        }
        return new (OriginalDate as unknown as new (...args: unknown[]) => Date)(...args);
      }) as unknown as typeof Date;
      DateMock.now = jest.fn().mockReturnValue(mockNow.getTime());
      Object.setPrototypeOf(DateMock, OriginalDate);
      Object.assign(DateMock, OriginalDate);
      global.Date = DateMock;

      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);
      const result = birthdayService.calculateBirthdaySchedule(mockUser);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.user).toEqual(mockUser);
        expect(result.targetUTC).toBe(mockDate);
        expect(result.delaySeconds).toBe(0);
      }

      global.Date = OriginalDate;
    });

    it('should return null if 9am has not arrived yet', () => {
      // Mock: 9am hasn't arrived yet (targetUTC is in the future)
      const mockDate = new Date('2024-01-15T15:00:00Z'); // 3pm UTC (future)
      const mockNow = new Date('2024-01-15T10:00:00Z'); // 10am UTC (now)
      (mockTimezoneService.getTargetHourInUTC as jest.Mock).mockReturnValue(mockDate);

      // Mock Date constructor to return fixed time
      const OriginalDate = Date;
      const DateMock = jest.fn().mockImplementation((...args: unknown[]) => {
        if (args.length === 0) {
          return new OriginalDate(mockNow);
        }
        return new (OriginalDate as unknown as new (...args: unknown[]) => Date)(...args);
      }) as unknown as typeof Date;
      DateMock.now = jest.fn().mockReturnValue(mockNow.getTime());
      Object.setPrototypeOf(DateMock, OriginalDate);
      Object.assign(DateMock, OriginalDate);
      global.Date = DateMock;

      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);
      const result = birthdayService.calculateBirthdaySchedule(mockUser);

      expect(result).toBeNull();

      global.Date = OriginalDate;
    });

    it('should return schedule with delaySeconds = 0 if exactly at 9am', () => {
      // Mock: exactly at 9am
      const mockDate = new Date('2024-01-15T09:00:00Z'); // 9am UTC
      const mockNow = new Date('2024-01-15T09:00:00Z'); // 9am UTC (now)
      (mockTimezoneService.getTargetHourInUTC as jest.Mock).mockReturnValue(mockDate);

      // Mock Date constructor to return fixed time
      const OriginalDate = Date;
      const DateMock = jest.fn().mockImplementation((...args: unknown[]) => {
        if (args.length === 0) {
          return new OriginalDate(mockNow);
        }
        return new (OriginalDate as unknown as new (...args: unknown[]) => Date)(...args);
      }) as unknown as typeof Date;
      DateMock.now = jest.fn().mockReturnValue(mockNow.getTime());
      Object.setPrototypeOf(DateMock, OriginalDate);
      Object.assign(DateMock, OriginalDate);
      global.Date = DateMock;

      const birthdayService = new BirthdayService(mockTimezoneService, mockUserService);
      const result = birthdayService.calculateBirthdaySchedule(mockUser);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.delaySeconds).toBe(0);
      }

      global.Date = OriginalDate;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });
  });
});
