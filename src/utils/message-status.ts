import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDBClient } from './dynamodb';

const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

/**
 * Field names for message status tracking in DynamoDB
 */
export interface MessageStatusFieldNames {
  dateField: string;
  sentField: string;
}

/**
 * Mapping configuration for event types to DynamoDB field names
 * This allows easy extension for new event types without hardcoding field names
 */
const EVENT_TYPE_FIELD_MAPPING: Record<string, MessageStatusFieldNames> = {
  birthday: {
    dateField: 'lastBirthdayMessageDate',
    sentField: 'lastBirthdayMessageSent',
  },
  // Future event types can be added here:
  // anniversary: {
  //   dateField: 'lastAnniversaryMessageDate',
  //   sentField: 'lastAnniversaryMessageSent',
  // },
};

/**
 * Generic interface for DynamoDB message status fields
 * Uses index signature to support any event type field names
 */
export interface MessageStatusFields {
  [key: string]: string | undefined;
}

/**
 * Get field names for message status based on event type
 * @param eventType - Type of event (e.g., 'birthday', 'anniversary')
 * @returns Field names for date and sent timestamp
 * @throws Error if event type is not configured
 */
export function getMessageStatusFields(eventType: string): MessageStatusFieldNames {
  const fields = EVENT_TYPE_FIELD_MAPPING[eventType];

  if (!fields) {
    // Default to birthday fields for backward compatibility and unknown types
    console.warn(`Unknown event type "${eventType}", defaulting to birthday fields`);
    return EVENT_TYPE_FIELD_MAPPING.birthday;
  }

  return fields;
}

/**
 * Check if event message was already sent for a user
 * @param userId - User ID to check
 * @param eventDate - Event date in YYYY-MM-DD format
 * @param eventType - Type of event (e.g., 'birthday', 'anniversary')
 * @returns true if message was already sent this year, false otherwise
 */
export async function wasMessageSent(
  userId: string,
  eventDate: string,
  eventType: string
): Promise<boolean> {
  try {
    const { dateField, sentField } = getMessageStatusFields(eventType);

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

    const item = result.Item as MessageStatusFields;

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
    // Assume not sent if we can't check (fail-safe)
    return false;
  }
}
