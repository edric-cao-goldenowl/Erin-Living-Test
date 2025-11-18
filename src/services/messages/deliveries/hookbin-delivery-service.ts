import axios from 'axios';
import { User } from '../../../schemas/user';
import { MessageDeliveryService } from '../message-delivery-service';

/**
 * Hookbin delivery service implementation
 * Sends messages to hookbin.com via HTTP POST
 */
export class HookbinDeliveryService implements MessageDeliveryService {
  /**
   * Get hookbin URL from environment variable
   */
  private getHookbinUrl(): string {
    return process.env.HOOKBIN_URL || '';
  }

  /**
   * Send message to hookbin.com via HTTP POST
   */
  async send(_user: User, message: string, _eventType: string): Promise<void> {
    const hookbinUrl = this.getHookbinUrl();

    if (!hookbinUrl) {
      throw new Error('HOOKBIN_URL environment variable is not set');
    }

    const payload = {
      message,
    };

    try {
      const response = await axios.post(hookbinUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (response.status !== 200 && response.status !== 201 && response.status !== 204) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to send message: ${error.message}`);
      }
      throw error;
    }
  }
}
