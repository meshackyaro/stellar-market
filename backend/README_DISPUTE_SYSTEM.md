# 🎯 Dispute Management System - Complete Guide

## 📚 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [API Reference](#api-reference)
5. [Testing](#testing)
6. [Deployment](#deployment)
7. [Troubleshooting](#troubleshooting)

## Overview

The Dispute Management System is a production-ready solution for handling disputes between clients and freelancers on the StellarMarket platform. It provides:

- ✅ RESTful API for dispute management
- ✅ Blockchain integration for decentralized resolution
- ✅ Community voting mechanism
- ✅ Comprehensive validation and error handling
- ✅ Full test coverage
- ✅ Pagination and filtering

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Apply Database Migration

```bash
npx prisma migrate deploy
npx prisma generate
```

### 3. Run Tests

```bash
npm test src/__tests__/dispute.test.ts
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/disputes`

## Architecture

### Database Schema

```
Dispute
├── id (CUID)
├── jobId (unique)
├── onChainDisputeId (blockchain reference)
├── clientId
├── freelancerId
├── initiatorId
├── reason
├── status (OPEN | IN_PROGRESS | RESOLVED)
├── outcome
├── resolvedAt
├── createdAt
└── updatedAt

DisputeVote
├── id (CUID)
├── disputeId
├── voterId
├── choice (CLIENT | FREELANCER)
├── reason
└── createdAt
```

### Service Layer

**DisputeService** (`src/services/dispute.service.ts`)
- Business logic and validation
- Database operations
- Webhook processing

### API Layer

**DisputeRoutes** (`src/routes/dispute.routes.ts`)
- RESTful endpoints
- Authentication
- Input validation

## API Reference

### Create Dispute

```http
POST /api/disputes
Authorization: Bearer {token}
Content-Type: application/json

{
  "jobId": "clxxx...",
  "reason": "The freelancer did not deliver the work as agreed"
}
```

**Response:** `201 Created`
```json
{
  "id": "clxxx...",
  "jobId": "clxxx...",
  "clientId": "clxxx...",
  "freelancerId": "clxxx...",
  "initiatorId": "clxxx...",
  "reason": "...",
  "status": "OPEN",
  "createdAt": "2026-03-25T12:00:00Z"
}
```

### List Disputes

```http
GET /api/disputes?status=OPEN&page=1&limit=20
```

**Response:** `200 OK`
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

### Get Dispute Details

```http
GET /api/disputes/:id
```

**Response:** `200 OK` - Full dispute with job, participants, votes, attachments

### Cast Vote

```http
POST /api/disputes/:id/votes
Authorization: Bearer {token}
Content-Type: application/json

{
  "choice": "CLIENT",
  "reason": "The evidence supports the client's claim"
}
```

**Response:** `201 Created`

### Get Vote Statistics

```http
GET /api/disputes/:id/stats
```

**Response:** `200 OK`
```json
{
  "total": 15,
  "votesForClient": 9,
  "votesForFreelancer": 6
}
```

### Resolve Dispute

```http
PUT /api/disputes/:id/resolve
Authorization: Bearer {token}
Content-Type: application/json

{
  "outcome": "Resolved in favor of client based on community vote"
}
```

**Response:** `200 OK`

### Process Webhook

```http
POST /api/disputes/webhook
Content-Type: application/json

{
  "type": "DISPUTE_RAISED",
  "disputeId": "clxxx...",
  "onChainDisputeId": "12345"
}
```

**Response:** `200 OK`

## Testing

### Run All Tests

```bash
npm test
```

### Run Dispute Tests Only

```bash
npm test src/__tests__/dispute.test.ts
```

### Test Coverage

The test suite covers:
- ✅ Dispute creation and validation
- ✅ Duplicate prevention
- ✅ Authorization checks
- ✅ Vote casting and validation
- ✅ Vote statistics
- ✅ Dispute resolution
- ✅ Webhook processing

### Manual Testing

Use the examples in `DISPUTE_SETUP.md` for manual API testing with curl or Postman.

## Deployment

### Pre-Deployment Checklist

See `DEPLOYMENT_CHECKLIST.md` for complete checklist.

### Migration Steps

1. **Backup database**
2. **Test on staging:**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   npm test
   ```
3. **Deploy to production:**
   ```bash
   npm run build
   # Deploy built files
   ```
4. **Run migration on production:**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

### Rollback Plan

If issues occur:
```bash
npx prisma migrate resolve --rolled-back 20260325120000_refactor_dispute_system
# Restore from backup
```

## Troubleshooting

### Common Issues

**Issue:** Prisma Client out of sync
```bash
npx prisma generate
```

**Issue:** Migration fails
- Check for orphaned dispute records
- Verify all jobs have valid client and freelancer IDs
- Review migration logs

**Issue:** Tests fail
- Ensure test database is clean
- Verify migrations are applied
- Check environment variables

**Issue:** TypeScript errors in tests
- These are editor warnings only
- Tests will run successfully with Jest
- @types/jest is already installed

### Debug Mode

Enable detailed logging:
```bash
DEBUG=* npm run dev
```

### Database Inspection

```bash
npx prisma studio
```

## Documentation Files

- `DISPUTE_SYSTEM.md` - Complete API and architecture documentation
- `DISPUTE_SETUP.md` - Setup and verification guide
- `DEPLOYMENT_CHECKLIST.md` - Deployment checklist
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `README_DISPUTE_SYSTEM.md` - This file

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review test cases for usage examples
3. Consult API documentation
4. Check application logs

## Contributing

When modifying the dispute system:
1. Update tests to cover new functionality
2. Run full test suite before committing
3. Update documentation
4. Follow existing code patterns
5. Ensure TypeScript types are correct

## License

Part of the StellarMarket platform.
