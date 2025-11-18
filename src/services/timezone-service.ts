import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import { parseISO, format } from 'date-fns';

export class TimezoneService {
  /**
   * Get current time in a specific timezone
   */
  getCurrentTimeInTimezone(timezone: string): Date {
    const now = new Date();
    return utcToZonedTime(now, timezone);
  }

  /**
   * Calculate UTC timestamp for a target hour on a given date in a specific timezone
   * @param dateString - ISO date string (YYYY-MM-DD)
   * @param timezone - IANA timezone string
   * @param hour - Hour of day
   * @returns UTC timestamp as Date object
   */
  getTargetHourInUTC(dateString: string, timezone: string, hour: number): Date {
    const date = parseISO(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hourStr = String(hour).padStart(2, '0');
    const localDateTimeString = `${year}-${month}-${day}T${hourStr}:00:00`;

    const result = zonedTimeToUtc(localDateTimeString, timezone);
    return result;
  }

  /**
   * Calculate delay in seconds from now until the target hour
   * @param dateString - ISO date string (YYYY-MM-DD)
   * @param timezone - IANA timezone string
   * @param hour - Hour of day
   * @returns Delay in seconds (0 if time has passed, max 900 seconds for SQS)
   */
  calculateDelaySeconds(dateString: string, timezone: string, hour: number = 9): number {
    const targetUTC = this.getTargetHourInUTC(dateString, timezone, hour);
    const now = new Date();
    const delayMs = targetUTC.getTime() - now.getTime();
    const delaySeconds = Math.floor(delayMs / 1000);

    if (delaySeconds < 0) {
      return 0;
    }

    return Math.min(delaySeconds, 900);
  }

  /**
   * Check if a given date is today in a specific timezone (month/day comparison)
   */
  isToday(dateString: string, timezone: string): boolean {
    const date = parseISO(dateString);
    const now = this.getCurrentTimeInTimezone(timezone);

    return date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
  }

  /**
   * Format date to MM-DD for GSI key
   */
  formatMonthDay(dateString: string): string {
    const date = parseISO(dateString);
    return format(date, 'MM-dd');
  }
}
