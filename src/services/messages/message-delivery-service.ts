import { User } from '../../schemas/user';

/**
 * Interface for message delivery services (Hookbin, Email, SMS, etc.)
 * Allows easy extension to support new delivery methods
 */
export interface MessageDeliveryService {
  /**
   * Send a formatted message to a user
   * @param user - The user to send the message to
   * @param message - The formatted message content
   * @param eventType - The type of event (e.g., 'birthday', 'anniversary')
   */
  send(user: User, message: string, eventType: string): Promise<void>;
}
