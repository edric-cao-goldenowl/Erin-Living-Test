import { MessageService } from './message-service';
import { MessageFormatter, BirthdayMessageFormatter } from './message-formatter';
import { MessageDeliveryService } from './message-delivery-service';
import { HookbinDeliveryService } from './deliveries/hookbin-delivery-service';

/**
 * Factory for creating MessageService instances with appropriate formatter and delivery strategies
 */
export class MessageServiceFactory {
  /**
   * Constructor that accepts a MessageDeliveryService
   * Defaults to HookbinDeliveryService for backward compatibility
   */
  constructor(private deliveryService?: MessageDeliveryService) {
    if (!this.deliveryService) {
      this.deliveryService = new HookbinDeliveryService();
    }
  }

  /**
   * Create a MessageService instance with the appropriate formatter for the event type
   */
  create(eventType: string): MessageService {
    const formatter = this.getFormatter(eventType);
    return new MessageService(formatter, this.deliveryService!);
  }

  /**
   * Get the appropriate formatter for an event type
   * Returns birthday formatter as default for unknown types
   */
  private getFormatter(eventType: string): MessageFormatter {
    switch (eventType) {
      case 'birthday':
        return new BirthdayMessageFormatter();
      // Future: case 'anniversary': return new AnniversaryMessageFormatter();
      default:
        // Default to birthday formatter for unknown types
        return new BirthdayMessageFormatter();
    }
  }
}
