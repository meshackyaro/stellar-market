import Link from "next/link";
import { Star, MapPin, CheckCircle2, User } from "lucide-react";
import { User as UserType } from "@/types";
import Image from "next/image";

interface FreelancerCardProps {
  freelancer: UserType;
}

export default function FreelancerCard({ freelancer }: FreelancerCardProps) {
  const averageRating = freelancer.averageRating || 0;
  const reviewCount = freelancer.reviewCount || 0;

  return (
    <Link href={`/profile/${freelancer.id}`}>
      <div className="card hover:border-stellar-blue/50 transition-all duration-200 cursor-pointer h-full flex flex-col p-6 group">
        <div className="flex items-center gap-4 mb-5">
          <div className="relative w-16 h-16 flex-shrink-0">
            {freelancer.avatarUrl ? (
              <Image
                src={freelancer.avatarUrl}
                alt={freelancer.username}
                fill
                className="rounded-full object-cover border-2 border-theme-border group-hover:border-stellar-blue/30 transition-colors"
                sizes="64px"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gradient-to-br from-stellar-blue/20 to-stellar-purple/20 flex items-center justify-center text-stellar-blue border-2 border-theme-border group-hover:border-stellar-blue/30 transition-colors">
                <User size={32} />
              </div>
            )}
            {freelancer.availability && (
              <div className="absolute bottom-0 right-0 w-4 h-4 bg-theme-success border-2 border-theme-bg rounded-full title='Available'" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-theme-heading mb-1 group-hover:text-stellar-blue transition-colors">
              {freelancer.username}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-theme-text font-medium">
              <div className="flex items-center gap-1 text-yellow-500">
                <Star size={14} fill="currentColor" />
                <span>{averageRating.toFixed(1)}</span>
              </div>
              <span>•</span>
              <span>{reviewCount} {reviewCount === 1 ? 'Review' : 'Reviews'}</span>
            </div>
          </div>
        </div>

        <p className="text-sm text-theme-text mb-6 line-clamp-3 leading-relaxed flex-grow">
          {freelancer.bio || "No bio description provided."}
        </p>

        <div className="flex flex-wrap gap-2 pt-4 border-t border-theme-border mt-auto">
          {freelancer.skills?.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="text-[10px] uppercase tracking-wider font-bold bg-theme-bg border border-theme-border text-theme-text px-2 py-1 rounded-md"
            >
              {skill}
            </span>
          ))}
          {freelancer.skills && freelancer.skills.length > 4 && (
            <span className="text-[10px] font-bold text-stellar-blue px-2 py-1">
              +{freelancer.skills.length - 4}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
