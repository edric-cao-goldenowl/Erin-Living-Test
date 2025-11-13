import { SQSEvent, SQSRecord } from 'aws-lambda';
import { MessageService } from '../services/message-service';
import { UserService } from '../services/user-service';
import { MessageFormatter } from '../services/message-formatter';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../utils/dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

interface EventMessage {
  userId: string;
  firstName: string;
  lastName: string;
  eventType: string;
  eventDate: string;
  timezone: string;
  targetUTC: string;
}

// Legacy interface for backward compatibility
interface BirthdayMessage {
  userId: string;
  firstName: string;
  lastName: string;
  birthday?: string; // Optional for backward compatibility
  eventType?: string;
  eventDate?: string;
  timezone: string;
  targetUTC: string;
}

/**
 * Check if message was already sent for this event
 */
async function wasMessageAlreadySent(
  userId: string,
  eventDate: string,
  eventType: string
): Promise<boolean> {
  try {
    // For now, we use lastBirthdayMessageDate for all event types
    // In the future, we could have separate fields per event type
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
    // If we can't check, assume not sent to be safe
    return false;
  }
}

/**
 * Mark message as sent in DynamoDB after successful send
 * Uses conditional write to prevent race conditions
 */
async function markMessageAsSent(
  userId: string,
  eventDate: string,
  eventType: string
): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // For now, we use lastBirthdayMessageDate for all event types
    // In the future, we could have separate fields per event type
    const dateField =
      eventType === 'birthday' ? 'lastBirthdayMessageDate' : 'lastBirthdayMessageDate';
    const sentField =
      eventType === 'birthday' ? 'lastBirthdayMessageSent' : 'lastBirthdayMessageSent';

    await dynamoDBClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId },
        UpdateExpression: `SET ${sentField} = :sentAt, ${dateField} = :eventDate`,
        ConditionExpression: `attribute_not_exists(${dateField}) OR ${dateField} <> :eventDate OR (${dateField} = :eventDate AND (attribute_not_exists(${sentField}) OR ${sentField} = :empty))`,
        ExpressionAttributeValues: {
          ':sentAt': now,
          ':eventDate': eventDate,
          ':empty': '',
        },
      })
    );

    return true;
  } catch (error: unknown) {
    // If condition check fails, message was already sent by another process
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      console.log(`Message already sent for user ${userId} on ${eventDate} (race condition)`);
      return false;
    }
    throw error;
  }
}

/**
 * Process a single event message (generic)
 */
async function processEventMessage(
  message: EventMessage,
  formatter: MessageFormatter
): Promise<void> {
  // Get user to ensure they still exist
  const user = await UserService.getUserById(message.userId);
  if (!user) {
    console.log(`User ${message.userId} not found, skipping message`);
    return;
  }

  // Check if message was already sent (early exit to avoid unnecessary API calls)
  const alreadySent = await wasMessageAlreadySent(
    user.userId,
    message.eventDate,
    message.eventType
  );
  if (alreadySent) {
    console.log(`Message already sent for user ${user.userId}, skipping`);
    return;
  }

  // Send message first
  await MessageService.sendMessage(user, message.eventType, formatter);
  console.log(`Successfully sent ${message.eventType} message to user ${user.userId}`);

  // Only update database after successful send
  const wasMarked = await markMessageAsSent(user.userId, message.eventDate, message.eventType);
  if (!wasMarked) {
    // Another process already marked it, but message was sent successfully
    console.log(`Message sent but already marked by another process for user ${user.userId}`);
  }
}

/**
 * Process a single SQS record
 */
async function processRecord(record: SQSRecord): Promise<void> {
  try {
    const rawMessage: BirthdayMessage | EventMessage = JSON.parse(record.body);

    // Handle legacy messages (backward compatibility)
    if ('birthday' in rawMessage && !rawMessage.eventType) {
      const legacyMessage: BirthdayMessage = rawMessage as BirthdayMessage;
      const eventMessage: EventMessage = {
        userId: legacyMessage.userId,
        firstName: legacyMessage.firstName,
        lastName: legacyMessage.lastName,
        eventType: 'birthday',
        eventDate: legacyMessage.birthday || '',
        timezone: legacyMessage.timezone,
        targetUTC: legacyMessage.targetUTC,
      };
      const formatter = await getMessageFormatter('birthday');
      await processEventMessage(eventMessage, formatter);
      return;
    }

    // Handle new event messages
    const message = rawMessage as EventMessage;
    console.log(`Processing ${message.eventType} message:`, message);
    const formatter = await getMessageFormatter(message.eventType);
    await processEventMessage(message, formatter);
  } catch (error) {
    console.error('Error processing SQS record:', error);
    // Re-throw to trigger DLQ - message was not sent successfully, so don't update DB
    throw error;
  }
}

/**
 * Get message formatter for event type
 */
async function getMessageFormatter(eventType: string): Promise<MessageFormatter> {
  // Import dynamically to avoid circular dependencies
  const { BirthdayMessageFormatter } = await import('../services/message-formatter');

  switch (eventType) {
    case 'birthday':
      return new BirthdayMessageFormatter();
    // Future: case 'anniversary': return new AnniversaryMessageFormatter();
    default:
      // Default to birthday formatter for unknown types
      return new BirthdayMessageFormatter();
  }
}

export const sqsConsumer = async (event: SQSEvent): Promise<void> => {
  console.log(`Received ${event.Records.length} SQS records`);

  const errors: Error[] = [];

  // Process records in parallel (with error handling)
  await Promise.allSettled(
    event.Records.map(async (record) => {
      try {
        await processRecord(record);
      } catch (error) {
        console.error('Failed to process record:', record.messageId, error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    })
  );

  // If any errors occurred, throw to trigger DLQ
  if (errors.length > 0) {
    throw new Error(`Failed to process ${errors.length} records`);
  }

  console.log('Successfully processed all SQS records');
};
