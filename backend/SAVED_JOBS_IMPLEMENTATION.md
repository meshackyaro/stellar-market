# Job Bookmarking and Saved Jobs API Implementation

## Overview

This document describes the implementation of the job bookmarking feature that allows freelancers to save jobs for later review.

## Database Changes

### New Model: SavedJob

Added a new Prisma model to track saved jobs:

```prisma
model SavedJob {
  id           String   @id @default(cuid())
  freelancerId String
  jobId        String
  createdAt    DateTime @default(now())

  freelancer User @relation("SavedJobs", fields: [freelancerId], references: [id], onDelete: Cascade)
  job        Job  @relation("SavedByFreelancers", fields: [jobId], references: [id], onDelete: Cascade)

  @@unique([freelancerId, jobId])
  @@index([freelancerId])
  @@index([jobId])
}
```

### Key Features:

- Unique constraint on `(freelancerId, jobId)` prevents duplicate saves
- Cascade delete ensures saved jobs are removed when the job or user is deleted
- Indexed for efficient queries

### Migration

Created migration: `20260329000000_add_saved_job_model`

## API Endpoints

### 1. POST /api/jobs/:id/save

**Description:** Bookmark a job for later review

**Authentication:** Required (Freelancer only)

**Request:**

```
POST /api/jobs/{jobId}/save
Authorization: Bearer {token}
```

**Response (201):**

```json
{
  "message": "Job saved successfully.",
  "savedJob": {
    "id": "...",
    "freelancerId": "...",
    "jobId": "...",
    "createdAt": "2026-03-29T..."
  }
}
```

**Error Responses:**

- `401`: Unauthorized (no token or invalid token)
- `403`: Only freelancers can save jobs
- `404`: Job not found
- `409`: Job already saved

---

### 2. DELETE /api/jobs/:id/save

**Description:** Remove a bookmarked job

**Authentication:** Required (Freelancer only)

**Request:**

```
DELETE /api/jobs/{jobId}/save
Authorization: Bearer {token}
```

**Response (200):**

```json
{
  "message": "Job unsaved successfully."
}
```

**Error Responses:**

- `401`: Unauthorized
- `403`: Only freelancers can unsave jobs
- `404`: Job was not saved

---

### 3. GET /api/jobs/saved

**Description:** List all saved jobs for authenticated freelancer

**Authentication:** Required (Freelancer only)

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search in title and description
- `skill` (optional): Filter by skill
- `minBudget` (optional): Minimum budget filter
- `maxBudget` (optional): Maximum budget filter

**Request:**

```
GET /api/jobs/saved?page=1&limit=10&search=React
Authorization: Bearer {token}
```

**Response (200):**

```json
{
  "data": [
    {
      "id": "...",
      "title": "...",
      "description": "...",
      "budget": 1000,
      "skills": ["React", "Node.js"],
      "status": "OPEN",
      "client": {
        "id": "...",
        "username": "...",
        "avatarUrl": "..."
      },
      "milestones": [...],
      "_count": {
        "applications": 5
      },
      "savedAt": "2026-03-29T...",
      "isSaved": true
    }
  ],
  "total": 15,
  "page": 1,
  "totalPages": 2
}
```

**Error Responses:**

- `401`: Unauthorized
- `403`: Only freelancers can view saved jobs

---

### 4. GET /api/jobs/:id (Enhanced)

**Description:** Get job details with `isSaved` field

**Enhancement:** Added `isSaved` boolean field to job detail responses when user is authenticated as a freelancer.

**Response:**

```json
{
  "id": "...",
  "title": "...",
  "description": "...",
  "budget": 1000,
  "isSaved": true,  // NEW FIELD
  ...
}
```

- `isSaved: true` - Job is saved by the authenticated freelancer
- `isSaved: false` - Job is not saved, or user is not a freelancer, or user is not authenticated

## Validation Schemas

Added `getSavedJobsQuerySchema` in `backend/src/schemas/job.ts`:

```typescript
export const getSavedJobsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  skill: z.string().optional(),
  minBudget: z.coerce.number().positive().optional(),
  maxBudget: z.coerce.number().positive().optional(),
});
```

## Tests

Created comprehensive integration tests in `backend/src/routes/__tests__/saved-jobs.routes.test.ts`:

### Test Coverage:

1. **POST /api/jobs/:id/save**
   - ✓ Allow freelancer to save a job
   - ✓ Return 409 when trying to save an already saved job
   - ✓ Return 404 when trying to save a non-existent job
   - ✓ Return 403 when client tries to save a job
   - ✓ Return 401 when unauthenticated

2. **GET /api/jobs/saved**
   - ✓ Return saved jobs for authenticated freelancer
   - ✓ Support pagination
   - ✓ Support search filter
   - ✓ Support skill filter
   - ✓ Return 403 when client tries to view saved jobs
   - ✓ Return 401 when unauthenticated

3. **DELETE /api/jobs/:id/save**
   - ✓ Allow freelancer to unsave a job
   - ✓ Return 404 when trying to unsave a job that was not saved
   - ✓ Return 403 when client tries to unsave a job
   - ✓ Return 401 when unauthenticated

4. **GET /api/jobs/:id - isSaved field**
   - ✓ Include isSaved: true when freelancer has saved the job
   - ✓ Include isSaved: false when freelancer has not saved the job
   - ✓ Include isSaved: false when client views a job
   - ✓ Include isSaved: false when unauthenticated user views a job

5. **Cascade delete**
   - ✓ Delete saved jobs when the job is deleted

## Acceptance Criteria Status

✅ Freelancers can save and unsave any open job  
✅ GET /api/jobs/saved returns paginated saved jobs with full details  
✅ Job detail response includes isSaved: true/false when authenticated  
✅ Saving the same job twice returns 409  
✅ Unsaving a job that was not saved returns 404  
✅ Cascade delete saved jobs when the job is deleted  
✅ Integration tests for save, unsave, and list endpoints

## Security Considerations

1. **Role-based access control**: Only freelancers can save/unsave jobs
2. **Authentication required**: All endpoints require valid JWT token
3. **Data isolation**: Users can only see and manage their own saved jobs
4. **Unique constraint**: Prevents duplicate saves at database level

## Performance Optimizations

1. **Database indexes**: Added indexes on `freelancerId` and `jobId` for fast lookups
2. **Unique constraint**: Prevents duplicate entries and enables efficient lookups
3. **Cascade deletes**: Automatic cleanup when jobs or users are deleted
4. **Pagination**: All list endpoints support pagination to handle large datasets

## Future Enhancements

Potential improvements for future iterations:

- Add saved job collections/folders
- Email notifications for saved jobs that are closing soon
- Bulk save/unsave operations
- Export saved jobs list
- Analytics on saved jobs (most saved jobs, save-to-apply conversion rate)
