import axios from 'axios';
import { User } from '../models/user';
import { MessageFormatter, BirthdayMessageFormatter } from './message-formatter';

export class MessageService {
  private static getHookbinUrl(): string {
    return process.env.HOOKBIN_URL || '';
  }

  /**
   * Format birthday message (legacy method for backward compatibility)
   */
  static formatMessage(user: User): string {
    const formatter = new BirthdayMessageFormatter();
    return formatter.formatMessage(user, 'birthday');
  }

  /**
   * Send message to hookbin.com using a message formatter
   */
  static async sendMessage(
    user: User,
    eventType: string,
    formatter: MessageFormatter
  ): Promise<void> {
    const hookbinUrl = this.getHookbinUrl();

    if (!hookbinUrl) {
      throw new Error('HOOKBIN_URL environment variable is not set');
    }

    const message = formatter.formatMessage(user, eventType);
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

  /**
   * Send birthday message to hookbin.com (convenience method)
   */
  static async sendBirthdayMessage(user: User): Promise<void> {
    const formatter = new BirthdayMessageFormatter();
    return this.sendMessage(user, 'birthday', formatter);
  }
}
