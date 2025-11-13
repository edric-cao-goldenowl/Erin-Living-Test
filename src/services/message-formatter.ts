import { User } from '../models/user';

/**
 * Interface for message formatters (Birthday, Anniversary, etc.)
 * Allows easy extension to support new message types
 */
export interface MessageFormatter {
  /**
   * Format message for a user and event type
   */
  formatMessage(user: User, eventType: string): string;
}

/**
 * Birthday message formatter
 */
export class BirthdayMessageFormatter implements MessageFormatter {
  formatMessage(user: User, _eventType: string): string {
    const fullName = `${user.firstName} ${user.lastName}`;
    return `Hey, ${fullName} it's your birthday`;
  }
}
