import { User } from '../../schemas/user';

/**
 * Schedule for event message delivery
 */
export interface EventSchedule {
  user: User;
  targetUTC: Date;
  delaySeconds?: number; // Delay in seconds before sending the message, for enqueuing to SQS
}

/**
 * Interface for event services (Birthday, Anniversary, etc.)
 * Allows easy extension to support new event types
 */
export interface EventService {
  /**
   * Check if today is the event date in user's timezone
   */
  isEventToday(user: User): boolean;

  /**
   * Get all users with the event today
   */
  getUsersWithEventToday(): Promise<User[]>;

  /**
   * Calculate schedule for event message delivery
   * Returns null if the configured target hour hasn't arrived yet
   * Returns schedule if the target hour has arrived (send immediately)
   */
  calculateSchedule(user: User): EventSchedule | null;

  /**
   * Get users with events in a date range (for recovery)
   */
  getUsersWithEventInRange(startDate: Date, endDate: Date): Promise<User[]>;

  /**
   * Get the event date field from user (e.g., birthday, anniversaryDate)
   */
  getEventDate(user: User): string;

  /**
   * Get the event type identifier (e.g., 'birthday', 'anniversary')
   */
  getEventType(): string;
}
