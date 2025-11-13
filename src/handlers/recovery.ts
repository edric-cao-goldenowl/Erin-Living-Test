import { EventBridgeEvent } from 'aws-lambda';
import { BirthdayService } from '../services/birthday-service';
import { EventService } from '../services/event-service';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient } from '../utils/sqs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../utils/dynamodb';
import { subDays, parseISO } from 'date-fns';
import { TimezoneService } from '../services/timezone-service';

const QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const TABLE_NAME = process.env.DYNAMODB_TABLE || '';
const RECOVERY_DAYS = parseInt(process.env.RECOVERY_DAYS || '7', 10);
const TARGET_HOUR = Number(process.env.TARGET_HOUR_BIRTHDAY) || 9;

/**
 * Check if event message was sent for a user
 */
async function wasMessageSent(
  userId: string,
  eventDate: string,
  eventType: string
): Promise<boolean> {
  try {
    // For now, we use lastBirthdayMessageDate for all event types
    const dateField =
      eventType === 'birthday' ? 'lastBirthdayMessageDate' : 'lastBirthdayMessageDate';
    const sentField =
      eventType === 'birthday' ? 'lastBirthdayMessageSent' : 'lastBirthdayMessageSent';

    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId },
        ProjectionExpression: `${dateField}, ${sentField}`,
      })
    );

    if (!result.Item) {
      return false;
    }

    const item = result.Item as {
      [key: string]: string | undefined;
    };

    // Check if message was already sent for this event
    // If date field matches and sent field exists and is from current year
    if (item[dateField] === eventDate && item[sentField]) {
      const currentYear = new Date().getFullYear();
      const sentYear = new Date(item[sentField] as string).getFullYear();
      if (sentYear === currentYear) {
        return true; // Already sent this year
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking message status for user ${userId}:`, error);
    // Assume not sent if we can't check
    return false;
  }
}

/**
 * Generic recovery function that works with any EventService
 */
async function recoverEvents(eventService: EventService): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error('SQS_QUEUE_URL environment variable is not set');
  }

  // Calculate date range for recovery
  const endDate = new Date();
  const startDate = subDays(endDate, RECOVERY_DAYS);
  const eventType = eventService.getEventType();

  console.log(
    `Checking for unsent ${eventType} messages from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  // Get all users with events in the range
  const users = await eventService.getUsersWithEventInRange(startDate, endDate);
  console.log(`Found ${users.length} users with ${eventType} in the range`);

  let recoveredCount = 0;
  let skippedCount = 0;

  // Check each user
  for (const user of users) {
    try {
      const eventDate = eventService.getEventDate(user);

      // Check if message was already sent
      const sent = await wasMessageSent(user.userId, eventDate, eventType);

      if (sent) {
        skippedCount++;
        continue;
      }

      // Check if it's actually their event today (in their timezone)
      if (!eventService.isEventToday(user)) {
        // Not today, but might be in the past range
        // We'll queue it anyway if it's within the recovery window
        const eventDateObj = new Date(eventDate);
        const now = new Date();

        // Only recover if event is in the past (within recovery window)
        if (eventDateObj > now) {
          continue;
        }
      }

      // Calculate targetUTC for recovery
      // For recovery, we calculate the configured target hour for the event date in the current year
      // (even if that hour has passed, we still want to recover the message)
      const eventDateParsed = parseISO(eventDate);
      const currentYear = new Date().getFullYear();
      const month = String(eventDateParsed.getMonth() + 1).padStart(2, '0');
      const day = String(eventDateParsed.getDate()).padStart(2, '0');
      const eventThisYear = `${currentYear}-${month}-${day}`;

      // Calculate the target hour in UTC for the event date in user's timezone
      const targetUTC = TimezoneService.getTargetHourInUTC(
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
      // Continue with next user
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
    const birthdayService = BirthdayService.getInstance();
    await recoverEvents(birthdayService);
  } catch (error) {
    console.error('Recovery handler error:', error);
    throw error;
  }
};
