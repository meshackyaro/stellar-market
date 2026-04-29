# Dispute Management System

## Overview

The Dispute Management System provides a production-ready solution for handling disputes between clients and freelancers on the StellarMarket platform. The system integrates with blockchain smart contracts while maintaining a robust off-chain database for efficient querying and management.

## Architecture

### Database Schema

#### DisputeStatus Enum
- `OPEN`: Dispute has been created but no votes cast yet
- `IN_PROGRESS`: Voting is underway
- `RESOLVED`: Dispute has been resolved with an outcome

#### Dispute Model
- `id`: Unique identifier (CUID)
- `jobId`: Reference to the disputed job (unique - one dispute per job)
- `onChainDisputeId`: Blockchain dispute identifier
- `clientId`: Job client user ID
- `freelancerId`: Job freelancer user ID
- `initiatorId`: User who raised the dispute
- `reason`: Dispute reason (min 10 characters)
- `status`: Current dispute status
- `outcome`: Resolution description
- `resolvedAt`: Timestamp of resolution
- `createdAt`, `updatedAt`: Audit timestamps

#### DisputeVote Model
- `id`: Unique identifier (CUID)
- `disputeId`: Reference to dispute
- `voterId`: User who cast the vote
- `choice`: "CLIENT" or "FREELANCER"
- `reason`: Vote justification (min 10 characters)
- `createdAt`: Vote timestamp
- Unique constraint on `(disputeId, voterId)` prevents duplicate votes

## API Endpoints

### GET /api/disputes
Get all disputes with optional filtering and pagination.

**Query Parameters:**
- `status` (optional): Filter by DisputeStatus
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20, max: 100): Items per page

**Response:**
```json
{
  "disputes": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### GET /api/disputes/:id
Get detailed information about a specific dispute.

**Response:** Full dispute object with job, participants, votes, and attachments.

### POST /api/disputes
Create a new dispute (requires authentication).

**Request Body:**
```json
{
  "jobId": "clxxx...",
  "reason": "The freelancer did not deliver as agreed..."
}
```

**Business Rules:**
- Only job participants (client or freelancer) can raise disputes
- Job must have an assigned freelancer
- Only one dispute allowed per job
- Automatically sets job status to DISPUTED

### POST /api/disputes/:id/votes
Cast a vote on a dispute (requires authentication).

**Request Body:**
```json
{
  "choice": "CLIENT",
  "reason": "The evidence supports the client's claim..."
}
```

**Business Rules:**
- Cannot vote on resolved disputes
- Dispute participants (client/freelancer) cannot vote
- One vote per user per dispute
- First vote changes status from OPEN to IN_PROGRESS

### GET /api/disputes/:id/stats
Get vote statistics for a dispute.

**Response:**
```json
{
  "total": 15,
  "votesForClient": 9,
  "votesForFreelancer": 6
}
```

### PUT /api/disputes/:id/resolve
Resolve a dispute (requires authentication, typically admin).

**Request Body:**
```json
{
  "outcome": "Resolved in favor of client based on community vote..."
}
```

**Effects:**
- Sets dispute status to RESOLVED
- Records outcome and resolution timestamp
- Updates job status to COMPLETED

### POST /api/disputes/webhook
Process blockchain webhook events.

**Request Body:**
```json
{
  "type": "DISPUTE_RAISED" | "VOTE_CAST" | "DISPUTE_RESOLVED",
  "disputeId": "clxxx...",
  "onChainDisputeId": "12345",
  "metadata": {...}
}
```

## Service Layer

### DisputeService

#### createDispute(jobId, initiatorId, reason)
Creates a new dispute with validation and job status updates.

#### getDisputeById(id)
Retrieves full dispute details with all relations.

#### getDisputes(filters, pagination)
Queries disputes with filtering and pagination support.

#### castVote(disputeId, voterId, choice, reason)
Records a vote with duplicate prevention and participant checks.

#### resolveDispute(disputeId, outcome)
Marks dispute as resolved and updates job status.

#### processWebhook(payload)
Handles blockchain event synchronization.

#### getVoteStats(disputeId)
Calculates vote tallies for a dispute.

## Testing

Run the integration test suite:

```bash
npm test src/__tests__/dispute.test.ts
```

### Test Coverage
- Dispute creation and validation
- Duplicate dispute prevention
- Non-participant rejection
- Vote casting and duplicate prevention
- Participant voting prevention
- Vote statistics calculation
- Dispute resolution
- Webhook processing

## Migration

Apply the database migration:

```bash
npx prisma migrate deploy
```

Or for development:

```bash
npx prisma migrate dev
```

Generate Prisma client:

```bash
npx prisma generate
```

## Security Considerations

1. **Authentication**: All write operations require authentication
2. **Authorization**: Participants-only dispute creation, non-participants-only voting
3. **Duplicate Prevention**: Unique constraints prevent duplicate disputes and votes
4. **Input Validation**: Zod schemas validate all inputs
5. **SQL Injection**: Prisma ORM provides parameterized queries

## Future Enhancements

- Automated resolution based on vote thresholds
- Appeal mechanism for disputed resolutions
- Reputation-weighted voting
- Time-based voting deadlines
- Evidence attachment management
- Email notifications for dispute events
- Admin override capabilities with audit logging
