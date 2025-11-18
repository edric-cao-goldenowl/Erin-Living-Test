import { SQSEvent, SQSRecord } from 'aws-lambda';
import { MessageServiceFactory } from '../services/messages/message-service-factory';
import { HookbinDeliveryService } from '../services/messages/deliveries/hookbin-delivery-service';
import { UserService } from '../services/user-service';
import { TimezoneService } from '../services/timezone-service';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from '../utils/dynamodb';
import { wasMessageSent, getMessageStatusFields } from '../utils/message-status';

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
    const { dateField, sentField } = getMessageStatusFields(eventType);

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
  userService: UserService,
  messageServiceFactory: MessageServiceFactory
): Promise<void> {
  const user = await userService.getUserById(message.userId);
  if (!user) {
    console.log(`User ${message.userId} not found, skipping message`);
    return;
  }

  const alreadySent = await wasMessageSent(user.userId, message.eventDate, message.eventType);
  if (alreadySent) {
    console.log(`Message already sent for user ${user.userId}, skipping`);
    return;
  }

  const messageService = messageServiceFactory.create(message.eventType);
  await messageService.sendMessage(user, message.eventType);
  console.log(`Successfully sent ${message.eventType} message to user ${user.userId}`);

  const wasMarked = await markMessageAsSent(user.userId, message.eventDate, message.eventType);
  if (!wasMarked) {
    console.log(`Message sent but already marked by another process for user ${user.userId}`);
  }
}

/**
 * Process a single SQS record
 */
async function processRecord(
  record: SQSRecord,
  userService: UserService,
  messageServiceFactory: MessageServiceFactory
): Promise<void> {
  try {
    const rawMessage: unknown = JSON.parse(record.body);

    // Validate message structure
    if (
      !rawMessage ||
      typeof rawMessage !== 'object' ||
      !('eventType' in rawMessage) ||
      typeof (rawMessage as { eventType: unknown }).eventType !== 'string'
    ) {
      throw new Error('Invalid message format: eventType is required');
    }

    const message = rawMessage as EventMessage;

    // Validate required fields
    if (!message.userId || !message.eventDate || !message.timezone) {
      throw new Error('Invalid message format: missing required fields');
    }

    console.log(`Processing ${message.eventType} message:`, message);
    await processEventMessage(message, userService, messageServiceFactory);
  } catch (error) {
    console.error('Error processing SQS record:', error);
    throw error;
  }
}

export const sqsConsumer = async (event: SQSEvent): Promise<void> => {
  console.log(`Received ${event.Records.length} SQS records`);

  const timezoneService = new TimezoneService();
  const userService = new UserService(timezoneService);
  const deliveryService = new HookbinDeliveryService();
  const messageServiceFactory = new MessageServiceFactory(deliveryService);

  const errors: Error[] = [];

  await Promise.allSettled(
    event.Records.map(async (record) => {
      try {
        await processRecord(record, userService, messageServiceFactory);
      } catch (error) {
        console.error('Failed to process record:', record.messageId, error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    })
  );

  if (errors.length > 0) {
    throw new Error(`Failed to process ${errors.length} records`);
  }

  console.log('Successfully processed all SQS records');
};
