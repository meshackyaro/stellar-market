# Dispute System Setup Guide

## Quick Start

### 1. Apply Database Migration

```bash
cd backend
npx prisma migrate deploy
```

For development with migration creation:
```bash
npx prisma migrate dev
```

### 2. Generate Prisma Client

```bash
npx prisma generate
```

### 3. Run Tests

```bash
npm test src/__tests__/dispute.test.ts
```

Or run all tests:
```bash
npm test
```

## Verification Steps

### Check Database Schema

```bash
npx prisma studio
```

Navigate to the `Dispute` and `DisputeVote` models to verify:
- Dispute has `clientId`, `freelancerId`, `onChainDisputeId` fields
- DisputeStatus enum has OPEN, IN_PROGRESS, RESOLVED values
- DisputeVote model exists (renamed from Vote)

### Test API Endpoints

1. **Create a dispute:**
```bash
curl -X POST http://localhost:3000/api/disputes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jobId": "clxxx...",
    "reason": "The freelancer did not deliver the work as agreed"
  }'
```

2. **Get all disputes:**
```bash
curl http://localhost:3000/api/disputes?status=OPEN&page=1&limit=20
```

3. **Get dispute details:**
```bash
curl http://localhost:3000/api/disputes/clxxx...
```

4. **Cast a vote:**
```bash
curl -X POST http://localhost:3000/api/disputes/clxxx.../votes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "choice": "CLIENT",
    "reason": "The evidence supports the client claim"
  }'
```

5. **Get vote statistics:**
```bash
curl http://localhost:3000/api/disputes/clxxx.../stats
```

6. **Resolve dispute:**
```bash
curl -X PUT http://localhost:3000/api/disputes/clxxx.../resolve \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "outcome": "Resolved in favor of client based on community vote"
  }'
```

## Migration Details

The migration performs the following changes:

1. **Renames Vote table to DisputeVote**
2. **Updates DisputeStatus enum:**
   - Old: OPEN, REVIEWING, VOTING, RESOLVED_CLIENT, RESOLVED_FREELANCER, OVERRIDDEN_BY_ADMIN
   - New: OPEN, IN_PROGRESS, RESOLVED
3. **Adds new Dispute fields:**
   - `clientId` (populated from Job)
   - `freelancerId` (populated from Job)
4. **Renames field:**
   - `contractDisputeId` → `onChainDisputeId`
5. **Removes deprecated fields:**
   - `respondentId`
   - `votesForClient`
   - `votesForFreelancer`
   - `minVotes`
   - `escalated`

## Rollback Plan

If you need to rollback the migration:

```bash
npx prisma migrate resolve --rolled-back 20260325120000_refactor_dispute_system
```

Then manually restore the previous schema version.

## Environment Variables

Ensure your `.env` file has:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/stellarmarket"
STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
STELLAR_ESCROW_CONTRACT_ID="CXXX..."
STELLAR_DISPUTE_CONTRACT_ID="CXXX..."
```

## Common Issues

### Issue: Prisma Client Out of Sync
**Solution:** Run `npx prisma generate`

### Issue: Migration Fails
**Solution:** Check for existing disputes with missing job relations, clean up orphaned records

### Issue: Tests Fail
**Solution:** Ensure test database is clean and migrations are applied

## Next Steps

1. Review the API documentation in `DISPUTE_SYSTEM.md`
2. Test all endpoints with your frontend
3. Configure webhook endpoints for blockchain events
4. Set up monitoring and alerts for dispute creation
5. Implement notification system for dispute participants
