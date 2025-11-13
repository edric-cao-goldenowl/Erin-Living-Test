import { dynamoDBClient } from '../utils/dynamodb';
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { User, CreateUserRequest, UpdateUserRequest } from '../models/user';
import { v4 as uuidv4 } from 'uuid';
import { TimezoneService } from './timezone-service';

const TABLE_NAME = process.env.DYNAMODB_TABLE || '';

export class UserService {
  /**
   * Create a new user
   */
  static async createUser(request: CreateUserRequest): Promise<User> {
    const userId = uuidv4();
    const now = new Date().toISOString();
    const birthdayMonthDay = TimezoneService.formatMonthDay(request.birthday);

    const user: User = {
      userId,
      firstName: request.firstName,
      lastName: request.lastName,
      birthday: request.birthday,
      timezone: request.timezone,
      location: request.location,
      birthdayMonthDay,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDBClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: user,
      })
    );

    return user;
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<User | null> {
    const result = await dynamoDBClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { userId },
      })
    );

    return (result.Item as User) || null;
  }

  /**
   * Update user
   */
  static async updateUser(userId: string, request: UpdateUserRequest): Promise<User | null> {
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      return null;
    }

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};

    if (request.firstName !== undefined) {
      updateExpressions.push('#firstName = :firstName');
      expressionAttributeNames['#firstName'] = 'firstName';
      expressionAttributeValues[':firstName'] = request.firstName;
    }

    if (request.lastName !== undefined) {
      updateExpressions.push('#lastName = :lastName');
      expressionAttributeNames['#lastName'] = 'lastName';
      expressionAttributeValues[':lastName'] = request.lastName;
    }

    if (request.birthday !== undefined) {
      updateExpressions.push('#birthday = :birthday');
      updateExpressions.push('#birthdayMonthDay = :birthdayMonthDay');
      expressionAttributeNames['#birthday'] = 'birthday';
      expressionAttributeNames['#birthdayMonthDay'] = 'birthdayMonthDay';
      expressionAttributeValues[':birthday'] = request.birthday;
      expressionAttributeValues[':birthdayMonthDay'] = TimezoneService.formatMonthDay(
        request.birthday
      );
    }

    if (request.timezone !== undefined) {
      updateExpressions.push('#timezone = :timezone');
      expressionAttributeNames['#timezone'] = 'timezone';
      expressionAttributeValues[':timezone'] = request.timezone;
    }

    if (request.location !== undefined) {
      updateExpressions.push('#location = :location');
      expressionAttributeNames['#location'] = 'location';
      expressionAttributeValues[':location'] = request.location;
    }

    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const result = await dynamoDBClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    return result.Attributes as User;
  }

  /**
   * Delete user
   */
  static async deleteUser(userId: string): Promise<boolean> {
    const result = await dynamoDBClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { userId },
        ReturnValues: 'ALL_OLD',
      })
    );

    return !!result.Attributes;
  }

  /**
   * Query users by birthday month-day
   * @param monthDay - Birthday in MM-DD format
   * @param excludeSentBirthdayDate - Optional: Exclude users who already received message for this birthday date (YYYY-MM-DD)
   * @param currentYearPrefix - Optional: Year prefix (e.g., "2024-") to check if lastBirthdayMessageSent is from current year
   */
  static async getUsersByBirthdayMonthDay(
    monthDay: string,
    excludeSentBirthdayDate?: string,
    currentYearPrefix?: string
  ): Promise<User[]> {
    const queryParams: {
      TableName: string;
      IndexName: string;
      KeyConditionExpression: string;
      ExpressionAttributeValues: Record<string, unknown>;
      FilterExpression?: string;
    } = {
      TableName: TABLE_NAME,
      IndexName: 'birthday-index',
      KeyConditionExpression: 'birthdayMonthDay = :monthDay',
      ExpressionAttributeValues: {
        ':monthDay': monthDay,
      },
    };

    // If excludeSentBirthdayDate is provided, filter out users who already received message THIS YEAR
    // Logic: Exclude if lastBirthdayMessageSent exists and is from current year (already sent this year)
    // Include user if:
    // 1. lastBirthdayMessageSent doesn't exist, OR
    // 2. lastBirthdayMessageSent is empty, OR
    // 3. lastBirthdayMessageSent is NOT from current year (sent in previous year, need to send again this year)
    if (excludeSentBirthdayDate && currentYearPrefix) {
      // Exclude users who already received message this year (lastBirthdayMessageSent starts with current year)
      queryParams.FilterExpression =
        'attribute_not_exists(lastBirthdayMessageSent) OR lastBirthdayMessageSent = :empty OR NOT begins_with(lastBirthdayMessageSent, :currentYearPrefix)';
      queryParams.ExpressionAttributeValues[':empty'] = '';
      queryParams.ExpressionAttributeValues[':currentYearPrefix'] = currentYearPrefix;
    } else if (excludeSentBirthdayDate) {
      // Fallback: only check if lastBirthdayMessageSent exists and is not empty
      queryParams.FilterExpression =
        'attribute_not_exists(lastBirthdayMessageSent) OR lastBirthdayMessageSent = :empty';
      queryParams.ExpressionAttributeValues[':empty'] = '';
    }

    const result = await dynamoDBClient.send(new QueryCommand(queryParams));

    return (result.Items as User[]) || [];
  }
}
