import { EventBridgeEvent } from 'aws-lambda';
import { BirthdayService } from '../services/birthday-service';
import { EventService, EventSchedule } from '../services/event-service';
import { SendMessageBatchCommand, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import { sqsClient } from '../utils/sqs';
import { User } from '../models/user';

const QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const SQS_BATCH_SIZE = 10; // SQS limit for batch operations

/**
 * Chunk array into smaller arrays of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create SQS message entry from user and schedule
 * Note: DelaySeconds is not used since scheduler runs hourly
 */
function createSQSMessageEntry(
  user: User,
  schedule: EventSchedule,
  eventType: string,
  eventDate: string,
  index: number
): SendMessageBatchRequestEntry {
  const messageBody = {
    userId: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    eventType,
    eventDate,
    timezone: user.timezone,
    targetUTC: schedule.targetUTC.toISOString(),
  };

  return {
    Id: `${user.userId}-${index}`,
    MessageBody: JSON.stringify(messageBody),
    // No DelaySeconds - scheduler runs hourly, so messages are queued when the target hour arrives
  };
}

/**
 * Process a batch of users and send messages to SQS
 */
async function processBatch(
  users: User[],
  eventService: EventService,
  batchIndex: number
): Promise<{ success: number; failed: number }> {
  const entries: SendMessageBatchRequestEntry[] = [];
  let successCount = 0;
  let failedCount = 0;
  const eventType = eventService.getEventType();

  // Prepare message entries for this batch
  for (let i = 0; i < users.length; i++) {
    try {
      const user = users[i];
      const schedule = eventService.calculateSchedule(user);

      // Only queue if schedule is not null (configured target hour has arrived)
      if (schedule === null) {
        console.log(
          `Skipping user ${user.userId} - configured target hour hasn't arrived yet in their timezone`
        );
        continue;
      }

      const eventDate = eventService.getEventDate(user);
      const entry = createSQSMessageEntry(user, schedule, eventType, eventDate, i);
      entries.push(entry);
    } catch (error) {
      console.error(`Error preparing message for user ${users[i].userId}:`, error);
      failedCount++;
    }
  }

  // Send batch to SQS
  if (entries.length > 0) {
    try {
      await sqsClient.send(
        new SendMessageBatchCommand({
          QueueUrl: QUEUE_URL,
          Entries: entries,
        })
      );
      successCount = entries.length;
      console.log(
        `Batch ${batchIndex}: Successfully queued ${successCount} messages, ${failedCount} failed during preparation`
      );
    } catch (error) {
      failedCount += entries.length;
      console.error(`Batch ${batchIndex}: Failed to send batch to SQS:`, error);
      // Log individual user IDs for debugging
      entries.forEach((entry) => {
        console.error(`Failed user ID from entry: ${entry.Id}`);
      });
    }
  }

  return { success: successCount, failed: failedCount };
}

/**
 * Generic scheduler function that works with any EventService
 */
async function scheduleEvents(eventService: EventService): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error('SQS_QUEUE_URL environment variable is not set');
  }

  const eventType = eventService.getEventType();
  const users = await eventService.getUsersWithEventToday();
  console.log(`Found ${users.length} users with ${eventType} today`);

  if (users.length === 0) {
    console.log(`No users with ${eventType} today, scheduler completed`);
    return;
  }

  // Split users into batches of SQS_BATCH_SIZE
  const userBatches = chunkArray(users, SQS_BATCH_SIZE);

  // Process all batches in parallel
  const batchResults = await Promise.allSettled(
    userBatches.map((batch, index) => processBatch(batch, eventService, index))
  );

  // Aggregate statistics
  let totalSuccess = 0;
  let failedBatches = 0;

  batchResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      totalSuccess += result.value.success;
      if (result.value.failed > 0 || result.value.success === 0) {
        failedBatches++;
      }
    } else {
      failedBatches++;
      console.error(`Batch ${index} failed with error:`, result.reason);
    }
  });

  // Throw error if all batches failed
  if (failedBatches === userBatches.length && totalSuccess === 0) {
    throw new Error('All batches failed to process');
  }
}

/**
 * Birthday scheduler (convenience function for backward compatibility)
 */
export const scheduler = async (
  _event: EventBridgeEvent<'Scheduled Event', unknown>
): Promise<void> => {
  try {
    console.log('Scheduler triggered at:', new Date().toISOString());
    const birthdayService = BirthdayService.getInstance();
    await scheduleEvents(birthdayService);
  } catch (error) {
    console.error('Scheduler error:', error);
    throw error;
  }
};
