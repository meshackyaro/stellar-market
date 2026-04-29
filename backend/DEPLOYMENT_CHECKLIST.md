# Dispute System Deployment Checklist

## Pre-Deployment

- [ ] Review all code changes in PR
- [ ] Ensure all team members understand the new API structure
- [ ] Update API documentation for frontend team
- [ ] Backup production database

## Database Migration

- [ ] Test migration on staging environment first
- [ ] Verify data integrity after staging migration
- [ ] Schedule maintenance window for production migration
- [ ] Run migration on production:
  ```bash
  cd backend
  npx prisma migrate deploy
  ```
- [ ] Verify migration success:
  ```bash
  npx prisma studio
  ```
- [ ] Generate Prisma client:
  ```bash
  npx prisma generate
  ```

## Testing

- [ ] Run full test suite:
  ```bash
  npm test
  ```
- [ ] Run dispute-specific tests:
  ```bash
  npm test src/__tests__/dispute.test.ts
  ```
- [ ] Manual API testing on staging:
  - [ ] Create dispute
  - [ ] List disputes with pagination
  - [ ] Get dispute details
  - [ ] Cast vote
  - [ ] Check vote statistics
  - [ ] Resolve dispute
  - [ ] Test webhook endpoint

## Code Deployment

- [ ] Build TypeScript:
  ```bash
  npm run build
  ```
- [ ] Deploy to staging
- [ ] Smoke test on staging
- [ ] Deploy to production
- [ ] Verify production deployment

## Post-Deployment Verification

- [ ] Check application logs for errors
- [ ] Verify dispute endpoints are accessible
- [ ] Test authentication on all protected routes
- [ ] Monitor database performance
- [ ] Check error tracking service (Sentry, etc.)

## Frontend Integration

- [ ] Update frontend API client with new endpoints
- [ ] Remove old dispute flow (init-raise, confirm-tx, etc.)
- [ ] Implement new dispute creation flow
- [ ] Implement voting interface
- [ ] Add vote statistics display
- [ ] Test end-to-end dispute flow

## Monitoring

- [ ] Set up alerts for dispute creation
- [ ] Monitor dispute resolution times
- [ ] Track vote participation rates
- [ ] Monitor webhook success/failure rates
- [ ] Set up dashboard for dispute metrics

## Documentation

- [ ] Update API documentation
- [ ] Update frontend integration guide
- [ ] Document webhook configuration
- [ ] Share deployment notes with team
- [ ] Update changelog

## Rollback Plan

If issues arise:

1. **Immediate rollback:**
   ```bash
   git revert <commit-hash>
   npm run build
   # Redeploy previous version
   ```

2. **Database rollback:**
   ```bash
   npx prisma migrate resolve --rolled-back 20260325120000_refactor_dispute_system
   # Restore from backup if needed
   ```

3. **Communication:**
   - Notify team of rollback
   - Document issues encountered
   - Plan fix and redeployment

## Success Metrics

After 24 hours, verify:
- [ ] No critical errors in logs
- [ ] Disputes can be created successfully
- [ ] Votes are being cast
- [ ] No performance degradation
- [ ] Database queries are performant
- [ ] All tests passing in CI/CD

## Support

- [ ] Brief support team on new dispute flow
- [ ] Provide troubleshooting guide
- [ ] Set up escalation path for issues
- [ ] Monitor support tickets for dispute-related issues

## Sign-off

- [ ] Backend Lead: _______________
- [ ] Frontend Lead: _______________
- [ ] QA Lead: _______________
- [ ] DevOps: _______________
- [ ] Product Owner: _______________

Date: _______________
