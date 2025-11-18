import { UserService } from '../user-service';
import { TimezoneService } from '../timezone-service';
import { User } from '../../schemas/user';
import { format, addDays } from 'date-fns';
import { EventService, EventSchedule } from './event-service';

export interface BirthdaySchedule extends EventSchedule {
  user: User;
  targetUTC: Date;
  delaySeconds?: number;
}

const TARGET_HOUR = Number(process.env.TARGET_HOUR_BIRTHDAY) || 9;

export class BirthdayService implements EventService {
  constructor(
    private timezoneService: TimezoneService,
    private userService: UserService
  ) {}
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
    return this.timezoneService.isToday(user.birthday, user.timezone);
  }

  /**
   * Check if today is user's birthday in their timezone (legacy method for backward compatibility)
   */
  isBirthdayToday(user: User): boolean {
    return this.timezoneService.isToday(user.birthday, user.timezone);
  }

  /**
   * Calculate UTC timestamp for delivery time at the configured target hour today in user's timezone
   * Only calculates for today's birthday, not future birthdays
   */
  calculateNextBirthdayDelivery(user: User): Date {
    const now = new Date();
    const todayString = format(now, 'yyyy-MM-dd');

    // Calculate target hour today in user's timezone, converted to UTC
    return this.timezoneService.getTargetHourInUTC(todayString, user.timezone, TARGET_HOUR);
  }

  /**
   * Get all users with birthdays today
   * Query 2 days (today and tomorrow) to cover UTC+14 timezone
   * Excludes users who already received birthday message for today
   */
  async getUsersWithEventToday(): Promise<User[]> {
    const now = new Date();
    const today = format(now, 'MM-dd');
    const tomorrow = format(addDays(now, 1), 'MM-dd');
    const todayFullDate = format(now, 'yyyy-MM-dd');
    const tomorrowFullDate = format(addDays(now, 1), 'yyyy-MM-dd');
    const currentYearPrefix = `${now.getFullYear()}-`; // e.g., "2024-"

    // Query both today and tomorrow to cover UTC+14 timezone
    // Exclude users who already received message for this birthday date THIS YEAR (filtered in DynamoDB)
    const [usersToday, usersTomorrow] = await Promise.all([
      this.userService.getUsersByBirthdayMonthDay(today, todayFullDate, currentYearPrefix),
      this.userService.getUsersByBirthdayMonthDay(tomorrow, tomorrowFullDate, currentYearPrefix),
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
    return Array.from(uniqueUsers.values()).filter((user) => this.isBirthdayToday(user));
  }

  /**
   * Get all users with birthdays today (legacy method for backward compatibility)
   * Query 2 days (today and tomorrow) to cover UTC+14 timezone
   * Excludes users who already received birthday message for today
   */
  async getUsersWithBirthdayToday(): Promise<User[]> {
    return this.getUsersWithEventToday();
  }

  /**
   * Calculate schedule for birthday message delivery
   * Returns null if the configured target hour hasn't arrived yet (scheduler will check again next hour)
   * Returns schedule if the target hour has arrived (send immediately)
   * Since scheduler runs hourly, we just check if the target hour has passed
   */
  calculateSchedule(user: User): EventSchedule | null {
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
   * Calculate schedule for birthday message delivery (legacy method for backward compatibility)
   * Returns null if the configured target hour hasn't arrived yet (scheduler will check again next hour)
   * Returns schedule if the target hour has arrived (send immediately)
   * Since scheduler runs hourly, we just check if the target hour has passed
   */
  calculateBirthdaySchedule(user: User): BirthdaySchedule | null {
    return this.calculateSchedule(user) as BirthdaySchedule | null;
  }

  /**
   * Get users with birthdays in a date range (for recovery)
   */
  async getUsersWithEventInRange(startDate: Date, endDate: Date): Promise<User[]> {
    const allUsers: User[] = [];

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const monthDay = format(currentDate, 'MM-dd');
      const users = await this.userService.getUsersByBirthdayMonthDay(monthDay);
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

  /**
   * Get users with birthdays in a date range (for recovery) - legacy method for backward compatibility
   */
  async getUsersWithBirthdayInRange(startDate: Date, endDate: Date): Promise<User[]> {
    return this.getUsersWithEventInRange(startDate, endDate);
  }
}
