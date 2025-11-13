import { UserService } from './user-service';
import { TimezoneService } from './timezone-service';
import { User } from '../models/user';
import { format, addDays } from 'date-fns';
import { EventService, EventSchedule } from './event-service';

export interface BirthdaySchedule extends EventSchedule {
  user: User;
  targetUTC: Date;
  delaySeconds?: number;
}

const TARGET_HOUR = Number(process.env.TARGET_HOUR_BIRTHDAY) || 9;

export class BirthdayService implements EventService {
  private static instance: BirthdayService;

  static getInstance(): BirthdayService {
    if (!BirthdayService.instance) {
      BirthdayService.instance = new BirthdayService();
    }
    return BirthdayService.instance;
  }
  /**
   * Get the event type identifier
   */
  getEventType(): string {
    return 'birthday';
  }

  /**
   * Get the event date field from user
   */
  getEventDate(user: User): string {
    return user.birthday;
  }

  /**
   * Check if today is user's birthday in their timezone
   */
  isEventToday(user: User): boolean {
    return TimezoneService.isToday(user.birthday, user.timezone);
  }

  /**
   * Check if today is user's birthday in their timezone (legacy method for backward compatibility)
   */
  static isBirthdayToday(user: User): boolean {
    return TimezoneService.isToday(user.birthday, user.timezone);
  }

  /**
   * Calculate UTC timestamp for delivery time at the configured target hour today in user's timezone
   * Only calculates for today's birthday, not future birthdays
   */
  static calculateNextBirthdayDelivery(user: User): Date {
    const now = new Date();
    const todayString = format(now, 'yyyy-MM-dd');

    // Calculate target hour today in user's timezone, converted to UTC
    return TimezoneService.getTargetHourInUTC(todayString, user.timezone, TARGET_HOUR);
  }

  /**
   * Get all users with birthdays today
   * Query 2 days (today and tomorrow) to cover UTC+14 timezone
   * Excludes users who already received birthday message for today
   */
  async getUsersWithEventToday(): Promise<User[]> {
    return BirthdayService.getUsersWithBirthdayToday();
  }

  /**
   * Get all users with birthdays today (legacy static method for backward compatibility)
   * Query 2 days (today and tomorrow) to cover UTC+14 timezone
   * Excludes users who already received birthday message for today
   */
  static async getUsersWithBirthdayToday(): Promise<User[]> {
    const now = new Date();
    const today = format(now, 'MM-dd');
    const tomorrow = format(addDays(now, 1), 'MM-dd');
    const todayFullDate = format(now, 'yyyy-MM-dd');
    const tomorrowFullDate = format(addDays(now, 1), 'yyyy-MM-dd');
    const currentYearPrefix = `${now.getFullYear()}-`; // e.g., "2024-"

    // Query both today and tomorrow to cover UTC+14 timezone
    // Exclude users who already received message for this birthday date THIS YEAR (filtered in DynamoDB)
    const [usersToday, usersTomorrow] = await Promise.all([
      UserService.getUsersByBirthdayMonthDay(today, todayFullDate, currentYearPrefix),
      UserService.getUsersByBirthdayMonthDay(tomorrow, tomorrowFullDate, currentYearPrefix),
    ]);

    // Merge and remove duplicates
    const allUsers = [...usersToday, ...usersTomorrow];

    const uniqueUsers = new Map<string, User>();
    allUsers.forEach((user) => {
      if (!uniqueUsers.has(user.userId)) {
        uniqueUsers.set(user.userId, user);
      }
    });

    // Filter: only users who actually have birthday today in their timezone
    return Array.from(uniqueUsers.values()).filter((user) => BirthdayService.isBirthdayToday(user));
  }

  /**
   * Calculate schedule for birthday message delivery
   * Returns null if the configured target hour hasn't arrived yet (scheduler will check again next hour)
   * Returns schedule if the target hour has arrived (send immediately)
   * Since scheduler runs hourly, we just check if the target hour has passed
   */
  calculateSchedule(user: User): EventSchedule | null {
    return BirthdayService.calculateBirthdaySchedule(user);
  }

  /**
   * Calculate schedule for birthday message delivery (legacy static method for backward compatibility)
   * Returns null if the configured target hour hasn't arrived yet (scheduler will check again next hour)
   * Returns schedule if the target hour has arrived (send immediately)
   * Since scheduler runs hourly, we just check if the target hour has passed
   */
  static calculateBirthdaySchedule(user: User): BirthdaySchedule | null {
    const targetUTC = this.calculateNextBirthdayDelivery(user);
    const now = new Date();
    // If the target hour hasn't arrived yet, return null (scheduler will check again next hour)
    if (targetUTC.getTime() > now.getTime()) {
      return null;
    }

    // If the target hour has arrived, send immediately
    return {
      user,
      targetUTC,
      delaySeconds: 0, // Current run immediately, no delay
    };
  }

  /**
   * Get users with birthdays in a date range (for recovery)
   */
  async getUsersWithEventInRange(startDate: Date, endDate: Date): Promise<User[]> {
    return BirthdayService.getUsersWithBirthdayInRange(startDate, endDate);
  }

  /**
   * Get users with birthdays in a date range (for recovery) - legacy static method for backward compatibility
   */
  static async getUsersWithBirthdayInRange(startDate: Date, endDate: Date): Promise<User[]> {
    const allUsers: User[] = [];

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const monthDay = format(currentDate, 'MM-dd');
      const users = await UserService.getUsersByBirthdayMonthDay(monthDay);
      allUsers.push(...users);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const uniqueUsers = new Map<string, User>();
    allUsers.forEach((user) => {
      if (!uniqueUsers.has(user.userId)) {
        uniqueUsers.set(user.userId, user);
      }
    });

    return Array.from(uniqueUsers.values());
  }
}
