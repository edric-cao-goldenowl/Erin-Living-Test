import { User } from '../../schemas/user';
import { MessageFormatter } from './message-formatter';
import { MessageDeliveryService } from './message-delivery-service';

/**
 * MessageService using Strategy Pattern
 * Context class that uses MessageFormatter strategy to format messages
 * and MessageDeliveryService strategy to deliver messages
 */
export class MessageService {
  /**
   * Constructor that accepts MessageFormatter and MessageDeliveryService strategies
   */
  constructor(
    private formatter: MessageFormatter,
    private deliveryService: MessageDeliveryService
  ) {}

  /**
   * Format message for a user and event type using the injected formatter strategy
   */
  formatMessage(user: User, eventType: string): string {
    return this.formatter.formatMessage(user, eventType);
  }

  /**
   * Send message using the injected delivery service strategy
   */
  async sendMessage(user: User, eventType: string): Promise<void> {
    const message = this.formatMessage(user, eventType);
    await this.deliveryService.send(user, message, eventType);
  }

  /**
   * Send event message (convenience method)
   */
  async sendEventMessage(user: User, eventType: string): Promise<void> {
    return this.sendMessage(user, eventType);
  }
}
