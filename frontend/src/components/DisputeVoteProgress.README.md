# DisputeVoteProgress Component

A real-time dispute vote progress tracker component that displays voting status and progress for community arbitration disputes.

## Features

- **Real-time Updates**: Automatically polls for dispute updates using the `useDisputeStatus` hook with exponential backoff (2s → 4s → 8s → 16s → 30s max)
- **Visual Progress Bar**: Split progress bar showing votes for client vs freelancer with gradient styling
- **Vote Counting**: Displays current votes (X of Y) with percentage progress
- **Voter Privacy**: Anonymizes voter wallet addresses (e.g., `GABC...XYZ`)
- **Visual Feedback**: Highlights with ring animation when new votes are cast
- **Responsive Design**: Works seamlessly on mobile and desktop
- **Dark Mode Support**: Uses theme CSS variables for consistent theming

## Usage

### Basic Usage

```tsx
import DisputeVoteProgress from "@/components/DisputeVoteProgress";

function DisputePage() {
  return <DisputeVoteProgress disputeId="dispute-123" />;
}
```

### With Voter Details

```tsx
<DisputeVoteProgress disputeId="dispute-123" showVoterDetails={true} />
```

## Props

| Prop               | Type      | Default  | Description                                   |
| ------------------ | --------- | -------- | --------------------------------------------- |
| `disputeId`        | `string`  | Required | The ID of the dispute to track                |
| `showVoterDetails` | `boolean` | `false`  | Whether to display anonymized voter addresses |

## Component Structure

```
DisputeVoteProgress
├── Header (Vote Progress title + vote count)
├── Split Progress Bar (Client vs Freelancer votes)
├── Overall Progress Bar (towards minimum votes)
├── Status Message (votes remaining or ready to resolve)
└── Voter Details (optional, anonymized addresses)
```

## Styling

The component uses Tailwind CSS with custom theme variables:

- `theme-heading`: Text color for headings
- `theme-text`: Muted text color
- `theme-bg-secondary`: Secondary background
- `theme-border`: Border color
- `stellar-blue`: Primary brand color
- `theme-success`: Success state color

### Color Coding

- **Client votes**: Indigo gradient (`indigo-500` to `indigo-600`)
- **Freelancer votes**: Orange gradient (`orange-500` to `orange-600`)
- **Progress bar**: Stellar blue/purple gradient (incomplete) or green gradient (complete)

## Real-time Polling

The component uses the `useDisputeStatus` hook which:

1. Starts polling at 2-second intervals
2. Doubles the interval on each poll (exponential backoff)
3. Caps at 30 seconds maximum
4. Stops polling when dispute reaches terminal status

## Visual Feedback

- **New Vote Animation**: When a new vote is detected, the component displays a blue ring for 2 seconds
- **Smooth Transitions**: All progress bar changes use 500ms ease-out transitions
- **Loading State**: Shows skeleton loader while fetching initial data

## Integration Example

```tsx
// In dispute detail page
import DisputeVoteProgress from "@/components/DisputeVoteProgress";

export default function DisputeDetailPage() {
  const { id } = useParams();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">{/* Main dispute content */}</div>

      <div className="space-y-6">
        {/* Real-time vote progress */}
        <DisputeVoteProgress disputeId={id as string} showVoterDetails={true} />

        {/* Voting form */}
        <div className="card">{/* ... */}</div>
      </div>
    </div>
  );
}
```

## Testing

The component includes comprehensive unit tests covering:

- Loading state rendering
- Vote count display
- Progress percentage calculation
- Status messages (votes remaining vs ready to resolve)
- Voter address anonymization
- Conditional voter details display

Run tests with:

```bash
npm test DisputeVoteProgress.test.tsx
```

## Dependencies

- `react`: Core React library
- `lucide-react`: Icon components (ShieldCheck, Users)
- `@/hooks/useDisputeStatus`: Custom hook for dispute polling
- `@/types`: TypeScript type definitions

## Browser Support

Works in all modern browsers that support:

- CSS Grid
- CSS Custom Properties
- ES6+ JavaScript
- Flexbox

## Accessibility

- Semantic HTML structure
- Color contrast meets WCAG AA standards
- Screen reader friendly text labels
- Keyboard navigation support (inherited from card component)
