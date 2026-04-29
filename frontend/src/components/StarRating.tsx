import { Star, StarHalf } from "lucide-react";

interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  size?: number;
  showCount?: boolean;
  className?: string;
}

export default function StarRating({
  rating,
  reviewCount,
  size = 14,
  showCount = true,
  className = "",
}: StarRatingProps) {
  // Ensure rating is between 0 and 5
  const normalizedRating = Math.max(0, Math.min(5, rating));
  
  const fullStars = Math.floor(normalizedRating);
  const hasHalfStar = normalizedRating % 1 >= 0.25 && normalizedRating % 1 < 0.75;
  const roundedFullStars = normalizedRating % 1 >= 0.75 ? fullStars + 1 : fullStars;
  const emptyStars = 5 - roundedFullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex items-center text-yellow-500">
        {[...Array(roundedFullStars)].map((_, i) => (
          <Star key={`full-${i}`} size={size} fill="currentColor" />
        ))}
        {hasHalfStar && <StarHalf key="half" size={size} fill="currentColor" />}
        {[...Array(Math.max(0, emptyStars))].map((_, i) => (
          <Star key={`empty-${i}`} size={size} className="text-theme-border" />
        ))}
      </div>
      
      <span className="text-xs font-bold text-theme-heading ml-1">
        {normalizedRating.toFixed(1)}
      </span>
      
      {showCount && reviewCount !== undefined && (
        <>
          <span className="text-xs text-theme-text opacity-50">•</span>
          <span className="text-xs text-theme-text font-medium">
            ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
          </span>
        </>
      )}
    </div>
  );
}
