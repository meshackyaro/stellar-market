import Link from "next/link";
import { MapPin, CheckCircle2, User } from "lucide-react";
import { User as UserType } from "@/types";
import Image from "next/image";
import StarRating from "./StarRating";

interface FreelancerCardProps {
  freelancer: UserType;
}

export default function FreelancerCard({ freelancer }: FreelancerCardProps) {
  let averageRating = freelancer.averageRating || 0;
  let reviewCount = freelancer.reviewCount || 0;

  // Use on-chain reputation if available
  if (freelancer.reputation) {
    const totalScore = BigInt(freelancer.reputation.totalScore);
    const totalWeight = BigInt(freelancer.reputation.totalWeight);
    
    if (totalWeight > 0n) {
      averageRating = Number(totalScore) / Number(totalWeight);
    }
    reviewCount = freelancer.reputation.reviewCount;
  }

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
            <div className="mt-1">
              <StarRating rating={averageRating} reviewCount={reviewCount} />
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
