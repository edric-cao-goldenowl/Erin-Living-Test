# Serverless Birthday Message System

A serverless application built with AWS Lambda, SQS, and DynamoDB that sends birthday messages to users at exactly 9am in their local timezone.

## Architecture Overview

The system is built using the Serverless Framework and consists of the following components:

### Components

- **API Layer**: API Gateway + Lambda functions for user management (POST/DELETE/PUT /user)
  - Uses Zod for request validation
  - Supports location field (city, province, lat, lng) separate from timezone
- **Database**: DynamoDB table with Global Secondary Index (GSI) for efficient birthday queries
  - GSI on `birthdayMonthDay` (MM-DD format) + `timezone` for fast birthday lookups
  - Conditional writes for deduplication
- **Scheduler**: EventBridge-triggered Lambda that runs hourly to check for birthdays
  - **Batch Processing**: Uses `SendMessageBatchCommand` to send up to 10 messages per batch
  - **Parallel Processing**: Processes multiple batches concurrently with `Promise.allSettled`
  - Scales efficiently for thousands of users
- **Message Queue**: SQS queue with delay messages to deliver at 9am local time
  - Max delay: 15 minutes (SQS limit)
  - Messages queued hourly to ensure timely delivery
- **Consumer**: Lambda function triggered by SQS to send messages to hookbin.com
  - Processes messages in parallel (batch size: 10)
  - Uses DynamoDB conditional writes to prevent duplicate sends
  - Failed messages automatically sent to DLQ
- **Recovery**: Separate Lambda for checking and re-queuing unsent messages from past N days
  - Runs daily via EventBridge
  - Checks `lastBirthdayMessageDate` to identify unsent messages
- **Dead Letter Queue (DLQ)**: SQS DLQ for handling failed messages
  - Max receive count: 3
  - 14 days message retention

### Architecture Flow

```
1. User Management API (POST/DELETE/PUT /user)
   └─> DynamoDB (Users Table)

2. EventBridge Scheduler (runs hourly)
   └─> Queries DynamoDB for users with birthdays today
   └─> Calculates UTC time for target hour local time (default 9am)
   └─> Queues messages to SQS with calculated delay

3. SQS Queue
   └─> Triggers SQS Consumer Lambda

4. SQS Consumer Lambda
   └─> Sends HTTP POST to hookbin.com
   └─> Marks message as sent in DynamoDB (prevents duplicates)
   └─> Failed messages go to DLQ

5. Recovery Lambda (runs daily)
   └─> Checks users with birthdays in past N days
   └─> Re-queues unsent messages
```

## Features

- ✅ Send birthday messages at exactly 9am in user's local timezone
- ✅ REST API for user management (POST/DELETE/PUT /user)
- ✅ Automatic recovery of unsent messages
- ✅ Race condition prevention using DynamoDB conditional writes
- ✅ Scalable architecture handling thousands of birthdays per day
- ✅ Dead Letter Queue for failed message retries
- ✅ TypeScript for type safety
- ✅ Comprehensive test coverage

## Prerequisites

- Node.js 20.x or higher
- npm or yarn
- AWS CLI configured with appropriate credentials
- Serverless Framework CLI (`npm install -g serverless`)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
# AWS Configuration
AWS_REGION=ap-southeast-1

# Time send event
TARGET_HOUR_BIRTHDAY=9
# DynamoDB (auto-configured in serverless.yml)
# DYNAMODB_TABLE=birthday-message-system-dev-users

# SQS (auto-configured in serverless.yml)
# SQS_QUEUE_URL=...

# Webhook
HOOKBIN_URL=https://hookbin.com/your-endpoint-url

# Recovery
RECOVERY_DAYS=7
```

### 3. Local Development

For local development, you can use `serverless-offline`:

```bash
npm run offline
```

This will start a local API Gateway server. The API will be available at `http://localhost:3000`.

