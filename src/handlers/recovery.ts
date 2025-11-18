import { EventBridgeEvent } from 'aws-lambda';
import { BirthdayService } from '../services/events/birthday-service';
import { UserService } from '../services/user-service';
import { TimezoneService } from '../services/timezone-service';
import { EventService } from '../services/events/event-service';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient } from '../utils/sqs';
import { wasMessageSent } from '../utils/message-status';
import { subDays, parseISO } from 'date-fns';

const QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const RECOVERY_DAYS = parseInt(process.env.RECOVERY_DAYS || '7', 10);
const TARGET_HOUR = Number(process.env.TARGET_HOUR_BIRTHDAY) || 9;

/**
 * Generic recovery function that works with any EventService
 */
async function recoverEvents(eventService: EventService): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error('SQS_QUEUE_URL environment variable is not set');
  }

  const endDate = new Date();
  const startDate = subDays(endDate, RECOVERY_DAYS);
  const eventType = eventService.getEventType();

  console.log(
    `Checking for unsent ${eventType} messages from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  const users = await eventService.getUsersWithEventInRange(startDate, endDate);
  console.log(`Found ${users.length} users with ${eventType} in the range`);

  let recoveredCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    try {
      const eventDate = eventService.getEventDate(user);
      const sent = await wasMessageSent(user.userId, eventDate, eventType);

      if (sent) {
        skippedCount++;
        continue;
      }

      if (!eventService.isEventToday(user)) {
        const eventDateObj = new Date(eventDate);
        const now = new Date();
        if (eventDateObj > now) {
          continue;
        }
      }

      const eventDateParsed = parseISO(eventDate);
      const currentYear = new Date().getFullYear();
      const month = String(eventDateParsed.getMonth() + 1).padStart(2, '0');
      const day = String(eventDateParsed.getDate()).padStart(2, '0');
      const eventThisYear = `${currentYear}-${month}-${day}`;
      const timezoneService = new TimezoneService();
      const targetUTC = timezoneService.getTargetHourInUTC(
        eventThisYear,
        user.timezone,
        TARGET_HOUR
      );

      const messageBody = {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        eventType,
        eventDate,
        timezone: user.timezone,
        targetUTC: targetUTC.toISOString(),
      };

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(messageBody),
          DelaySeconds: 0, // Send immediately for recovery
          // Note: Standard SQS queues don't support MessageDeduplicationId
          // Deduplication is handled in the consumer using DynamoDB conditional writes
        })
      );

      recoveredCount++;
      console.log(`Recovered ${eventType} message for user ${user.userId}`);
    } catch (error) {
      console.error(`Error recovering ${eventType} message for user ${user.userId}:`, error);
    }
  }

  console.log(
    `Recovery completed: ${recoveredCount} ${eventType} messages recovered, ${skippedCount} already sent`
  );
}

/**
 * Birthday recovery handler (convenience function for backward compatibility)
 */
export const recovery = async (
  _event: EventBridgeEvent<'Scheduled Event', unknown>
): Promise<void> => {
  try {
    console.log('Recovery handler triggered at:', new Date().toISOString());
    const timezoneService = new TimezoneService();
    const userService = new UserService(timezoneService);
    const birthdayService = new BirthdayService(timezoneService, userService);
    await recoverEvents(birthdayService);
  } catch (error) {
    console.error('Recovery handler error:', error);
    throw error;
  }
};