**Note**: For full local testing including DynamoDB and SQS, consider using [LocalStack](https://localstack.cloud/).

## Deployment

### Deploy to AWS

```bash
# Deploy to dev stage
npm run deploy:dev

# Deploy to production
npm run deploy:prod

# Or use serverless directly
serverless deploy --stage dev
```

## API Documentation

### POST /user

Create a new user.

**Request Body:**

```json
{
  "firstName": "Edric",
  "lastName": "Cao",
  "birthday": "1996-10-09",
  "timezone": "Asia/Ho_Chi_Minh",
  "location": {
    "city": "New York",
    "province": "New York",
    "lat": 40.7128,
    "lng": -74.006
  }
}
```

**Note**:

- `location.lat` and `location.lng` are optional fields
- `location.city` and `location.province` are required
- `timezone` is separate from `location` and is required for scheduling

**Response (201):**

```json
{
  "userId": "uuid-here",
  "firstName": "Edric",
  "lastName": "Cao",
  "birthday": "1996-10-09",
  "timezone": "Asia/Ho_Chi_Minh",
  "location": {
    "city": "Ho Chi Minh",
    "province": "Binh Thanh",
    "lat": 40.7128,
    "lng": -74.006
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Error Responses:**

- `400`: Missing required fields or invalid date format
- `500`: Internal server error

### DELETE /user/{userId}

Delete a user.

**Response (200):**

```json
{
  "message": "User deleted successfully"
}
```

**Error Responses:**

- `400`: userId is required
- `404`: User not found
- `500`: Internal server error

### PUT /user/{userId}

Update user details.

**Request Body:**

```json
{
  "firstName": "Edric",
  "lastName": "Cao",
  "birthday": "1990-01-15",
  "timezone": "Australia/Melbourne",
  "location": {
    "city": "Melbourne",
    "province": "Victoria",
    "lat": -37.8136,
    "lng": 144.9631
  }
}
```

All fields are optional. Only provided fields will be updated.

**Response (200):**

```json
{
  "userId": "uuid-here",
  "firstName": "Edric",
  "lastName": "Cao",
  "birthday": "1990-01-15",
  "timezone": "Australia/Melbourne",
  "location": {
    "city": "Melbourne",
    "province": "Victoria",
    "lat": -37.8136,
    "lng": 144.9631
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T12:00:00Z"
}
```

**Error Responses:**

- `400`: Invalid date format or missing userId
- `404`: User not found
- `500`: Internal server error

## Timezone Format

The system uses IANA timezone strings. Examples:

- `America/New_York` (Eastern Time)
- `America/Los_Angeles` (Pacific Time)
- `Europe/London` (UK Time)
- `Australia/Melbourne` (Australian Eastern Time)
- `Asia/Tokyo` (Japan Standard Time)
- `Asia/Ho_Chi_Minh` (South VietNam)
...

You can find a complete list at: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

## How It Works

### Birthday Message Delivery

1. **Scheduler Lambda** runs every hour via EventBridge
2. Queries DynamoDB for users with birthdays today (using GSI on `birthdayMonthDay`)
3. For each user, calculates the UTC timestamp for target hour in their timezone (default 9am)
4. Calculates delay in seconds (max 900 seconds / 15 minutes for SQS) (current send now not enqueue)
5. Queues message to SQS with the calculated delay
6. Update data to table

### Race Condition Prevention

- **DynamoDB Conditional Writes**: The SQS consumer uses conditional writes to mark messages as sent, preventing duplicate sends
- **Idempotency**: Each message includes user ID and birthday date for deduplication

### Recovery Mechanism

The recovery Lambda runs daily and:

1. Queries users with birthdays in the past N days (default: 7 days)
2. Checks if message was sent (via `lastBirthdayMessageDate` & `lastBirthdayMessageSent` attributes)
3. Re-queues unsent messages to SQS
4. Failed messages from DLQ are also retried

## Testing

### Run Unit Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

## Project Structure

```
├── serverless.yml               # Serverless Framework configuration
├── package.json                 # Runtime dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Jest test configuration
├── docs/
│   └── requirement.txt          # Original challenge brief
├── src/
│   ├── config/
│   │   └── constants.ts         # Shared configuration values
│   ├── handlers/
│   │   ├── recovery.ts          # Recovery Lambda
│   │   ├── scheduler.ts         # EventBridge-triggered scheduler
│   │   ├── sqs-consumer.ts      # SQS consumer
│   │   └── user.ts              # User management API handlers
│   ├── mock/
│   │   └── event.json           # Sample event payloads
│   ├── models/
│   │   └── user.ts              # Domain models and types
│   ├── services/
│   │   ├── birthday-service.ts  # Birthday calculation logic
│   │   ├── event-service.ts     # Scheduler event utilities
│   │   ├── message-formatter.ts # Message templating helpers
│   │   ├── message-service.ts   # Message dispatch logic
│   │   ├── timezone-service.ts  # Timezone utilities
│   │   └── user-service.ts      # User CRUD operations
│   └── utils/
│       ├── dynamodb.ts          # DynamoDB client setup
│       └── sqs.ts               # SQS client setup
├── tests/
│   ├── handlers/
│   │   └── user.test.ts         # Handler-focused tests
│   ├── services/
│   │   ├── birthday-service.test.ts
│   │   ├── message-service.test.ts
│   │   ├── timezone-service.test.ts
│   │   └── user-service.test.ts
│   └── utils/                   # Placeholder for utility tests
└── dist/                        # Compiled JavaScript output
    └── ...                      # Generated at build time
```

## DynamoDB Schema

### Users Table

- **Partition Key**: `userId` (String)
- **Attributes**:
  - `firstName` (String)
  - `lastName` (String)
  - `birthday` (String, ISO date format: YYYY-MM-DD)
  - `timezone` (String, IANA timezone)
  - `birthdayMonthDay` (String, format: MM-DD) - for GSI
  - `createdAt` (String, ISO timestamp)
  - `location` (Json)
  - `updatedAt` (String, ISO timestamp)
  - `lastBirthdayMessageSent` (String, ISO timestamp) - for deduplication
  - `lastBirthdayMessageDate` (String, ISO date) - for deduplication

### Global Secondary Index: `birthday-index`

- **Partition Key**: `birthdayMonthDay` (String, format: MM-DD)
- **Sort Key**: `timezone` (String)
- **Projection**: ALL

This GSI allows efficient queries for users with birthdays on a specific date.

## Scalability Considerations

The system is designed to handle thousands of birthday messages per day efficiently:

- **DynamoDB GSI**: Efficient birthday queries using GSI on `birthdayMonthDay` (MM-DD) + `timezone`
  - Single query retrieves all users with birthdays on a specific date
  - Supports pagination for very large datasets (though current implementation handles typical volumes)

- **SQS Batch Operations**: Scheduler uses `SendMessageBatchCommand` to send up to 10 messages per API call
  - Reduces API calls from N to N/10 (e.g., 1000 users = 100 API calls instead of 1000)
  - Significantly improves throughput and reduces Lambda execution time

- **Parallel Batch Processing**: Scheduler processes multiple batches concurrently using `Promise.allSettled`
  - All batches processed in parallel, not sequentially
  - Failed batches don't block successful ones
  - Can process thousands of users in minutes instead of hours

- **SQS Decoupling**: Messages are queued and processed asynchronously
  - Scheduler doesn't wait for message delivery
  - Consumer processes messages independently
  - System remains responsive even under high load

- **Lambda Concurrency**: SQS consumer processes messages in batches (batch size: 10)
  - Processes up to 10 messages per invocation
  - Automatic scaling based on queue depth
  - Can handle high message volumes efficiently

- **Conditional Writes for Deduplication**: DynamoDB conditional writes prevent race conditions
  - Multiple concurrent messages for same user/birthday are safely handled
  - Only one message succeeds, others are gracefully skipped
  - No duplicate messages sent

- **DLQ**: Failed messages are sent to DLQ for manual inspection and retry
  - Max receive count: 3 before moving to DLQ
  - 14 days retention for troubleshooting
  - Manual retry capability

- **Pay-per-request**: DynamoDB uses on-demand billing for cost efficiency
  - No capacity planning needed
  - Scales automatically with traffic
  - Cost-effective for variable workloads


## Environment Variables

| Variable                | Description                          | Default         |
| ----------------------- | ------------------------------------ | --------------- |
| `AWS_REGION`            | AWS region                           | `us-east-1`     |
| `DYNAMODB_TABLE`        | DynamoDB table name                  | Auto-configured |
| `SQS_QUEUE_URL`         | SQS queue URL                        | Auto-configured |
| `HOOKBIN_URL`           | Webhook URL for sending messages     | Required        |
| `RECOVERY_DAYS`         | Number of days to check for recovery | `7`             |
| `TARGET_HOUR_BIRTHDAY`  | Number of days to check for recovery | `9`             |

## Future Enhancements

The architecture is designed to be extensible. Potential future enhancements:

- Happy anniversary messages
- Custom message templates
- Multiple notification channels (email, SMS, etc.)
- Message scheduling for other events
- Enqueue for delay time

## Author

Edric Cao
